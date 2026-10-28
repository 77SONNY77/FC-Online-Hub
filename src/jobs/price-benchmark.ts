import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {parseArgs} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {planFullMarket} from '@/application/full-market';
import {collectionPlanSchema,segmentKey} from '@/domain/players/collection-plan';
import {createCollectionRun} from '@/application/price-collection';
import {safeCollect} from '@/application/safe-price-collection';
import {executionEfficiency} from '@/application/collection-efficiency';
const {values}=parseArgs({options:{round:{type:'string',default:'1'},concurrency:{type:'string',default:'1'},'dry-run':{type:'boolean'},output:{type:'string'}}});
const round=Number(values.round);if(![1,2].includes(round))throw Error('round must be 1 or 2');
const level=Number(values.concurrency);if(![1,2].includes(level))throw Error('Live benchmark limited to 1 or 2; 4/6 are fixture-only until reviewed');
process.env.PRICE_COLLECTION_MAX_CONCURRENCY=String(level);
const db=new PrismaClient();
try{
 const full=await planFullMarket(db),large=[...full.segments].sort((a,b)=>(b.expectedCount??0)-(a.expectedCount??0))[level-1];
 let classes=level===1?[879,877,large.query.seasonId]:[868,866,large.query.seasonId];
 if(round===2){const prior=await db.priceCollectionSegment.findMany({where:{observedAt:{gte:new Date(Date.now()-7200000)}},select:{query:true}});const checked=new Set(prior.map(s=>(s.query as {seasonId:number}).seasonId));const available=full.segments.filter(s=>!checked.has(s.query.seasonId));const small=available.filter(s=>(s.expectedCount??0)>1&&(s.expectedCount??0)<50).sort((a,b)=>a.query.seasonId-b.query.seasonId)[0];const medium=available.filter(s=>(s.expectedCount??0)>=80&&(s.expectedCount??0)<200).sort((a,b)=>a.query.seasonId-b.query.seasonId)[0];if(!small||!medium)throw Error('No non-overlapping benchmark cohort');classes=[small.query.seasonId,medium.query.seasonId,large.query.seasonId];}
 const plan=collectionPlanSchema.parse({...full,mode:'RECONCILIATION',targetName:`Phase 4.7R bounded benchmark workers=${level}`,expectedPlayers:full.expectedPlayers.filter(p=>classes.includes(p.seasonId)),segments:classes.map((id,index)=>{const root=full.segments.find(s=>s.query.seasonId===id)!;const query={...root.query,subdivision:'LEGACY',ovrMin:index===2?(round===2?65:60):0,ovrMax:index===2?(round===2?69:64):200};return {key:segmentKey(query as typeof root.query),query,priority:300-index*100,expectedCount:root.expectedCount};})});
 let result:unknown={plan,concurrency:level,maxSegments:12,maxHttp:20};
 if(!values['dry-run']){
  const run=await createCollectionRun(db,plan),start=performance.now();
  const collected=await safeCollect(db,run.id,12,'FULL_RECONCILIATION');
  const elapsedSeconds=(performance.now()-start)/1000;
  const efficiency='executionId' in collected&&collected.executionId?await executionEfficiency(db,collected.executionId):null;
  const requests='executionId' in collected?await db.priceCollectorRequest.findMany({where:{executionId:collected.executionId},orderBy:{requestedAt:'asc'}}):[];
  const segments=await db.priceCollectionSegment.findMany({where:{runId:run.id},select:{key:true,status:true,result:true,lastError:true,retrievedCount:true,requests:true}});
  result={round,runId:run.id,concurrency:level,classes,elapsedSeconds,efficiency,playersPerSecond:efficiency?efficiency.players/elapsedSeconds:0,variantsPerSecond:efficiency?efficiency.variants/elapsedSeconds:0,requestsPerMinute:requests.length*60/elapsedSeconds,failures:requests.filter(r=>r.errorCode).length+segments.filter(s=>s.status==='FAILED'||s.status==='BLOCKED').length,retries:segments.reduce((n,s)=>n+Math.max(0,s.requests.length-1),0),duplicateVariants:segments.flatMap(s=>(s.result as {pricedVariantIds?:string[]}|null)?.pricedVariantIds??[]).length-new Set(segments.flatMap(s=>(s.result as {pricedVariantIds?:string[]}|null)?.pricedVariantIds??[])).size,http403:requests.filter(r=>r.statusCode===403).length,http429:requests.filter(r=>r.statusCode===429).length,security:segments.filter(s=>s.lastError==='SECURITY_PAGE').length,truncated:segments.filter(s=>s.retrievedCount===200).length,unresolvedTruncation:segments.filter(s=>s.lastError==='UNRESOLVED_TRUNCATION').length,requests,segments,status:collected.collection.status};
 }
 const text=JSON.stringify(result,null,2);if(values.output)await writeFile(values.output,text+'\n');console.log(values.output?JSON.stringify({...result as object,requests:undefined,segments:undefined,plan:undefined},null,2):text);
}finally{await db.$disconnect();}
