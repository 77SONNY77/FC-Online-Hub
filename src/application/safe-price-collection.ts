import {freshnessConfig} from '@/domain/collection/freshness';
import {segmentQuerySchema} from '@/domain/players/collection-plan';
import type { PrismaClient } from '@prisma/client';
import { freshQueryCache } from './collection-cache';
import { collectRun, collectionStatus } from './price-collection';
import { collectionPolicy, pauseCodes } from '@/domain/collection/policy';
import { inKstCollectionWindow } from '@/domain/players/collection-plan';
import { CollectorSafety, safetyStatus } from '@/infrastructure/fconline-data-center/safety';
import { DataCenterClient, crawlerConfigSchema } from '@/infrastructure/fconline-data-center/client';
import { CollectionError } from '@/infrastructure/fconline-data-center/parser';
export async function safeCollect(db: PrismaClient, runId: string, maxSegments: number, reason: 'FULL_RECONCILIATION'|'FULL_BUILD'|'INCREMENTAL_REFRESH'|'REFERENCE_SNAPSHOT'|'MANUAL', network: typeof fetch = fetch, options:{continueTruncation?:boolean}={}) {
  if (!Number.isInteger(maxSegments) || maxSegments<0 || maxSegments>100) throw new Error('max-segments must be 0–100');
  const run=await db.priceCollectionRun.findUniqueOrThrow({where:{id:runId}});
  if(run.status==='BLOCKED') throw new CollectionError('RUN_BLOCKED');
  if(run.status==='COMPLETE'||maxSegments===0)return {collection:await collectRun(db,runId,{collect:async()=>{throw new Error('No request allowed');}},0),safety:await safetyStatus(db,collectionPolicy())};
  if (reason === 'MANUAL' && await freshQueryCache(db,runId)) { await db.priceCollectionRun.update({where:{id:runId},data:{status:'PAUSED',lastError:'FRESH_QUERY_CACHE'}}); return {collection:await collectionStatus(db,runId),safety:await safetyStatus(db,collectionPolicy()),cache:'FRESH_QUERY_CACHE'}; }
  const reference=reason==='REFERENCE_SNAPSHOT'?await db.playerPriceRankSnapshot.findUnique({where:{runId}}):null;
  const stopAt=process.env.PRICE_FULL_STOP_AT;if(stopAt&&!Number.isFinite(Date.parse(stopAt)))throw Error('Invalid PRICE_FULL_STOP_AT');
  const checkWindow=()=>{if(stopAt&&Date.now()>=Date.parse(stopAt))throw new CollectionError('SOURCE_PAUSED');if(reference&&(Date.now()<reference.windowStart.getTime()||Date.now()>=reference.windowEnd.getTime()))throw new CollectionError('COLLECTION_WINDOW_CLOSED');if(reason==='REFERENCE_SNAPSHOT'&&!inKstCollectionWindow())throw new CollectionError('COLLECTION_WINDOW_CLOSED');if(reason!=='REFERENCE_SNAPSHOT'&&inKstCollectionWindow())throw new CollectionError('REFERENCE_PRIORITY_WINDOW');};
  checkWindow();
  const policy=collectionPolicy(), guard=new CollectorSafety(db,policy);
  await guard.acquire(runId,reason);
  let stopReason: string|undefined;
  try {
    const config=crawlerConfigSchema.parse({...Object.fromEntries(['REQUEST_TIMEOUT_MS','MAX_RETRIES','RETRY_BACKOFF_MS'].map(key=>[key,process.env[key]])),MAX_CONCURRENCY:policy.PRICE_COLLECTION_MAX_CONCURRENCY,REQUEST_DELAY_MS:policy.PRICE_COLLECTION_REQUEST_DELAY_MS});
    const guarded=guard.fetcher(network,checkWindow);
    const client=new DataCenterClient(config,async(input,init)=>{
      checkWindow();
      if(reason!=='REFERENCE_SNAPSHOT'&&String(input).endsWith('/PlayerList')){
        const body=new URLSearchParams(String(init?.body)),season=Number(body.get('strSeason')?.replaceAll(',','')),min=Number(body.get('n4OvrMin')),max=Number(body.get('n4OvrMax'));
        const recent=await db.priceCollectionSegment.findMany({where:{runId:{not:runId},status:'SUCCEEDED',observedAt:{gt:new Date(Date.now()-freshnessConfig().PRICE_MIN_REFRESH_INTERVAL_HOURS*3600000)}},select:{query:true,observedAt:true}});
        const overlaps=recent.filter(s=>{const q=segmentQuerySchema.parse(s.query);return q.seasonId===season&&q.ovrMin<=max&&q.ovrMax>=min;});
        if(overlaps.length){const error=new CollectionError('SOURCE_MIN_REFRESH_INTERVAL');error.deferUntil=new Date(Math.max(...overlaps.map(s=>s.observedAt!.getTime()))+freshnessConfig().PRICE_MIN_REFRESH_INTERVAL_HOURS*3600000);throw error;}
      }
      return guarded(input,init);
    });
    await client.checkRobots();
    const collection=await collectRun(db,runId,client,maxSegments,{continueTruncation:options.continueTruncation,failure:code=>guard.parsedFailure(code),success:()=>guard.success(),beforeSegment:checkWindow},policy.PRICE_COLLECTION_MAX_CONCURRENCY);
    stopReason=(await db.priceCollectionRun.findUniqueOrThrow({where:{id:runId}})).lastError ?? undefined;
    if(collection.observations) await db.$executeRaw`REFRESH MATERIALIZED VIEW "PlayerPriceCurrent"`;
    await guard.release(stopReason);
    return {collection,executionId:guard.executionId,safety:await safetyStatus(db,policy,undefined,guard.executionId)};
  } catch(error) {
    stopReason=error instanceof CollectionError?error.code:'COLLECTION_EXECUTION_FAILED';
    if(pauseCodes.includes(stopReason)){await db.priceCollectionRun.update({where:{id:runId},data:{status:'PAUSED',lastError:stopReason}});await guard.release(stopReason);return {collection:await collectionStatus(db,runId),executionId:guard.executionId,safety:await safetyStatus(db,policy,undefined,guard.executionId)};}
    await guard.parsedFailure(stopReason);
    throw error;
  } finally {await guard.release(stopReason);}
}
