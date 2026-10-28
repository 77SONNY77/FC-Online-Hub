import {readFileSync} from 'node:fs';
import {load} from 'cheerio';
import {safeCollect} from '@/application/safe-price-collection';
import {createCollectionRun} from '@/application/price-collection';
import {planFullMarket} from '@/application/full-market';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {importPlayers,importPrices} from '@/application/import-players';
import {createPlayerRepository} from '@/infrastructure/db/player-repository';
import {runPriceSync} from '@/application/price-sync';
import {dataCenterSource} from '@/infrastructure/fconline-data-center/safety';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw new Error('Dedicated test DB required');
const db=new PrismaClient({datasources:{db:{url}}}),suffix=randomUUID();
const spid='998000001',name=`SYNTHETIC SYNC ${suffix}`,variantId=`${spid}-8`;
const start=Date.now()-3*86400000;
let datasetId:string;
const ownedRuns:string[]=[];
const capture=(price:string,hour:number)=>({sourceUrl:'https://fconline.nexon.com/datacenter',observedAt:new Date(start+hour*3600000).toISOString(),referenceAt:null,notes:suffix,rows:[{spid,name,enhancement:8,price,ovr:100,position:'ST'}]});
beforeAll(async()=>{datasetId=(await importPlayers(db,JSON.stringify([{id:Number(spid),name}]),JSON.stringify([{seasonId:998,className:'SYNTHETIC SYNC',seasonImg:'https://ssl.nexon.com/test.png'}]),new Date())).id;});
afterAll(async()=>{
 await db.priceCollectorRequest.deleteMany({where:{execution:{runId:{in:ownedRuns}}}});
 await db.priceCollectorExecution.deleteMany({where:{runId:{in:ownedRuns}}});
 await db.priceCollectorState.deleteMany({where:{id:dataCenterSource}});
 await db.priceSyncJob.deleteMany({where:{runId:{in:ownedRuns}}});
 const sources=await db.priceCollectionSegment.findMany({where:{runId:{in:ownedRuns}},select:{snapshotId:true}});
 await db.priceCollectionRequest.deleteMany({where:{segment:{runId:{in:ownedRuns}}}});
 await db.priceCollectionSegment.deleteMany({where:{runId:{in:ownedRuns}}});
 await db.priceCollectionRun.deleteMany({where:{id:{in:ownedRuns}}});
 await db.playerPriceSnapshot.deleteMany({where:{snapshotId:{in:sources.flatMap(s=>s.snapshotId?[s.snapshotId]:[])}}});
 await db.priceSourceSnapshot.deleteMany({where:{id:{in:sources.flatMap(s=>s.snapshotId?[s.snapshotId]:[])}}});
 await db.priceSyncState.deleteMany({where:{id:dataCenterSource}});
 await db.playerPriceSnapshot.deleteMany({where:{variantId}});await db.playerVariant.deleteMany({where:{spid}});
 await db.priceSourceSnapshot.deleteMany({where:{notes:suffix}});await db.player.deleteMany({where:{datasetId}});await db.season.deleteMany({where:{datasetId}});await db.playerDataset.deleteMany({where:{id:datasetId}});await db.$disconnect();
});
describe('atomic current price and compressed history',()=>{
 it('creates INITIAL then changes 500B to 520B preserving both values',async()=>{
  await importPrices(db,capture('500000000000',0),{compact:true});await importPrices(db,capture('520000000000',1),{compact:true});
  expect((await db.playerCurrentState.findUniqueOrThrow({where:{variantId}})).price.toFixed(0)).toBe('520000000000');
  const history=await db.playerPriceSnapshot.findMany({where:{variantId},orderBy:{observedAt:'asc'}});
  expect(history.map(p=>p.price.toFixed(0))).toEqual(['500000000000','520000000000']);expect(history.map(p=>p.reason)).toEqual(['INITIAL','PRICE_CHANGE']);
 });
 it('unchanged observation advances Current time without another history row; pages use Current',async()=>{
  const result=await importPrices(db,capture('520000000000',2),{compact:true});expect(result.historyRows).toBe(0);
  expect(await db.playerPriceSnapshot.count({where:{variantId}})).toBe(2);
  const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('User traffic must never crawl'));
  try{const player=await createPlayerRepository(db).detail(spid,8);expect(player?.price?.observedAt).toBe(capture('1',2).observedAt);expect(network).not.toHaveBeenCalled();}finally{network.mockRestore();}
 });
 it('heartbeat and reference observations remain distinct from invented reference time',async()=>{
  await importPrices(db,capture('520000000000',26),{compact:true});await importPrices(db,capture('520000000000',27),{compact:true,reference:true});
  expect((await db.playerPriceSnapshot.findMany({where:{variantId},orderBy:{observedAt:'asc'}})).map(p=>p.reason)).toEqual(['INITIAL','PRICE_CHANGE','HEARTBEAT','REFERENCE_SNAPSHOT']);
  expect(await db.playerPriceSnapshot.count({where:{variantId,referenceAt:{not:null}}})).toBe(0);
 });
 it('invalid batch rolls back all Current/history changes',async()=>{
  const bad=capture('999',28);bad.rows.push({...bad.rows[0],enhancement:9,name:'WRONG'});
  await expect(importPrices(db,bad,{compact:true})).rejects.toThrow('metadata mismatch');
  expect((await db.playerCurrentState.findUniqueOrThrow({where:{variantId}})).price.toFixed(0)).toBe('520000000000');expect(await db.playerPriceSnapshot.count({where:{variantId}})).toBe(4);
 });
 it('older imports cannot roll Current backwards',async()=>{
  await importPrices(db,capture('10',3),{compact:true});expect((await db.playerCurrentState.findUniqueOrThrow({where:{variantId}})).price.toFixed(0)).toBe('520000000000');
 });
 it('cooldown persists across client restart and sends no request',async()=>{
  await db.priceSyncState.upsert({where:{id:dataCenterSource},create:{id:dataCenterSource,nextEligibleAt:new Date(Date.now()+600000)},update:{nextEligibleAt:new Date(Date.now()+600000)}});
  const restarted=new PrismaClient({datasources:{db:{url}}}),execute=vi.fn();
  try{expect(await runPriceSync(restarted,{},execute)).toMatchObject({status:'SYNC_COOLDOWN',requests:0});expect(execute).not.toHaveBeenCalled();expect((await restarted.playerCurrentState.findUniqueOrThrow({where:{variantId}})).price.toFixed(0)).toBe('520000000000');}finally{await restarted.$disconnect();}
 });
 it('refuses a second active scheduler before planning or collection',async()=>{
  await db.priceSyncState.update({where:{id:dataCenterSource},data:{leaseToken:'test',leaseExpiresAt:new Date(Date.now()+600000)}});
  await expect(runPriceSync(db,{},vi.fn())).rejects.toThrow('SYNC_ALREADY_ACTIVE');
  await db.priceSyncState.update({where:{id:dataCenterSource},data:{leaseToken:null,leaseExpiresAt:null}});
 });
 it('incremental uses the shared budget and resumes the same pending segment in a fresh execution',async()=>{
  vi.stubEnv('PRICE_COLLECTION_MAX_REQUESTS_PER_RUN','1');vi.stubEnv('PRICE_COLLECTION_REQUEST_DELAY_MS','3000');
  const now=new Date(Date.now()+2*3600000);if(now.getUTCHours()===15)now.setUTCHours(16);vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);
  const plan=await planFullMarket(db),run=await createCollectionRun(db,{...plan,mode:'INCREMENTAL'});ownedRuns.push(run.id);
  const $=load(readFileSync('tests/fixtures/datacenter/uc-two-players.html','utf8'));
  let body=$.html($('#area_playerunit_877020801'));
  body=body.replaceAll('877020801',spid).replaceAll('크리스티아누 호날두',name);
  const network=vi.fn(async(input:RequestInfo|URL)=>new Response(String(input).endsWith('/robots.txt')?'User-agent: *\nDisallow:':body,{headers:{'content-type':'text/html'}}));
  try{
   const first=await safeCollect(db,run.id,20,'INCREMENTAL_REFRESH',network);
   expect(first.collection.status).toBe('PAUSED');expect(network).toHaveBeenCalledTimes(1);
   expect((await db.priceCollectionSegment.findFirstOrThrow({where:{runId:run.id}})).status).toBe('PENDING');
   vi.stubEnv('PRICE_COLLECTION_MAX_REQUESTS_PER_RUN','2');
   const second=await safeCollect(db,run.id,20,'INCREMENTAL_REFRESH',network);
   expect(second.collection.status).toBe('COMPLETE');expect(network).toHaveBeenCalledTimes(3);
   expect(second.safety.counts.day).toBe(3);
  }finally{vi.useRealTimers();vi.unstubAllEnvs();}
 },20000);

 it('resumes pending incremental classes even when completed classes leave the due plan',async()=>{
  const clock=new Date();clock.setUTCDate(clock.getUTCDate()+2);clock.setUTCHours(6,0,0,0);vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(clock);
  try{
   await db.priceSyncState.update({where:{id:dataCenterSource},data:{nextEligibleAt:null}});
   const plan=await planFullMarket(db),full=await createCollectionRun(db,plan);ownedRuns.push(full.id);
   await db.priceCollectionRun.update({where:{id:full.id},data:{status:'COMPLETE',finishedAt:new Date()}});
   await db.priceCollectionSegment.updateMany({where:{runId:full.id},data:{status:'SUCCEEDED',observedAt:new Date(Date.now()-20*86400000),result:{playerIds:[],missing:[]}}});
   const oldPlan={...plan,mode:'INCREMENTAL' as const,segments:[...plan.segments,{...plan.segments[0],key:'997-0-200',query:{...plan.segments[0].query,seasonId:997}}]};
   const partial=await createCollectionRun(db,oldPlan);ownedRuns.push(partial.id);
   await db.priceCollectionRun.update({where:{id:partial.id},data:{status:'PAUSED'}});
   await db.priceCollectionSegment.update({where:{runId_key:{runId:partial.id,key:'997-0-200'}},data:{status:'SUCCEEDED',observedAt:new Date(),result:{playerIds:[],missing:[]}}});
   const execute=vi.fn(async(_db:PrismaClient,id:string)=>{expect(id).toBe(partial.id);return {collection:{},safety:{}};});
   const result=await runPriceSync(db,{},execute as unknown as typeof safeCollect);
   expect(result).toMatchObject({type:'INCREMENTAL',status:'PAUSED'});expect(execute).toHaveBeenCalledTimes(1);
   const job=await db.priceSyncJob.findFirstOrThrow({where:{runId:partial.id}});expect(job.nextEligibleAt).not.toBeNull();
  }finally{vi.useRealTimers();}
 });

 it('serializes concurrent overlapping imports and never lets an older response overwrite Current',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(start+200*3600000));
  try{
   await Promise.all([importPrices(db,capture('540000000000',100),{compact:true,collectionSegmentId:'new-concurrent'}),importPrices(db,capture('500000000000',99),{compact:true,collectionSegmentId:'old-concurrent'})]);
   expect((await db.playerCurrentState.findUniqueOrThrow({where:{variantId}})).price.toFixed(0)).toBe('540000000000');
   const before=await db.playerPriceSnapshot.count({where:{variantId}});
   await importPrices(db,capture('540000000000',101),{compact:true,collectionSegmentId:'same-concurrent'});
   expect(await db.playerPriceSnapshot.count({where:{variantId}})).toBe(before);
   expect((await db.playerCurrentState.findUniqueOrThrow({where:{variantId}})).observedAt).toEqual(new Date(start+101*3600000));
  }finally{vi.useRealTimers();}
 });

});
