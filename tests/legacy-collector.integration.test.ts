import {PrismaClient,type Prisma} from '@prisma/client';
import {it,expect,afterAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {load} from 'cheerio';
import {planFullMarket} from '@/application/full-market';
import {collectRun,createCollectionRun} from '@/application/price-collection';
import {CollectionError} from '@/infrastructure/fconline-data-center/parser';
const url=process.env.TEST_DATABASE_URL;if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('Dedicated test DB');
const db=new PrismaClient({datasources:{db:{url}}});afterAll(()=>db.$disconnect());
async function fixture(work:(client:PrismaClient)=>Promise<void>){
 const rollback=new Error('ROLLBACK');try{await db.$transaction(async tx=>{
  let queue:Promise<unknown>=Promise.resolve();
  const client=new Proxy(tx,{get(t,k){if(k==='$transaction')return (a:((t:Prisma.TransactionClient)=>unknown)|Promise<unknown>[])=>{const next=queue.then(()=>typeof a==='function'?a(tx):Promise.all(a));queue=next.catch(()=>undefined);return next;};const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}}) as PrismaClient;
  const id=randomUUID(),at=new Date(Date.now()+1000);
  await client.playerDataset.create({data:{id,sourceUrl:'https://example.test',contentHash:id,playersRaw:'[]',seasonsRaw:'[]',observedAt:at}});
  await client.season.create({data:{id:996,name:'SYNTHETIC',datasetId:id,imageUrl:'https://example.test'}});
  for(let i=1;i<=6;i++)await client.player.create({data:{spid:`99600000${i}`,pid:`00000${i}`,name:'SYNTHETIC',seasonId:996,datasetId:id,imageUrl:'https://example.test',lastUpdatedAt:at}});
  await work(client);throw rollback;
 },{timeout:30000});}catch(e){if(e!==rollback)throw e;}
}
const $=load(readFileSync('tests/fixtures/datacenter/uc-two-players.html','utf8'));
const row=$.html($('#area_playerunit_877020801'));
it.each([2,4,6])('collects concurrently with %s slots, unique checkpoints and same-ms source captures',async concurrency=>fixture(async client=>{
 const full=await planFullMarket(client),root=full.segments[0];
 const plan={...full,segments:Array.from({length:6},(_,i)=>({...root,key:`996-${i+1}-${i+1}`,query:{...root.query,ovrMin:i+1,ovrMax:i+1}}))};
 const run=await createCollectionRun(client,plan),seen=new Set<number>();let active=0,peak=0;let release!:()=>void;const firstWave=new Promise<void>(resolve=>{release=resolve;});const at=new Date();
 const transport={collect:async(q:typeof root.query)=>{active++;peak=Math.max(peak,active);if(active===concurrency)release();await firstWave;active--;expect(seen.has(q.ovrMin)).toBe(false);seen.add(q.ovrMin);return {html:row.replaceAll('877020801',`99600000${q.ovrMin}`).replaceAll('크리스티아누 호날두','SYNTHETIC'),observedAt:at};}};
 const result=await collectRun(client,run.id,transport,20,{},concurrency);
 expect(result.status).toBe('COMPLETE');expect(seen.size).toBe(6);expect(peak).toBe(concurrency);
 expect(await client.playerCurrentState.count({where:{variant:{spid:{startsWith:'996'}}}})).toBe(78);
 expect(await client.priceCollectionSegment.count({where:{runId:run.id,status:'SUCCEEDED'}})).toBe(6);
 const replay=await collectRun(client,run.id,{collect:async()=>{throw Error('Completed run requested again');}},20,{},concurrency);expect(replay.status).toBe('COMPLETE');
}));
it.each(['HTTP_403','HTTP_429','SECURITY_PAGE'])('stops new worker claims after %s and preserves pending work',async code=>fixture(async client=>{
 const plan=await planFullMarket(client),root=plan.segments[0];
 const run=await createCollectionRun(client,{...plan,segments:Array.from({length:6},(_,i)=>({...root,key:`996-${i}-${i}`,query:{...root.query,ovrMin:i,ovrMax:i}}))});
 let calls=0;await collectRun(client,run.id,{collect:async()=>{calls++;throw new CollectionError(code,false,true);}},20,{},2);
 expect(calls).toBeLessThanOrEqual(2);expect((await client.priceCollectionRun.findUniqueOrThrow({where:{id:run.id}})).status).toBe('BLOCKED');
 expect(await client.priceCollectionSegment.count({where:{runId:run.id,status:'PENDING'}})).toBeGreaterThanOrEqual(4);
}));
it('never accepts terminal cap as complete',async()=>fixture(async client=>{
 const full=await planFullMarket(client),root=full.segments[0];
 const query={...root.query,subdivision:'LEGACY' as const,ovrMin:60,ovrMax:60,position:[0],height:[170,174] as [number,number]};
 const run=await createCollectionRun(client,{...full,segments:[{...root,query}]});
 const html=Array.from({length:200},(_,i)=>row.replaceAll('877020801',String(996000001+i)).replaceAll('크리스티아누 호날두','SYNTHETIC')).join('');
 const result=await collectRun(client,run.id,{collect:async()=>({html,observedAt:new Date()})},20,{},2);
 expect(result.status).toBe('BLOCKED');expect((await client.priceCollectionSegment.findFirstOrThrow({where:{runId:run.id}})).lastError).toBe('UNRESOLVED_TRUNCATION');
 expect(await client.playerCurrentState.count({where:{variant:{spid:{startsWith:'996'}}}})).toBe(0);
}));
it('resumes only the failed worker checkpoint and retains successful prices',async()=>fixture(async client=>{
 const full=await planFullMarket(client),root=full.segments[0];
 const run=await createCollectionRun(client,{...full,expectedPlayers:full.expectedPlayers.filter(p=>['996000001','996000002'].includes(p.spid)),segments:[1,2].map(i=>({...root,key:`996-${i}-${i}`,query:{...root.query,ovrMin:i,ovrMax:i}}))});
 const response=(i:number)=>({html:row.replaceAll('877020801',`99600000${i}`).replaceAll('크리스티아누 호날두','SYNTHETIC'),observedAt:new Date()});
 await collectRun(client,run.id,{collect:async q=>{if(q.ovrMin===1)throw new CollectionError('NETWORK_ERROR');return response(2);}},20,{},2);
 expect(await client.playerCurrentState.count({where:{variant:{spid:{startsWith:'996'}}}})).toBe(13);
 const calls:number[]=[];const result=await collectRun(client,run.id,{collect:async q=>{calls.push(q.ovrMin);return response(q.ovrMin);}},20,{},2);
 expect(calls).toEqual([1]);expect(result.status).toBe('COMPLETE');
 expect(await client.playerCurrentState.count({where:{variant:{spid:{startsWith:'996'}}}})).toBe(26);
}));
it('isolates terminal truncation and continues other full-market segments',async()=>fixture(async client=>{
 const full=await planFullMarket(client),root=full.segments[0];
 const capped={...root.query,subdivision:'LEGACY' as const,ovrMin:60,ovrMax:60,position:[0],height:[170,174] as [number,number]};
 const ordinary={...root.query,ovrMin:1,ovrMax:1};
 const run=await createCollectionRun(client,{...full,segments:[{...root,key:'996-60-60-p0-h170_174',query:capped,priority:10},{...root,key:'996-1-1',query:ordinary}]});
 const result=await collectRun(client,run.id,{collect:async q=>({observedAt:new Date(),html:q.ovrMin===60?Array.from({length:200},(_,i)=>row.replaceAll('877020801',String(996000001+i))).join(''):row.replaceAll('877020801','996000001').replaceAll('크리스티아누 호날두','SYNTHETIC')})},20,{continueTruncation:true},1);
 expect(result.status).toBe('PARTIAL');expect(await client.priceCollectionSegment.count({where:{runId:run.id,status:'SUCCEEDED'}})).toBe(1);
 expect(await client.priceCollectionSegment.count({where:{runId:run.id,status:'BLOCKED',lastError:'UNRESOLVED_TRUNCATION'}})).toBe(1);
 expect(await client.playerCurrentState.count({where:{variant:{spid:'996000001'}}})).toBe(13);
}));
it('automatically continues bounded full batches under one scheduler lease',async()=>fixture(async client=>{
 const {coordinateFull}=await import('@/application/full-coordinator');
 const full=await planFullMarket(client),root=full.segments[0];
 const run=await createCollectionRun(client,{...full,segments:[1,2].map(i=>({...root,key:`996-${i}-${i}`,query:{...root.query,ovrMin:i,ovrMax:i}}))});
 let batches=0;
 const execute=async()=>{batches++;const collection=await collectRun(client,run.id,{collect:async q=>({observedAt:new Date(),html:row.replaceAll('877020801',`99600000${q.ovrMin}`).replaceAll('크리스티아누 호날두','SYNTHETIC')})},1,{continueTruncation:true});return {collection,safety:{}};};
 const result=await coordinateFull(client,run.id,{batches:4,batchSize:1},execute as unknown as typeof import('@/application/safe-price-collection').safeCollect);
 expect(batches).toBe(2);expect(result.stopReason).toBe('PLAN_PROCESSED');expect(result.progress.completedSegments).toBe(2);
}));
it('defers recently collected segments without blocking unrelated full work',async()=>fixture(async client=>{
 const full=await planFullMarket(client),root=full.segments[0];
 const run=await createCollectionRun(client,{...full,segments:[1,2].map(i=>({...root,key:`996-${i}-${i}`,query:{...root.query,ovrMin:i,ovrMax:i}}))});
 const calls:number[]=[];
 const response=(i:number)=>({observedAt:new Date(),html:row.replaceAll('877020801',`99600000${i}`).replaceAll('크리스티아누 호날두','SYNTHETIC')});
 await collectRun(client,run.id,{collect:async q=>{calls.push(q.ovrMin);if(q.ovrMin===1){const e=new CollectionError('SOURCE_MIN_REFRESH_INTERVAL');e.deferUntil=new Date(Date.now()+60000);throw e;}return response(2);}},20,{continueTruncation:true});
 expect(calls).toEqual([1,2]);expect(await client.priceCollectionSegment.count({where:{runId:run.id,status:'SUCCEEDED'}})).toBe(1);
 await collectRun(client,run.id,{collect:async()=>{throw Error('Deferred query repeated early');}},20,{continueTruncation:true});
 await client.priceCollectionSegment.updateMany({where:{runId:run.id,lastError:'SOURCE_MIN_REFRESH_INTERVAL'},data:{result:{deferredUntil:new Date(Date.now()-1000).toISOString()}}});
 const resumed=await collectRun(client,run.id,{collect:async q=>response(q.ovrMin)},20,{continueTruncation:true});expect(resumed.status).toBe('COMPLETE');
}));
it('checks an expired execution deadline before any source request after a restart',async()=>fixture(async client=>{
 const {safeCollect}=await import('@/application/safe-price-collection');
 const run=await createCollectionRun(client,await planFullMarket(client));
 const old=process.env.PRICE_FULL_STOP_AT;process.env.PRICE_FULL_STOP_AT=new Date(Date.now()-1000).toISOString();let calls=0;
 try{await expect(safeCollect(client,run.id,1,'FULL_BUILD',async()=>{calls++;return new Response('unexpected');})).rejects.toThrow('SOURCE_PAUSED');expect(calls).toBe(0);}
 finally{if(old===undefined)delete process.env.PRICE_FULL_STOP_AT;else process.env.PRICE_FULL_STOP_AT=old;}
}));
