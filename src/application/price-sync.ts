import {freshnessConfig} from '@/domain/collection/freshness';
import {rebaseBootstrapMetadata} from './metadata-price-plan';
import {dueObservation,finalizeObservation} from './price-observation';
import {dueReference,expireReferenceWindows,scheduleReference,finalizeReference} from './reference-snapshots';
import {randomUUID} from 'node:crypto';
import {Prisma, type PrismaClient} from '@prisma/client';
import {collectionPolicy} from '@/domain/collection/policy';
import {selectSyncWork, syncConfig} from '@/domain/collection/sync';
import {collectionPlanSchema, type CollectionPlan, inKstCollectionWindow} from '@/domain/players/collection-plan';
import {dataCenterSource, safetyStatus} from '@/infrastructure/fconline-data-center/safety';
import {planIncremental} from './incremental-prices';
import {planFullMarket, fullMarketStatus} from './full-market';
import {createCollectionRun, planCollection} from './price-collection';
import {safeCollect} from './safe-price-collection';
import {executionEfficiency} from './collection-efficiency';

export async function planPriceSync(db:PrismaClient, now=new Date()) {
 const config=syncConfig(), policy=collectionPolicy();
 const [state,safety,last,bootstrap,reconciliation,incremental]=await Promise.all([
  db.priceSyncState.findUnique({where:{id:dataCenterSource}}),safetyStatus(db,policy),
  db.priceSyncJob.findFirst({where:{type:'FULL_RECONCILIATION',status:'COMPLETE'},orderBy:{startedAt:'desc'}}),
  db.priceCollectionRun.findFirst({where:{mode:'FULL'},orderBy:{createdAt:'desc'}}),
  db.priceCollectionRun.findFirst({where:{mode:'RECONCILIATION',status:{notIn:['COMPLETE','BLOCKED']}},orderBy:{createdAt:'asc'}}),
  planIncremental(db,policy,now),
 ]);
 const blocked=state?.pausedUntil&&state.pausedUntil>now?'SOURCE_PAUSED':!safety.enabled?'COLLECTION_DISABLED':safety.circuit==='OPEN'?'CIRCUIT_OPEN':safety.active?'COLLECTOR_ALREADY_ACTIVE':!safety.remaining.hour||!safety.remaining.day?'REQUEST_BUDGET_EXHAUSTED':null;
 const referenceSnapshot=await dueReference(db,now);
 const referenceRun=referenceSnapshot?.runId?await db.priceCollectionRun.findUnique({where:{id:referenceSnapshot.runId}}):null;
 const reference=!!referenceSnapshot;
 const refCost=(referenceSnapshot?.audit as {cost?:{httpRequests:number;conservativeSeconds:number}}|null)?.cost;
 const referenceBlocked=referenceSnapshot&&refCost&&(refCost.httpRequests>Math.min(safety.remaining.hour,safety.remaining.day,safety.remaining.run)||refCost.conservativeSeconds>(referenceSnapshot.windowEnd.getTime()-now.getTime())/1000)?'REFERENCE_WINDOW_OR_BUDGET_INFEASIBLE':null;
 const hot=incremental.plan?.segments.some(s=>incremental.summary.hotClasses.includes(s.query.seasonId))??false;
 const bootstrapDue=!bootstrap||!['COMPLETE','BLOCKED'].includes(bootstrap.status);
 const anchor=last?.finishedAt??bootstrap?.finishedAt;
 const reconcile=!!reconciliation||bootstrap?.status==='COMPLETE'&&!!anchor&&now.getTime()-anchor.getTime()>=config.PRICE_FULL_RECONCILIATION_DAYS*86400000;
 const recent=await db.priceSyncJob.findMany({where:{type:{not:'REFERENCE_SNAPSHOT'},status:{notIn:['FAILED','RUNNING','INTERRUPTED']}},orderBy:{startedAt:'desc'},take:10});
 const productive=recent.filter(j=>Number((j.metrics as {requests?:number}|null)?.requests??0)>0);
 let type=selectSyncWork({reference,hot,bootstrap:bootstrapDue,incremental:!!incremental.plan,reconcile,recentTypes:productive.map(j=>j.type)});
 const observation=await dueObservation(db,now);
 if(observation&&type!=='REFERENCE_SNAPSHOT'&&type!=='HOT_SYNC'&&!(type==='BOOTSTRAP'&&productive.slice(0,freshnessConfig().PRICE_MAX_CONSECUTIVE_REFRESH_BATCHES).length===freshnessConfig().PRICE_MAX_CONSECUTIVE_REFRESH_BATCHES&&productive.slice(0,freshnessConfig().PRICE_MAX_CONSECUTIVE_REFRESH_BATCHES).every(j=>['INCREMENTAL','HOT_SYNC','FULL_RECONCILIATION'].includes(j.type))))type='INCREMENTAL';
 return {observation,type,blocked:blocked??referenceBlocked??(type!=='REFERENCE_SNAPSHOT'&&state?.nextEligibleAt&&state.nextEligibleAt>now?'SYNC_COOLDOWN':null)??(inKstCollectionWindow(now)&&type!=='REFERENCE_SNAPSHOT'?'REFERENCE_PRIORITY_WINDOW':null),state,bootstrap,reconciliation,referenceRun,referenceSnapshot,incremental,config,safety};
}

