import type {PrismaClient} from '@prisma/client';
import {collectionPlanSchema,segmentQuerySchema} from '@/domain/players/collection-plan';
export async function freshQueryCache(db:PrismaClient,runId:string,sourceHours=2){
 const run=await db.priceCollectionRun.findUniqueOrThrow({where:{id:runId}}),plan=collectionPlanSchema.parse(run.plan);
 const candidates=await db.priceCollectionSegment.findMany({where:{runId:{not:runId},status:'SUCCEEDED',observedAt:{gte:new Date(Date.now()-sourceHours*3600000)},snapshotId:{not:null}},select:{query:true,run:{select:{plan:true}}}});
 return plan.segments.every(segment=>candidates.some(c=>{
  const q=segmentQuerySchema.parse(c.query),wanted=segment.query,old=collectionPlanSchema.parse(c.run.plan);
  return old.metadataDatasetId===plan.metadataDatasetId&&q.seasonId===wanted.seasonId&&q.ovrMin===wanted.ovrMin&&q.ovrMax===wanted.ovrMax&&q.selectedEnhancement===wanted.selectedEnhancement&&wanted.enhancements.every(e=>q.enhancements.includes(e));
 }));
}
