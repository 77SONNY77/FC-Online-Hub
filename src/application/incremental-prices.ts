import {adaptiveScore,freshnessConfig,type PriceObservation} from '@/domain/collection/freshness';
import { Prisma, type PrismaClient } from '@prisma/client';
import { collectionPlanSchema, segmentQuerySchema } from '@/domain/players/collection-plan';
import type { CollectionPolicy } from '@/domain/collection/policy';
import { planFullMarket } from './full-market';
import { targets } from './price-collection';
export type PriorityInput = { seasonId: number; pack: boolean; warm: boolean; lastObserved: number | null; unchanged: boolean };
export function priorityPolicy(input: PriorityInput, policy: CollectionPolicy, now=Date.now()) {
  const tier=input.pack?'HOT':input.warm?'WARM':'COLD';
  const base=tier==='HOT'?policy.PRICE_COLLECTION_HOT_HOURS:tier==='WARM'?policy.PRICE_COLLECTION_WARM_HOURS:policy.PRICE_COLLECTION_COLD_HOURS;
  const hours=base*(input.unchanged&&!input.pack?2:1);
  return {tier,priority:tier==='HOT'?300:tier==='WARM'?200:100,refreshHours:hours,due:input.lastObserved===null||now-input.lastObserved>=hours*3600000,lastObserved:input.lastObserved,reason:input.pack?'PUBLISHED_PRODUCT_PACK':input.warm?'TOP_OBSERVED_CLASS_PRICE':input.unchanged?'REPEATED_UNCHANGED_BACKOFF':'LOWER_PRIORITY_CLASS'};
}
export async function planIncremental(db: PrismaClient, policy: CollectionPolicy, now=new Date()) {
  const full=await planFullMarket(db),config=freshnessConfig();
  // Published product metadata is our available signal; no unverified user-interest/popularity metrics.
  const products=await db.productVersion.findMany({where:{published:true,AND:[{OR:[{saleEndsAt:null},{saleEndsAt:{gte:now}}]},{OR:[{saleStartsAt:null},{saleStartsAt:{lte:now}}]}]},include:{components:true}});
  const pools=await db.rewardPoolVersion.findMany({where:{verificationStatus:'VERIFIED'},include:{entries:{select:{targetItemVersionId:true}}}});
  const children=await db.itemComponent.findMany({select:{parentId:true,childId:true}});
  const reachable=new Set(products.flatMap(p=>p.components.map(c=>c.itemVersionId)));
  for(let depth=0;depth<8;depth++){let added=0;for(const edge of children)if(reachable.has(edge.parentId)&&!reachable.has(edge.childId)){reachable.add(edge.childId);added++;}for(const pool of pools)if(reachable.has(pool.itemVersionId))for(const entry of pool.entries)if(entry.targetItemVersionId&&!reachable.has(entry.targetItemVersionId)){reachable.add(entry.targetItemVersionId);added++;}if(!added)break;}
  const hot=new Set(pools.filter(p=>reachable.has(p.itemVersionId)&&targets[p.id]).map(p=>targets[p.id].season));
  const values=await db.$queryRaw<{seasonId:number;price:Prisma.Decimal}[]>`SELECT "seasonId",max(price) AS price FROM "PlayerPriceCurrent" GROUP BY "seasonId" ORDER BY max(price) DESC LIMIT ${policy.PRICE_COLLECTION_WARM_CLASS_LIMIT}`;
  const warm=new Set(values.map(v=>v.seasonId));
  const previous=await db.priceCollectionSegment.findMany({where:{status:{in:['SUCCEEDED','SPLIT']},observedAt:{not:null}},select:{key:true,query:true,status:true,result:true,observedAt:true,runId:true},orderBy:{observedAt:'desc'}});
  const recentRuns=await db.priceCollectionRun.findMany({where:{mode:{in:['FULL','INCREMENTAL','GENERAL','RECONCILIATION']}},select:{id:true},orderBy:{createdAt:'desc'}});
  const byRun=new Map<string,typeof previous>();for(const s of previous){const key=`${s.runId}:${segmentQuerySchema.parse(s.query).seasonId}`;const list=byRun.get(key)??[];list.push(s);byRun.set(key,list);}
  const rows=full.segments.map(initial=>{
    const seasonId=initial.query.seasonId;
    // A covering partition is usable only when the whole class search completed.
    let leaves:typeof previous=[];
    for(const r of recentRuns){const segments=byRun.get(`${r.id}:${seasonId}`)??[];const candidates=segments.filter(s=>s.status==='SUCCEEDED'&&!segmentQuerySchema.parse(s.query).position&&!segmentQuerySchema.parse(s.query).height).sort((a,b)=>segmentQuerySchema.parse(a.query).ovrMin-segmentQuerySchema.parse(b.query).ovrMin);let edge=0;
      for(const s of candidates){const q=segmentQuerySchema.parse(s.query);if(q.ovrMin!==edge)break;edge=q.ovrMax+1;}if(edge===201){leaves=candidates;break;}}
    const latest=leaves.length?Math.min(...leaves.map(s=>s.observedAt!.getTime())):null;
    const unchanged=leaves.length>0&&leaves.every(leaf=>{
      const outcomes=previous.filter(s=>JSON.stringify(s.query)===JSON.stringify(leaf.query)&&s.status==='SUCCEEDED').slice(0,2).map(s=>(s.result as {efficiency?:{changed:number;newPrices:number}}|null)?.efficiency);
      return outcomes.length===2&&outcomes.every(e=>e&&e.changed===0&&e.newPrices===0);
    });
    const rule=priorityPolicy({seasonId,pack:hot.has(seasonId),warm:warm.has(seasonId),lastObserved:latest,unchanged},policy,now.getTime());
    const metrics=leaves.map(s=>(s.result as {observation?:PriceObservation;pricedVariantIds?:string[]}|null));
    const compared=metrics.reduce((n,m)=>n+(m?.observation?.comparable??0),0),changed=metrics.reduce((n,m)=>n+(m?.observation?.changed??0),0);
    const recentChangeRate=compared?changed/compared:null;
    const expectedVariants=metrics.reduce((n,m)=>n+(m?.pricedVariantIds?.length??0),0);
    const score=adaptiveScore({ageHours:latest===null?0:(now.getTime()-latest)/3600000,targetHours:rule.refreshHours,variants:expectedVariants,requests:leaves.length||1,importance:rule.tier==='HOT'?3:rule.tier==='WARM'?2:1,changeRate:recentChangeRate});
    // Every query must clear the minimum interval, including a newer overlapping class run.
    const lastClassCheck=previous.filter(s=>segmentQuerySchema.parse(s.query).seasonId===seasonId&&s.status==='SUCCEEDED').reduce((n,s)=>Math.max(n,s.observedAt!.getTime()),0);
    const minIntervalPassed=now.getTime()-lastClassCheck>=config.PRICE_MIN_REFRESH_INTERVAL_HOURS*3600000;
    return {seasonId,...rule,priority:score,recentChangeRate,expectedVariants,lastCheckedAt:lastClassCheck?new Date(lastClassCheck).toISOString():null,minimumIntervalPassed:minIntervalPassed,due:rule.due&&minIntervalPassed&&(rule.tier==='HOT'||leaves.length>0),deferredToFullBuild:rule.tier!=='HOT'&&leaves.length===0,segments:leaves.length?leaves.map(s=>({key:s.key,query:segmentQuerySchema.parse(s.query),expectedCount:null,priority:rule.priority})): [{...initial,priority:rule.priority}],estimatedRequests:leaves.length||((initial.expectedCount??0)<200?1:2*Math.ceil((initial.expectedCount??0)/150)-1)};
  }).sort((a,b)=>b.priority-a.priority||(a.lastObserved??0)-(b.lastObserved??0)||a.seasonId-b.seasonId);
  rows.forEach((row,index)=>row.segments.forEach(segment=>{segment.priority=Math.min(2_147_483_647,row.priority+rows.length-index);}));
  const due=rows.filter(r=>r.due), dueClasses=new Set(due.map(r=>r.seasonId));
  const plan=due.length?collectionPlanSchema.parse({...full,mode:'INCREMENTAL',targetName:'Prioritized stale class refresh',expectedPlayers:full.expectedPlayers.filter(p=>dueClasses.has(p.seasonId)),segments:due.flatMap(r=>r.segments)}):null;
  const tierCosts=['HOT','WARM','COLD'].map(tier=>{const selected=rows.filter(r=>r.tier===tier);return {tier,classes:selected.length,requestsPerSweep:selected.reduce((n,r)=>n+r.estimatedRequests,0),requestsPerDay:selected.reduce((n,r)=>n+r.estimatedRequests*24/r.refreshHours,0)};});
  return {plan,reconciliationPlan:collectionPlanSchema.parse({...full,mode:'RECONCILIATION',segments:rows.flatMap(r=>r.segments)}),summary:{skippedFreshClasses:rows.filter(r=>!r.due&&!r.deferredToFullBuild).length,deferredToFullBuildClasses:rows.filter(r=>r.deferredToFullBuild).length,dueClasses:due.length,hotClasses:[...hot],warmClasses:[...warm],tierCosts,unconstrainedRequestsPerDay:tierCosts.reduce((n,t)=>n+t.requestsPerDay,0),requestBudgetPerDay:policy.PRICE_COLLECTION_MAX_REQUESTS_PER_DAY,rows:rows.map(({segments,...rest})=>({...rest,initialQueries:segments.length}))}};
}
