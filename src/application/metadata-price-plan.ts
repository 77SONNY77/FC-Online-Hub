import {Prisma,type PrismaClient} from '@prisma/client';
import {collectionPlanSchema,planHash,type CollectionPlan} from '@/domain/players/collection-plan';
import {planFullMarket} from './full-market';

export function changedMetadataClasses(before:CollectionPlan,after:CollectionPlan){
 const old=new Map(before.expectedPlayers.map(p=>[p.spid,p]));
 return [...new Set(after.expectedPlayers.filter(p=>!old.has(p.spid)||old.get(p.spid)!.name!==p.name||old.get(p.spid)!.seasonId!==p.seasonId).map(p=>p.seasonId))];
}
// A metadata revision creates a new immutable plan. Transfer only checkpoints for
// unchanged class membership/names, retaining their actual observation timestamps.
// No prices/history are deleted, and the old run remains an auditable record.
export async function rebaseBootstrapMetadata(db:PrismaClient){
 const latest=await db.playerDataset.findFirst({orderBy:{observedAt:'desc'},select:{id:true}});
 const previous=await db.priceCollectionRun.findFirst({where:{mode:'FULL'},orderBy:{createdAt:'desc'},include:{segments:true}});
 if(!latest||!previous)return null;
 const before=collectionPlanSchema.parse(previous.plan);if(before.metadataDatasetId===latest.id)return null;
 const after=await planFullMarket(db),changed=new Set(changedMetadataClasses(before,after));
 for(const s of after.segments){
  const oldIds=before.expectedPlayers.filter(p=>p.seasonId===s.query.seasonId).map(p=>p.spid).sort().join(',');
  const newIds=after.expectedPlayers.filter(p=>p.seasonId===s.query.seasonId).map(p=>p.spid).sort().join(',');
  if(oldIds!==newIds)changed.add(s.query.seasonId);
 }
 const plan=collectionPlanSchema.parse({...after,segments:after.segments.map(s=>({...s,priority:changed.has(s.query.seasonId)?10000:0}))});
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(41047002)::text`;
  const current=await tx.priceCollectionRun.findFirst({where:{mode:'FULL'},orderBy:{createdAt:'desc'}});
  if(current&&collectionPlanSchema.parse(current.plan).metadataDatasetId===latest.id)return current;
  const run=await tx.priceCollectionRun.create({data:{mode:'FULL',plan:plan as unknown as Prisma.InputJsonValue,planHash:planHash(plan)}});
  for(const root of plan.segments){
   const inherited=changed.has(root.query.seasonId)?[]:previous.segments.filter(s=>(s.query as {seasonId:number}).seasonId===root.query.seasonId);
   if(!inherited.length){await tx.priceCollectionSegment.create({data:{runId:run.id,key:root.key,query:root.query,expectedCount:root.expectedCount,priority:root.priority}});continue;}
   for(const s of inherited){const valid=['SUCCEEDED','SPLIT'].includes(s.status);await tx.priceCollectionSegment.create({data:{runId:run.id,key:s.key,query:s.query!,parentKey:s.parentKey,expectedCount:s.expectedCount,priority:s.priority,status:valid?s.status:'PENDING',observedAt:valid?s.observedAt:null,retrievedCount:valid?s.retrievedCount:null,result:valid?{...(s.result as object??{}),checkpointSourceSegmentId:s.id}:Prisma.JsonNull}});}
  }
  const pending=await tx.priceCollectionSegment.count({where:{runId:run.id,status:{notIn:['SUCCEEDED','SPLIT']}}});
  return pending?run:tx.priceCollectionRun.update({where:{id:run.id},data:{status:'COMPLETE',finishedAt:previous.finishedAt}});
 },{timeout:30000});
}