// One invocation performs one bounded batch. Persisted lease/cooldown survives CLI restarts.
export async function runPriceSync(db:PrismaClient, options:{dryRun?:boolean;maxSegments?:number;intent?:string}={}, execute= safeCollect) {
 const maxSegments=options.maxSegments??20;
 if(!Number.isInteger(maxSegments)||maxSegments<0||maxSegments>100)throw new Error('max-segments must be 0–100');
 if(options.dryRun){const p=await planPriceSync(db);return {type:p.type,blocked:p.blocked,nextEligibleAt:p.state?.nextEligibleAt,summary:p.incremental.summary};}
 const token=randomUUID();
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(41046003)::text`;
  const state=await tx.priceSyncState.upsert({where:{id:dataCenterSource},create:{id:dataCenterSource},update:{}});
  if(state.leaseExpiresAt&&state.leaseExpiresAt>new Date())throw new Error('SYNC_ALREADY_ACTIVE');
  await tx.priceSyncJob.updateMany({where:{status:'RUNNING'},data:{status:'INTERRUPTED',finishedAt:new Date()}});
  await tx.priceSyncState.update({where:{id:dataCenterSource},data:{leaseToken:token,leaseExpiresAt:new Date(Date.now()+1800000)}});
 });
 let jobId:string|undefined;
 try{
  await rebaseBootstrapMetadata(db);
  await expireReferenceWindows(db);
  if(syncConfig().PRICE_SYNC_REFERENCE_ENABLED==='true'&&inKstCollectionWindow()){
   const date=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
   await scheduleReference(db,syncConfig().PRICE_SYNC_REFERENCE_PACK,date);
  }
  const p=await planPriceSync(db);
  if(p.blocked||p.type==='IDLE')return {status:p.blocked??'IDLE',type:p.type,nextEligibleAt:p.state?.nextEligibleAt,requests:0};
  let run=p.type==='BOOTSTRAP'?p.bootstrap:p.type==='FULL_RECONCILIATION'?p.reconciliation:p.type==='REFERENCE_SNAPSHOT'?p.referenceRun:null;
  if(p.observation&&p.type==='INCREMENTAL'){const pending=p.observation.cycles.find(c=>!c.completedAt);if(pending)run=await db.priceCollectionRun.findUnique({where:{id:pending.runId}});}
  if(run?.status==='BLOCKED')return {status:'RUN_BLOCKED',requests:0};
  if(!run){
   let plan:CollectionPlan;
   if(p.observation&&p.type==='INCREMENTAL')plan=collectionPlanSchema.parse(p.observation.plan);
   else if(p.type==='BOOTSTRAP'||p.type==='FULL_RECONCILIATION')plan=p.type==='BOOTSTRAP'?await planFullMarket(db):p.incremental.reconciliationPlan;
   else if(p.type==='REFERENCE_SNAPSHOT')plan=collectionPlanSchema.parse({...await planCollection(db,{pack:p.config.PRICE_SYNC_REFERENCE_PACK}),mode:'REFERENCE'});
   else {
    plan=p.incremental.plan!;
    if(p.type==='HOT_SYNC')plan=collectionPlanSchema.parse({...plan,segments:plan.segments.filter(s=>p.incremental.summary.hotClasses.includes(s.query.seasonId)),expectedPlayers:plan.expectedPlayers.filter(s=>p.incremental.summary.hotClasses.includes(s.seasonId))});
    // Resume unfinished work before creating another run over the same classes.
    const unfinished=await db.priceCollectionRun.findMany({where:{mode:'INCREMENTAL',status:{in:['PLANNED','PAUSED','RUNNING','FAILED']}},include:{segments:{where:{status:{notIn:['SUCCEEDED','SPLIT']}}}},orderBy:{createdAt:'asc'}});
    // Completed classes may now be fresh: compare only the pending partition, not the old full plan.
    const dueClasses=new Set(plan.segments.map(s=>s.query.seasonId));
    run=unfinished.find(candidate=>candidate.segments.length>0&&candidate.segments.every(s=>dueClasses.has((s.query as {seasonId:number}).seasonId)))??null;
   }
   if(!run)run=await createCollectionRun(db,plan);
  }
  if(p.observation&&p.type==='INCREMENTAL')await db.priceObservationCycle.upsert({where:{runId:run.id},create:{studyId:p.observation.id,runId:run.id,startedAt:new Date()},update:{}});
  const job=await db.priceSyncJob.create({data:{type:p.type,runId:run.id,status:'RUNNING',metrics:{intent:options.intent??'sync'}}});jobId=job.id;
  const reason=p.type==='BOOTSTRAP'?'FULL_BUILD':p.type==='FULL_RECONCILIATION'?'FULL_RECONCILIATION':p.type==='REFERENCE_SNAPSHOT'?'REFERENCE_SNAPSHOT':'INCREMENTAL_REFRESH';
  if(p.referenceSnapshot)await db.playerPriceRankSnapshot.update({where:{id:p.referenceSnapshot.id},data:{status:'COLLECTING'}});
  const result=await execute(db,run.id,maxSegments,reason);
  if(p.referenceSnapshot)await finalizeReference(db,p.referenceSnapshot.id);
  if(p.observation&&p.type==='INCREMENTAL')await finalizeObservation(db,p.observation.id,run.id);
  const metrics='executionId' in result&&result.executionId?await executionEfficiency(db,result.executionId):{requests:0};
  const current=await db.priceCollectionRun.findUniqueOrThrow({where:{id:run.id}});
  const nextStudy=await db.priceObservationStudy.findFirst({where:{active:true,nextEligibleAt:{gt:new Date()}},orderBy:{nextEligibleAt:'asc'}});
  const nextEligibleAt=new Date(Math.min(Date.now()+p.config.PRICE_SYNC_INTERVAL_MINUTES*60000,nextStudy?.nextEligibleAt.getTime()??Infinity));
  await db.$transaction([
   db.priceSyncJob.update({where:{id:job.id},data:{status:current.status,finishedAt:new Date(),nextEligibleAt,metrics:metrics as unknown as Prisma.InputJsonValue}}),
   db.priceSyncState.update({where:{id:dataCenterSource},data:{nextEligibleAt}}),
  ]);
  return {jobId:job.id,type:p.type,status:current.status,nextEligibleAt,metrics};
 }catch(error){if(jobId)await db.priceSyncJob.update({where:{id:jobId},data:{status:'FAILED',finishedAt:new Date(),metrics:{error:error instanceof Error?error.message:'SYNC_FAILED'}}});throw error;}
 finally{await db.priceSyncState.updateMany({where:{id:dataCenterSource,leaseToken:token},data:{leaseToken:null,leaseExpiresAt:null}});}
}

export async function priceSyncStatus(db:PrismaClient){
 const p=await planPriceSync(db),now=Date.now(),fresh=Number(process.env.PRICE_FRESH_HOURS??24),very=Math.max(fresh,p.config.PRICE_SYNC_VERY_STALE_HOURS);
 const [lastSync,lastReconciliation,total,current,history,freshPrices,veryStale]=await Promise.all([
  db.priceSyncJob.findFirst({orderBy:{startedAt:'desc'}}),db.priceSyncJob.findFirst({where:{type:'FULL_RECONCILIATION',status:'COMPLETE'},orderBy:{startedAt:'desc'}}),
  db.player.count(),db.playerCurrentState.count(),db.playerPriceSnapshot.count(),
  db.playerCurrentState.count({where:{observedAt:{gte:new Date(now-fresh*3600000)}}}),db.playerCurrentState.count({where:{observedAt:{lt:new Date(now-very*3600000)}}}),
 ]);
 const pricedPlayers=await db.player.count({where:{variants:{some:{current:{isNot:null}}}}});
 return {lastSync,lastReconciliation,nextEligibleAt:p.state?.nextEligibleAt,nextWork:p.type,blocked:p.blocked,pauseUntil:p.state?.pausedUntil,pauseReason:p.state?.pauseReason,sourceVersion:null,sourceVersionSupported:false,safety:p.safety,prices:{current,history,fresh:freshPrices,stale:current-freshPrices-veryStale,veryStale,unknownPlayers:total-pricedPlayers,pricedPlayers,metadataCoveragePercent:(pricedPlayers/total*100).toFixed(2)},bootstrap:p.bootstrap?await fullMarketStatus(db,p.bootstrap.id):null};
}
