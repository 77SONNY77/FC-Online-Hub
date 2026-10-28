import {hash} from '@/domain/players/metadata';
import {randomUUID} from 'node:crypto';
import {PrismaClient,Prisma} from '@prisma/client';
import {afterAll,describe,it,expect} from 'vitest';
import {conditionHash,type RankCondition} from '@/domain/rewards/resolution';
import {planHash,collectionPlanSchema} from '@/domain/players/collection-plan';
import {planPriceSync} from '@/application/price-sync';
import {finalizeReference,rankInventory} from '@/application/reference-snapshots';
const url=process.env.TEST_DATABASE_URL;if(!url||!new URL(url).pathname.endsWith('_test'))throw new Error('Dedicated test database required');
const db=new PrismaClient({datasources:{db:{url}}});
afterAll(()=>db.$disconnect());
// All synthetic verified data lives inside rolled-back transactions, never the development DB.
async function fixture(test:(tx:Prisma.TransactionClient,id:string)=>Promise<void>){
 const sentinel=new Error('ROLLBACK_TEST_FIXTURE');
 try{await db.$transaction(async tx=>{
  const id=`TEST-${randomUUID()}`,pool=await tx.rewardPoolVersion.findUniqueOrThrow({where:{id:'official-pool-24987-v1'}});
  const item=await tx.itemVersion.findUniqueOrThrow({where:{id:pool.itemVersionId}});
  await tx.itemVersion.create({data:{...item,id:id+'-item',version:100000+Math.floor(Math.random()*100000000),name:'SYNTHETIC REFERENCE TEST'}});
  await tx.rewardPoolVersion.create({data:{...pool,id:id+'-pool',itemVersionId:id+'-item',conditionRaw:'SYNTHETIC ONLY'}});
  await tx.playerDataset.create({data:{id,sourceUrl:'https://open.api.nexon.com/static/fconline/spid.json',observedAt:new Date(),contentHash:id,playersRaw:'[]',seasonsRaw:'[]'}});
  await tx.season.create({data:{id:997,name:'SYNTHETIC',imageUrl:'https://ssl.nexon.com/test.png',datasetId:id}});
  const condition:RankCondition={poolId:id+'-pool',rawHash:hash('SYNTHETIC REFERENCE TEST\nSYNTHETIC ONLY'),seasonId:997,enhancements:[8],minOvr:null,ovrBasis:'NONE',excludeUnavailable:true,top:2};
  const players=[1,2,3].map(n=>({spid:`99700000${n}`,name:`SYNTHETIC ${n}`,seasonId:997}));
  const plan=collectionPlanSchema.parse({version:1,mode:'REFERENCE',targetPoolId:condition.poolId,targetName:'TEST',top:2,metadataDatasetId:id,expectedPlayers:players,enhancements:[8],unsupportedConditions:[],createdAt:new Date().toISOString(),segments:[{key:'997-0-200',expectedCount:3,query:{seasonId:997,enhancements:[8],selectedEnhancement:1,ovrMin:0,ovrMax:200,page:1,sort:'BASE_PRICE_DESC'}}]});
  await tx.priceCollectionRun.create({data:{id,mode:'REFERENCE',plan,planHash:planHash(plan),status:'COMPLETE',startedAt:new Date('2026-09-19T15:10Z'),finishedAt:new Date('2026-09-19T15:20Z')}});
  await tx.priceSourceSnapshot.create({data:{id,sourceUrl:'https://fconline.nexon.com/datacenter',source:'OFFICIAL_WEB',observedAt:new Date('2026-09-19T15:15Z'),contentHash:id,content:'SYNTHETIC',notes:id}});
  for(const [i,p] of players.entries()){
   await tx.player.create({data:{...p,pid:p.spid.slice(3),imageUrl:'https://ssl.nexon.com/test.png',datasetId:id,lastUpdatedAt:new Date()}});
   const variantId=p.spid+'-8';await tx.playerVariant.create({data:{id:variantId,spid:p.spid,enhancement:8}});
   await tx.playerPriceSnapshot.create({data:{id:id+'-'+i,variantId,price:String(300-i*100),referenceAt:new Date('2026-09-19T15:10Z'),observedAt:new Date('2026-09-19T15:15Z'),snapshotId:id,verificationStatus:'VERIFIED',reason:'REFERENCE_SNAPSHOT'}});
  }
  await tx.priceCollectionSegment.create({data:{runId:id,key:plan.segments[0].key,query:plan.segments[0].query,status:'SUCCEEDED',retrievedCount:3,snapshotId:id,observedAt:new Date('2026-09-19T15:15Z')}});
  await tx.playerPriceRankSnapshot.create({data:{id,poolId:condition.poolId,referenceDate:'2026-09-20',windowStart:new Date('2026-09-19T15:00Z'),windowEnd:new Date('2026-09-19T16:00Z'),conditionHash:conditionHash(condition),condition,complete:false,candidateCount:3,tiePolicy:'UNKNOWN',sourceUrl:'https://fconline.nexon.com/datacenter',datasetVersion:id,verificationStatus:'NEEDS_VERIFICATION',status:'COLLECTING',runId:id,evidence:{eligibilityVerified:true,referenceRuleVerified:true,candidateScopeVerified:true,sourceUrl:'https://fconline.nexon.com/datacenter',sourceHash:(await tx.sourceSnapshot.findUniqueOrThrow({where:{id:pool.snapshotId}})).contentHash,candidateVariantIds:players.map(p=>p.spid+'-8'),unknowns:[]}}});
  // Application transactions use this outer transaction for rollback-only integration fixtures.
  const client=new Proxy(tx,{get(target,key){if(key==='$transaction')return (fn:(t:Prisma.TransactionClient)=>Promise<unknown>)=>fn(tx);return Reflect.get(target,key);}}) as unknown as PrismaClient;
  await test(client as unknown as Prisma.TransactionClient,id);throw sentinel;
 },{timeout:30000});}catch(e){if(e!==sentinel)throw e;}
}
describe('reference publication and DB immutability',()=>{
 it('publishes complete synthetic evidence with exact variant and observation links',()=>fixture(async(tx,id)=>{
  expect(await finalizeReference(tx as unknown as PrismaClient,id)).toMatchObject({status:'VERIFIED',pricedCount:3,complete:true});
  const rows=await tx.playerPriceRankEntry.findMany({where:{snapshotId:id},orderBy:{rank:'asc'}});expect(rows.map(r=>r.variantId)).toEqual(['997000001-8','997000002-8','997000003-8']);
  expect(rows[0].priceSnapshotId).toBe(id+'-0');
 }));
 it('Current changes cannot change published historical ranks',()=>fixture(async(tx,id)=>{
  await finalizeReference(tx as unknown as PrismaClient,id);
  await tx.playerCurrentState.create({data:{variantId:'997000003-8',price:'999999',observedAt:new Date(),historyAt:new Date('2026-09-19T15:15Z'),snapshotId:id,historyId:id+'-2'}});
  const entry=await tx.playerPriceRankEntry.findFirstOrThrow({where:{snapshotId:id,rank:1},include:{priceSnapshot:true}});expect(entry.variantId).toBe('997000001-8');expect(entry.priceSnapshot.price.toFixed(0)).toBe('300');
 }));
 it('database refuses modifying a VERIFIED snapshot',()=>fixture(async(tx,id)=>{
  await finalizeReference(tx as unknown as PrismaClient,id);
  await expect(tx.playerPriceRankSnapshot.update({where:{id},data:{candidateCount:1}})).rejects.toThrow('VERIFIED_SNAPSHOT_IMMUTABLE');
 }));
 it('database refuses modifying a VERIFIED entry',()=>fixture(async(tx,id)=>{
  await finalizeReference(tx as unknown as PrismaClient,id);
  await expect(tx.playerPriceRankEntry.updateMany({where:{snapshotId:id},data:{available:false}})).rejects.toThrow('VERIFIED_SNAPSHOT_IMMUTABLE');
 }));
 it('does not certify Current-only observations',()=>fixture(async(tx,id)=>{
  await tx.playerPriceSnapshot.updateMany({where:{snapshotId:id},data:{referenceAt:null,verificationStatus:'NEEDS_VERIFICATION'}});
  expect(await finalizeReference(tx as unknown as PrismaClient,id)).toMatchObject({status:'UNRESOLVED',verificationStatus:'NEEDS_VERIFICATION'});
  expect(await tx.playerPriceRankEntry.count({where:{snapshotId:id}})).toBe(0);
 }));
 it('failed segment, wrong time and cutoff tie prevent publication',()=>fixture(async(tx,id)=>{
  await tx.priceCollectionSegment.updateMany({where:{runId:id},data:{status:'FAILED',retrievedCount:200}});
  await tx.playerPriceSnapshot.update({where:{id:id+'-2'},data:{price:'200',observedAt:new Date('2026-09-19T17:00Z')}});
  const s=await finalizeReference(tx as unknown as PrismaClient,id);expect(s.verificationStatus).toBe('NEEDS_VERIFICATION');expect(await tx.playerPriceRankEntry.count({where:{snapshotId:id}})).toBe(0);
 }));
 it('a due reference job outranks bootstrap and ignores the normal sync cooldown',()=>fixture(async(tx,id)=>{
  await tx.priceSyncState.upsert({where:{id:'FC_ONLINE_DATA_CENTER'},create:{id:'FC_ONLINE_DATA_CENTER',nextEligibleAt:new Date('2026-09-20T00:00Z')},update:{nextEligibleAt:new Date('2026-09-20T00:00Z')}});
  const p=await planPriceSync(tx as unknown as PrismaClient,new Date('2026-09-19T15:30Z'));
  expect(p.type).toBe('REFERENCE_SNAPSHOT');expect(p.referenceSnapshot?.id).toBe(id);expect(p.blocked).not.toBe('SYNC_COOLDOWN');
 }));
 it('a missed window with no historical observations stays MISSED',()=>fixture(async(tx,id)=>{
  await tx.playerPriceSnapshot.deleteMany({where:{snapshotId:id}});
  const s=await finalizeReference(tx as unknown as PrismaClient,id);expect(s.status).toBe('MISSED');expect(s.pricedCount).toBe(0);
  expect(await tx.playerPriceRankEntry.count({where:{snapshotId:id}})).toBe(0);
 }));
 it('inventories all original rank rows without changing official probabilities',async()=>{
  const before=await db.probabilityEntry.findMany({orderBy:{id:'asc'}}),inventory=await rankInventory(db);
  expect(inventory).toHaveLength(6);expect(inventory.reduce((n,p)=>n+p.entries.length,0)).toBe(1195);
  expect(await db.probabilityEntry.findMany({orderBy:{id:'asc'}})).toEqual(before);expect(before).toHaveLength(1208);
 });
});
