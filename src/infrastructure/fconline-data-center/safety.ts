import {requestContext} from './request-context';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import type { PrismaClient } from '@prisma/client';
import { budgetReason, type CollectionPolicy } from '@/domain/collection/policy';
import { CollectionError } from './parser';
export const dataCenterSource = 'FC_ONLINE_DATA_CENTER';
export function liveEnabled() {
  if (process.env.PRICE_COLLECTION_ENABLED === 'false') return false;
  try { return parse(readFileSync('.env')).PRICE_COLLECTION_ENABLED !== 'false'; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
}
export async function safetyStatus(db: PrismaClient, policy: CollectionPolicy, sourceId = dataCenterSource, executionId?: string) {
  const now = Date.now();
  const [state, minute, hour, day, run] = await Promise.all([
    db.priceCollectorState.findUnique({ where: { id: sourceId } }),
    ...[60000,3600000,86400000].map(ms => db.priceCollectorRequest.count({ where: { sourceId, requestedAt: { gt: new Date(now-ms) } } })),
    executionId ? db.priceCollectorRequest.count({where:{executionId}}) : Promise.resolve(0),
  ]);
  return { enabled: liveEnabled() && policy.PRICE_COLLECTION_ENABLED === 'true' && (state?.enabled ?? true), circuit: state?.circuitUntil && state.circuitUntil.getTime() > now ? 'OPEN' : 'CLOSED', circuitUntil: state?.circuitUntil, circuitReason: state?.circuitReason, active: !!(state?.leaseExpiresAt && state.leaseExpiresAt.getTime()>now), counts: { minute,hour,day,run }, remaining: { minute: Math.max(0,policy.PRICE_COLLECTION_MAX_REQUESTS_PER_MINUTE-minute), hour: Math.max(0,policy.PRICE_COLLECTION_MAX_REQUESTS_PER_HOUR-hour), day: Math.max(0,policy.PRICE_COLLECTION_MAX_REQUESTS_PER_DAY-day), run: Math.max(0,policy.PRICE_COLLECTION_MAX_REQUESTS_PER_RUN-run) } };
}
export class CollectorSafety {
  private token = randomUUID();
  private reservationQueue:Promise<void>=Promise.resolve();
  executionId = '';
  private released = false;
  constructor(private db: PrismaClient, readonly policy: CollectionPolicy, private sourceId = dataCenterSource, private enabled = liveEnabled, private sleep = (ms:number)=>new Promise<void>(r=>setTimeout(r,ms))) {}
  async acquire(runId: string, reason: string) {
    if (!this.enabled() || this.policy.PRICE_COLLECTION_ENABLED === 'false') throw new CollectionError('COLLECTION_DISABLED');
    await this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(41046002)::text`;
      const state = await tx.priceCollectorState.upsert({where:{id:this.sourceId},create:{id:this.sourceId},update:{}});
      if (!state.enabled) throw new CollectionError('COLLECTION_DISABLED');
      if (state.circuitUntil && state.circuitUntil > new Date()) throw new CollectionError('CIRCUIT_OPEN');
      if (state.leaseExpiresAt && state.leaseExpiresAt > new Date()) throw new CollectionError('COLLECTOR_ALREADY_ACTIVE');
      await tx.priceCollectorState.update({where:{id:this.sourceId},data:{leaseToken:this.token,leaseExpiresAt:new Date(Date.now()+1800000)}});
      const execution = await tx.priceCollectorExecution.create({data:{runId,reason}}); this.executionId=execution.id;
    });
  }
  async failure(code: string, immediate = false) {
    await this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(41046002)::text`;
      const s=await tx.priceCollectorState.update({where:{id:this.sourceId},data:{failures:{increment:1}}});
      if(immediate || s.failures>=this.policy.PRICE_COLLECTION_CIRCUIT_BREAKER_THRESHOLD) await tx.priceCollectorState.update({where:{id:this.sourceId},data:{circuitUntil:new Date(Date.now()+this.policy.PRICE_COLLECTION_CIRCUIT_COOLDOWN_HOURS*3600000),circuitReason:code}});
    });
  }
  async parsedFailure(code: string) {
    if (/HTTP_|NETWORK_|INCOMPLETE_BODY|CIRCUIT_|BUDGET|DISABLED|WINDOW|PRIORITY|PAUSED|MIN_REFRESH_INTERVAL/.test(code)) return;
    await this.failure(code, /SECURITY|ACCESS_PAGE|MAINTENANCE|ROBOTS/.test(code));
  }
  async reserve(url:string){
    const previous=this.reservationQueue;let release!:()=>void;this.reservationQueue=new Promise<void>(r=>{release=r;});
    await previous;try{return await this.reserveOne(url);}finally{release();}
  }
  private async reserveOne(url: string) {
    if (!this.executionId) throw new CollectionError('COLLECTOR_NOT_ACQUIRED');
    const latest = await this.db.priceCollectorRequest.findFirst({where:{sourceId:this.sourceId},orderBy:{requestedAt:'desc'}});
    if(latest) await this.sleep(Math.max(0,latest.requestedAt.getTime()+this.policy.PRICE_COLLECTION_REQUEST_DELAY_MS-Date.now()));
    const pause=await this.db.priceSyncState.findUnique({where:{id:dataCenterSource}});
    if(pause?.pausedUntil && pause.pausedUntil>new Date()) throw new CollectionError('SOURCE_PAUSED');
    if(!this.enabled() || this.policy.PRICE_COLLECTION_ENABLED==='false') throw new CollectionError('COLLECTION_DISABLED');
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(41046002)::text`;
      const state=await tx.priceCollectorState.findUniqueOrThrow({where:{id:this.sourceId}}), now=Date.now();
      if(state.leaseToken!==this.token || !state.leaseExpiresAt || state.leaseExpiresAt.getTime()<=now) throw new CollectionError('COLLECTOR_LEASE_LOST');
      if(!state.enabled) throw new CollectionError('COLLECTION_DISABLED');
      if(state.circuitUntil && state.circuitUntil.getTime()>now) throw new CollectionError('CIRCUIT_OPEN');
      const [minute,hour,day,run]=await Promise.all([... [60000,3600000,86400000].map(ms=>tx.priceCollectorRequest.count({where:{sourceId:this.sourceId,requestedAt:{gt:new Date(now-ms)}}})),tx.priceCollectorRequest.count({where:{executionId:this.executionId}})]);
      const reason=budgetReason({minute,hour,day,run},this.policy);if(reason)throw new CollectionError(reason);
      await tx.priceCollectorState.update({where:{id:this.sourceId},data:{leaseExpiresAt:new Date(now+1800000)}});
      return tx.priceCollectorRequest.create({data:{sourceId:this.sourceId,executionId:this.executionId,url}});
    });
  }
  fetcher(network: typeof fetch = fetch, beforeRequest: () => void = () => {}): typeof fetch {
    return async (input, init) => {
      const url=String(input);
      if(!['https://fconline.nexon.com/robots.txt','https://fconline.nexon.com/datacenter','https://fconline.nexon.com/datacenter/PlayerList'].includes(url)) throw new CollectionError('UNAPPROVED_COLLECTOR_ENDPOINT');
      const reserved=await this.reserve(url);
      let response: Response;const actualStartedAt=new Date();
      try { beforeRequest(); response=await network(input,init); }
      catch(error) { const code = error instanceof CollectionError ? error.code : 'NETWORK_OR_TIMEOUT'; await this.db.priceCollectorRequest.update({where:{id:reserved.id},data:{finishedAt:new Date(),errorCode:code}}); if (!(error instanceof CollectionError)) await this.failure(code); throw error; }
      const headers=Object.fromEntries(['etag','last-modified','cache-control','age','date','retry-after'].map(k=>[k,response.headers.get(k)]));
      const signals={...headers,segmentId:requestContext(init)?.segmentId??null,slot:requestContext(init)?.slot??null,actualStartedAt:actualStartedAt.toISOString(),headersReceivedAt:new Date().toISOString(),durationMs:Date.now()-actualStartedAt.getTime(),concurrency:this.policy.PRICE_COLLECTION_MAX_CONCURRENCY,query:init?.body?Object.fromEntries(new URLSearchParams(String(init.body))):null};
      await this.db.priceCollectorRequest.update({where:{id:reserved.id},data:{finishedAt:new Date(),statusCode:response.status,errorCode:response.ok?null:`HTTP_${response.status}`,signals}});
      if([401,403,429].includes(response.status)) await this.failure(`HTTP_${response.status}`,true);
      else if(response.status>=500) await this.failure(`HTTP_${response.status}`);
      return response;
    };
  }
  async success() { await this.db.priceCollectorState.update({where:{id:this.sourceId},data:{failures:0}}); }
  async release(stopReason?: string) {
    if(!this.executionId || this.released)return;
    await this.db.priceCollectorExecution.update({where:{id:this.executionId},data:{finishedAt:new Date(),stopReason}});
    await this.db.priceCollectorState.updateMany({where:{id:this.sourceId,leaseToken:this.token},data:{leaseToken:null,leaseExpiresAt:null}});
    this.released = true;
  }
}
