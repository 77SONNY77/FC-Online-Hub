import {CollectionError} from '@/infrastructure/fconline-data-center/parser';
import type {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {safeCollect} from './safe-price-collection';
import {fullMarketStatus} from './full-market';
import {collectionPolicy} from '@/domain/collection/policy';
import {safetyStatus,dataCenterSource} from '@/infrastructure/fconline-data-center/safety';

export function continueFullBatch(input:{pending:number;enabled:boolean;circuit:string;error:string|null;hour:number;day:number;failures:number}){
 if(!input.enabled)return 'COLLECTION_DISABLED';
 if(input.circuit!=='CLOSED')return 'CIRCUIT_OPEN';
 if(input.error&&/CIRCUIT|DISABLED|PAUSED|WINDOW|PRIORITY|MIN_REFRESH|LEASE|HTTP_40|HTTP_429|SECURITY|ACCESS_PAGE|MAINTENANCE/.test(input.error))return input.error;
 if(!input.pending)return 'PLAN_PROCESSED';
 if(!input.hour||!input.day)return 'REQUEST_BUDGET_EXHAUSTED';
 if(input.failures>=3)return 'REPEATED_FAILURE';
 return null;
}
export async function coordinateFull(db:PrismaClient,runId:string,options:{batches:number;batchSize:number;stop?:()=>boolean;onProgress?:(value:unknown)=>Promise<void>},execute=safeCollect){
 if(!Number.isInteger(options.batches)||options.batches<1||options.batches>200||!Number.isInteger(options.batchSize)||options.batchSize<1||options.batchSize>99)throw Error('Invalid bounded coordinator limits');
 const token=randomUUID();
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(41046003)::text`;
  const state=await tx.priceSyncState.upsert({where:{id:dataCenterSource},create:{id:dataCenterSource},update:{}});
  if(state.leaseExpiresAt&&state.leaseExpiresAt>new Date())throw Error('SYNC_ALREADY_ACTIVE');
  await tx.priceSyncState.update({where:{id:dataCenterSource},data:{leaseToken:token,leaseExpiresAt:new Date(Date.now()+1800000)}});
 });
 let stopReason='BATCH_LIMIT';
 try{
  for(let batch=0;batch<options.batches;batch++){
   if(options.stop?.()){stopReason='MANUAL_STOP';break;}
   await db.priceSyncState.update({where:{id:dataCenterSource,leaseToken:token},data:{leaseExpiresAt:new Date(Date.now()+1800000)}});
   const run=await db.priceCollectionRun.findUniqueOrThrow({where:{id:runId}});
   const current=await db.playerDataset.findFirstOrThrow({orderBy:{observedAt:'desc'}});
   if((run.plan as {metadataDatasetId:string}).metadataDatasetId!==current.id){stopReason='METADATA_VERSION_CHANGED';break;}
   const completedBefore=await db.priceCollectionSegment.count({where:{runId,status:'SUCCEEDED'}}),batchStarted=Date.now();
   try{await execute(db,runId,options.batchSize,'FULL_BUILD',fetch,{continueTruncation:true});}catch(error){if(error instanceof CollectionError){stopReason=error.code;break;}throw error;}
   const [progress,safety,state]=await Promise.all([fullMarketStatus(db,runId),safetyStatus(db,collectionPolicy()),db.priceCollectionRun.findUniqueOrThrow({where:{id:runId}})]);
   const elapsedSeconds=progress.collectionStartedAt?(Date.now()-new Date(progress.collectionStartedAt).getTime())/1000:0;
   const batchSeconds=(Date.now()-batchStarted)/1000;
   const rate=batchSeconds?(progress.completedSegments-completedBefore)/batchSeconds:0;
   const value={at:new Date().toISOString(),batch:batch+1,progress,safety,elapsedSeconds,batchSeconds,etaSeconds:rate?progress.pendingSegments/rate:null,etaNotice:'Observed completed-segment rate; future cap subdivision can increase remaining work.'};
   await options.onProgress?.(value);
   const reason=continueFullBatch({pending:progress.pendingSegments,enabled:safety.enabled,circuit:safety.circuit,error:state.lastError,hour:safety.remaining.hour,day:safety.remaining.day,failures:progress.failedSegments-progress.segments.filter(s=>s.error==='UNRESOLVED_TRUNCATION').length});
   if(reason){stopReason=reason;break;}
  }
  return {runId,stopReason,progress:await fullMarketStatus(db,runId)};
 }finally{await db.priceSyncState.updateMany({where:{id:dataCenterSource,leaseToken:token},data:{leaseToken:null,leaseExpiresAt:null}});}
}
