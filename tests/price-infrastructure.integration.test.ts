import {PrismaClient,type Prisma} from '@prisma/client';
import {it,expect,afterAll,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {rebaseBootstrapMetadata} from '@/application/metadata-price-plan';
import {planFullMarket} from '@/application/full-market';
import {createCollectionRun} from '@/application/price-collection';
import {planIncremental} from '@/application/incremental-prices';
import {collectionPolicy} from '@/domain/collection/policy';
import {dueObservation} from '@/application/price-observation';
import {runPriceSync} from '@/application/price-sync';
import {safeCollect} from '@/application/safe-price-collection';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('Dedicated test DB required');
const db=new PrismaClient({datasources:{db:{url}}});afterAll(()=>db.$disconnect());
async function rollback(work:(client:PrismaClient)=>Promise<void>){
 const marker=new Error('ROLLBACK_FIXTURE');
 try{await db.$transaction(async tx=>{
  const client=new Proxy(tx,{get(target,key){if(key==='$transaction')return async(arg:((t:Prisma.TransactionClient)=>unknown)|Promise<unknown>[])=>typeof arg==='function'?arg(tx):Promise.all(arg);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}}) as PrismaClient;
  await work(client);throw marker;
 },{timeout:30000});}catch(error){if(error!==marker)throw error;}
}
async function fixture(client:PrismaClient){
 const id=`freshness-${randomUUID()}`,at=new Date(Date.now()+10000);
 await client.playerDataset.create({data:{id,sourceUrl:'https://open.api.nexon.com/static/fconline/meta/spid.json',observedAt:at,contentHash:id,playersRaw:'[]',seasonsRaw:'[]'}});
 for(const seasonId of [994,995]){
  await client.season.create({data:{id:seasonId,name:'SYNTHETIC',imageUrl:'https://example.test/image',datasetId:id}});
  await client.player.create({data:{spid:`${seasonId}000001`,pid:'000001',name:'SYNTHETIC',seasonId,imageUrl:'https://example.test/image',datasetId:id,lastUpdatedAt:at}});
 }
 const plan=await planFullMarket(client),run=await createCollectionRun(client,plan);
 await client.priceCollectionRun.update({where:{id:run.id},data:{status:'COMPLETE',finishedAt:at}});
 await client.priceCollectionSegment.updateMany({where:{runId:run.id},data:{status:'SUCCEEDED',observedAt:at,result:{playerIds:[],pricedVariantIds:[],efficiency:{newPrices:0,changed:0,unchanged:0}}}});
 return {id,at,plan,run};
}
it('metadata addition prioritizes new players and transfers only unchanged checkpoints; restart is idempotent',async()=>rollback(async client=>{
 const {id,at,run}=await fixture(client),newId=`${id}-next`;
 await client.playerDataset.create({data:{id:newId,sourceUrl:'https://example.test/metadata',observedAt:new Date(at.getTime()+1000),contentHash:newId,playersRaw:'[]',seasonsRaw:'[]'}});
 await client.season.updateMany({where:{datasetId:id},data:{datasetId:newId}});
 await client.player.updateMany({where:{datasetId:id},data:{datasetId:newId}});
 await client.player.create({data:{spid:'994000002',pid:'000002',name:'NEW SYNTHETIC',seasonId:994,imageUrl:'https://example.test/image',datasetId:newId,lastUpdatedAt:at}});
 const rebased=await rebaseBootstrapMetadata(client);expect(rebased?.id).not.toBe(run.id);
 const segments=await client.priceCollectionSegment.findMany({where:{runId:rebased!.id},orderBy:{key:'asc'}});
 expect(segments[0]).toMatchObject({status:'PENDING',priority:10000});
 expect(segments[1]).toMatchObject({status:'SUCCEEDED',observedAt:at});
 expect(await rebaseBootstrapMetadata(client)).toBeNull();
 expect(await client.priceCollectionRun.findUnique({where:{id:run.id}})).not.toBeNull();
}));
it('fresh classes and a not-yet-due study produce a zero HTTP tick',async()=>rollback(async client=>{
 const {at,plan}=await fixture(client);
 await client.priceSyncState.deleteMany();await client.priceCollectorState.deleteMany();
 await client.priceObservationStudy.create({data:{id:`zero-${randomUUID()}`,plan:plan as unknown as Prisma.InputJsonValue,cohort:[],nextEligibleAt:new Date(at.getTime()+7200000)}});
 const incremental=await planIncremental(client,collectionPolicy(),at);
 expect(incremental.plan).toBeNull();expect(await dueObservation(client,at)).toBeNull();
 const execute=vi.fn();expect(await runPriceSync(client,{},execute)).toMatchObject({requests:0});expect(execute).not.toHaveBeenCalled();
}));
it('collector refuses an overlapping recent segment before its price HTTP, without opening the circuit',async()=>{
 const clock=new Date();clock.setUTCDate(clock.getUTCDate()+1);clock.setUTCHours(6,0,0,0);
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(clock);vi.stubEnv('PRICE_COLLECTION_REQUEST_DELAY_MS','3000');
 try{await rollback(async client=>{
  const {plan}=await fixture(client);
  await client.priceSyncState.deleteMany();await client.priceCollectorState.deleteMany();
  const run=await createCollectionRun(client,{...plan,mode:'INCREMENTAL'});
  const network=vi.fn(async()=>new Response('User-agent: *\nDisallow:'));
  const result=await safeCollect(client,run.id,20,'INCREMENTAL_REFRESH',network);
  expect(network).toHaveBeenCalledTimes(1); // robots only; no price POST reserved.
  expect(result.collection.status).toBe('PAUSED');
  expect((await client.priceCollectionRun.findUniqueOrThrow({where:{id:run.id}})).lastError).toBe('SOURCE_MIN_REFRESH_INTERVAL');
  expect(result.safety.circuit).toBe('CLOSED');
 });}finally{vi.useRealTimers();vi.unstubAllEnvs();}
});
