import {Prisma,type PrismaClient} from '@prisma/client';
import {hash} from '@/domain/players/metadata';
import {conditionHash,conditionSchema,type RankCondition} from '@/domain/rewards/resolution';
import {referenceWindow,referenceEvidenceSchema,validateReferenceSnapshot} from '@/domain/reference/snapshot';
import {collectionPolicy} from '@/domain/collection/policy';
import {collectionPlanSchema,segmentQuerySchema,splitSegment,planHash} from '@/domain/players/collection-plan';
import {safetyStatus} from '@/infrastructure/fconline-data-center/safety';
import {definitions} from './reward-resolution';
import {planCollection,createCollectionRun} from './price-collection';
import {planIncremental} from './incremental-prices';

export function currentReferenceDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export async function rankInventory(db:PrismaClient){
 const pools=await db.rewardPoolVersion.findMany({where:{behavior:'PLAYER_POOL'},include:{itemVersion:true,snapshot:true,entries:{orderBy:{position:'asc'}}},orderBy:{id:'asc'}});
 const seasons=await db.season.findMany();
 return pools.map(p=>{
  const sn=/^official-pool-(\d+)-v1$/.exec(p.id)?.[1],d=sn?definitions[sn]:undefined,season=d?seasons.find(s=>s.name.startsWith(d.classPrefix)):undefined;
  const condition:RankCondition|null=d&&season?{poolId:p.id,rawHash:hash(p.itemVersion.name+'\n'+p.conditionRaw),seasonId:season.id,enhancements:d.enhancements,minOvr:d.minOvr,ovrBasis:d.minOvr===null?'NONE':'UNKNOWN',excludeUnavailable:true,top:d.top}:null;
  return {poolId:p.id,itemId:p.itemVersionId,name:p.itemVersion.name,sourceUrl:p.snapshot.sourceUrl,sourceHash:p.snapshot.contentHash,sourceSnapshotId:p.snapshotId,officialWording:p.conditionRaw,referenceWording:'개봉일 0~1시 사이 기준가',condition,conditionVersion:condition?conditionHash(condition):null,
   normalization:{classIds:season?[season.id]:null,enhancementLevels:d?.enhancements??null,minimumOvr:d?.minOvr??null,ovrBasis:d?.minOvr===null?'NONE':'UNKNOWN',maximumOvr:null,creationRestriction:'NEEDS_VERIFICATION',excludedPlayers:null,tradability:'NEEDS_VERIFICATION',tieRule:'UNKNOWN',rankLimit:d?.top??null,referenceRule:'OPEN_DATE_WINDOW',operationalTimezone:'Asia/Seoul',officialTimezoneVerified:false},
   unknowns:['CREATION_RESTRICTIONS_UNKNOWN','EXCLUSIONS_UNKNOWN','CANDIDATE_UNIVERSE_UNKNOWN','AUTHORITATIVE_REFERENCE_TIME_UNKNOWN','SOURCE_TIMEZONE_NOT_EXPLICIT','TIE_RULE_UNKNOWN',...(d?.minOvr!==null?['OVR_BASIS_UNKNOWN']:[])],
   verificationStatus:'NEEDS_VERIFICATION',entries:p.entries.map(e=>({rewardDefinitionId:e.id,rank:e.rank,officialWording:e.rewardLabel,conditionRaw:e.conditionRaw,probabilityRaw:e.probabilityRaw,numerator:e.numerator.toFixed(0)}))};
 });
}
export async function referencePlan(db:PrismaClient,poolId:string,date:string){
 const window=referenceWindow(date),inventory=(await rankInventory(db)).find(p=>p.poolId===poolId);
 if(!inventory?.condition)throw new Error('Unsupported rank reward');
 if(inventory.entries.length!==inventory.condition.top||inventory.entries.some((e,i)=>e.rank!==i+1))throw new Error('Rank definition coverage mismatch');
 const base=await planCollection(db,{pack:poolId}),partitions=await planIncremental(db,collectionPolicy());
 const segments=partitions.reconciliationPlan.segments.filter(s=>s.query.seasonId===inventory.condition!.seasonId).map(s=>({...s,query:{...s.query,enhancements:base.enhancements}}));
 const plan=collectionPlanSchema.parse({...base,mode:'REFERENCE',segments});
 const policy=collectionPolicy(),safety=await safetyStatus(db,policy);
 const players=plan.expectedPlayers.length,variants=players*plan.enhancements.length;
 const priceRequests=partitions.summary.rows.find(r=>r.seasonId===inventory.condition!.seasonId)!.estimatedRequests,httpRequests=priceRequests+Math.ceil(priceRequests/Math.max(1,policy.PRICE_COLLECTION_MAX_REQUESTS_PER_RUN-1));
 const delaySeconds=httpRequests*policy.PRICE_COLLECTION_REQUEST_DELAY_MS/1000;
 const timeoutSeconds=Number(process.env.REQUEST_TIMEOUT_MS??30000)/1000,retries=Number(process.env.MAX_RETRIES??2);
 const conservativeSeconds=httpRequests*(policy.PRICE_COLLECTION_REQUEST_DELAY_MS/1000+timeoutSeconds*(retries+1));
 const remainingSeconds=Math.max(0,(window.end.getTime()-Math.max(window.start.getTime(),Date.now()))/1000);
 return {inventory,plan,window:{start:window.start.toISOString(),end:window.end.toISOString(),timezone:window.timezone},cost:{players,variants,priceRequests,httpRequests,delaySeconds,conservativeSeconds,windowSeconds:3600,remainingSeconds,fitsWindow:conservativeSeconds<=remainingSeconds,fitsConfiguredBudget:httpRequests<=Math.min(policy.PRICE_COLLECTION_MAX_REQUESTS_PER_HOUR,policy.PRICE_COLLECTION_MAX_REQUESTS_PER_DAY,policy.PRICE_COLLECTION_MAX_REQUESTS_PER_RUN),fitsAvailableBudget:httpRequests<=Math.min(safety.remaining.hour,safety.remaining.day,safety.remaining.run),exact:false,candidateScope:'METADATA_SUPERSET_NOT_VERIFIED'},safety};
}
export async function scheduleReference(db:PrismaClient,poolId:string,date:string){
 const p=await referencePlan(db,poolId,date),c=p.inventory.condition!,id=`rank-${hash(`${poolId}:${date}:${conditionHash(c)}:${p.plan.metadataDatasetId}`)}`;
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(41047001)::text`;
  const existing=await tx.playerPriceRankSnapshot.findUnique({where:{id}});if(existing)return existing;
  const missed=new Date(p.window.end)<=new Date(),infeasible=!p.cost.fitsWindow||!p.cost.fitsConfiguredBudget;
  // Creation is DB-only. Source requests always go through the central price job.
  const run=missed||infeasible?null:await createCollectionRun(tx as unknown as PrismaClient,p.plan);
  const candidates=p.plan.expectedPlayers.flatMap(player=>p.plan.enhancements.map(e=>`${player.spid}-${e}`));
  return tx.playerPriceRankSnapshot.create({data:{id,poolId,referenceDate:date,windowStart:new Date(p.window.start),windowEnd:new Date(p.window.end),conditionHash:conditionHash(c),condition:c,complete:false,candidateCount:candidates.length,pricedCount:0,tiePolicy:'UNKNOWN',sourceUrl:'https://fconline.nexon.com/datacenter',datasetVersion:p.plan.metadataDatasetId,verificationStatus:'NEEDS_VERIFICATION',resolutionStatus:'UNRESOLVED',status:missed?'MISSED':infeasible?'INCOMPLETE':'PLANNED',runId:run?.id,
   evidence:{eligibilityVerified:false,referenceRuleVerified:false,candidateScopeVerified:false,sourceUrl:'https://fconline.nexon.com/datacenter',sourceHash:p.inventory.sourceHash,candidateVariantIds:candidates,unknowns:p.inventory.unknowns},audit:{cost:p.cost,ruleSourceSnapshotId:p.inventory.sourceSnapshotId,ruleSourceUrl:p.inventory.sourceUrl,officialWording:p.inventory.officialWording,issues:missed?['MISSED_WINDOW']:infeasible?['WINDOW_OR_BUDGET_INFEASIBLE']:p.inventory.unknowns}}});
 },{timeout:30000});
}
export async function expireReferenceWindows(db:PrismaClient,now=new Date()){
 const pending=await db.playerPriceRankSnapshot.findMany({where:{status:{in:['PLANNED','COLLECTING']},windowEnd:{lte:now},verificationStatus:{not:'VERIFIED'}}});
 for(const s of pending)await finalizeReference(db,s.id,now);
}
export async function dueReference(db:PrismaClient,now=new Date()){
 return db.playerPriceRankSnapshot.findFirst({where:{status:{in:['PLANNED','COLLECTING']},windowStart:{lte:now},windowEnd:{gt:now},runId:{not:null}},orderBy:{windowEnd:'asc'}});
}
export async function finalizeReference(db:PrismaClient,id:string,now=new Date()){
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(41047001)::text`;
  const s=await tx.playerPriceRankSnapshot.findUniqueOrThrow({where:{id}});
  if(s.verificationStatus==='VERIFIED')return s;
  const condition=conditionSchema.parse(s.condition),evidence=referenceEvidenceSchema.parse(s.evidence);
  const run=s.runId?await tx.priceCollectionRun.findUnique({where:{id:s.runId},include:{segments:true}}):null;
  const prices=run?await tx.playerPriceSnapshot.findMany({where:{snapshotId:{in:run.segments.flatMap(g=>g.status==='SUCCEEDED'&&g.snapshotId?[g.snapshotId]:[])}},include:{variant:{include:{player:true}},snapshot:true}}):[];
  const rule=await tx.rewardPoolVersion.findUniqueOrThrow({where:{id:s.poolId},include:{itemVersion:true,snapshot:true}});
  const expectedWindow=referenceWindow(s.referenceDate);
  const frozen=run?collectionPlanSchema.parse(run.plan):null;
  const structureVerified=!!run&&!!frozen&&run.mode==='REFERENCE'&&frozen.targetPoolId===s.poolId&&frozen.metadataDatasetId===s.datasetVersion&&conditionHash(condition)===s.conditionHash&&condition.rawHash===hash(rule.itemVersion.name+'\n'+rule.conditionRaw)&&rule.snapshot.contentHash===evidence.sourceHash&&rule.verificationStatus==='VERIFIED'&&s.windowStart.getTime()===expectedWindow.start.getTime()&&s.windowEnd.getTime()===expectedWindow.end.getTime()&&evidence.candidateVariantIds.length===frozen.expectedPlayers.length*frozen.enhancements.length&&frozen.expectedPlayers.every(p=>frozen.enhancements.every(e=>evidence.candidateVariantIds.includes(`${p.spid}-${e}`)))&&planHash(frozen)===run.planHash&&frozen.segments.every(p=>run.segments.some(g=>g.key===p.key&&JSON.stringify(segmentQuerySchema.parse(g.query))===JSON.stringify(p.query)))&&run.segments.every(g=>g.status!=='SPLIT'||(()=>{const children=splitSegment(segmentQuerySchema.parse(g.query));return children.length===2&&children.every(q=>run.segments.some(child=>child.parentKey===g.key&&JSON.stringify(segmentQuerySchema.parse(child.query))===JSON.stringify(q)));})());
  const checked=validateReferenceSnapshot({id:s.id,date:s.referenceDate,condition,evidence,datasetVersion:s.datasetVersion,now:now.getTime(),structureVerified,segments:run?.segments.map(g=>({status:g.status,truncated:(g.retrievedCount??0)>=200}))??[],rows:prices.map(p=>({variantId:p.variantId,priceSnapshotId:p.id,spid:p.variant.spid,name:p.variant.player.name,seasonId:p.variant.player.seasonId,enhancement:p.variant.enhancement,price:p.price.toFixed(0),observedAt:p.observedAt.toISOString(),referenceAt:p.referenceAt?.toISOString()??null,ovr:p.ovr,verified:p.verificationStatus==='VERIFIED'&&['OFFICIAL_WEB','OFFICIAL_API'].includes(p.snapshot.source)}))});
  const complete=!!run&&run.segments.length>0&&run.segments.every(g=>['SUCCEEDED','SPLIT'].includes(g.status))&&checked.pricedCount===checked.candidateCount;
  const status=checked.verified?'VERIFIED':now<s.windowStart?'PLANNED':!complete&&now<s.windowEnd&&run&&!['FAILED','BLOCKED'].includes(run.status)?'COLLECTING':now>=s.windowEnd&&!prices.length?'MISSED':!complete?'INCOMPLETE':'UNRESOLVED';
  const times=prices.map(p=>p.observedAt.getTime());
  if(checked.verified){
   await tx.playerPriceRankEntry.createMany({data:checked.entries.map(e=>({id:`${s.id}-${e.variantId}`,snapshotId:s.id,rank:e.rank,variantId:e.variantId,priceSnapshotId:e.priceSnapshotId,available:true}))});
  }
  return tx.playerPriceRankSnapshot.update({where:{id:s.id},data:{status,complete,candidateCount:checked.candidateCount,pricedCount:checked.pricedCount,verificationStatus:checked.verified?'VERIFIED':'NEEDS_VERIFICATION',resolutionStatus:checked.verified?'RESOLVED':'UNRESOLVED',tiePolicy:checked.verified?'NO_TIES':'UNKNOWN',verifiedAt:checked.verified?now:null,collectionStartedAt:run?.startedAt,collectionCompletedAt:run?.finishedAt,observedWindowStart:times.length?new Date(Math.min(...times)):null,observedWindowEnd:times.length?new Date(Math.max(...times)):null,audit:{...((s.audit as Prisma.JsonObject)??{}),issues:checked.issues,coverage:checked.coverage,tieCount:checked.tieCount,cutoffTie:checked.cutoffTie,completedSegments:run?.segments.filter(g=>g.status==='SUCCEEDED').length??0,failedSegments:run?.segments.filter(g=>['FAILED','BLOCKED'].includes(g.status)).length??0,truncatedSegments:run?.segments.filter(g=>(g.retrievedCount??0)>=200&&g.status!=='SPLIT').length??0,missing:Math.max(0,checked.candidateCount-checked.pricedCount)}}});
 },{timeout:30000});
}
export async function referenceStatus(db:PrismaClient,poolId:string,date?:string,rank?:number){
 const inventory=(await rankInventory(db)).find(p=>p.poolId===poolId);if(!inventory)return null;
 const snapshots=await db.playerPriceRankSnapshot.findMany({where:{poolId,...(date?{referenceDate:date}:{})},orderBy:{referenceDate:'desc'},take:30});
 // Only immutable VERIFIED rank entries are exposed as an actual player pool.
 const verified=snapshots.filter(s=>s.verificationStatus==='VERIFIED'&&s.resolutionStatus==='RESOLVED'&&s.conditionHash===inventory.conditionVersion);
 const selected=date&&verified.length===1?verified[0]:undefined;
 const entries=selected?await db.playerPriceRankEntry.findMany({where:{snapshotId:selected.id,rank:rank??{lte:inventory.condition?.top}},orderBy:{rank:'asc'},take:50,include:{variant:{include:{player:true}},priceSnapshot:true}}):[];
 return {inventory,policy:'EXPLICIT_REFERENCE_DATE_NO_CURRENT_FALLBACK',snapshots:snapshots.map(s=>({...s,evidence:undefined})),selectedSnapshotId:selected?.id??null,entries:entries.map(e=>({rank:e.rank,spid:e.variant.spid,name:e.variant.player.name,enhancement:e.variant.enhancement,referencePrice:e.priceSnapshot.price.toFixed(0),referenceAt:e.priceSnapshot.referenceAt,observedAt:e.priceSnapshot.observedAt,sourceObservationId:e.priceSnapshotId}))};
}
