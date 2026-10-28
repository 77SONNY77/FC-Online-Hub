import {observationStatistics} from './price-observation';
import {Prisma,type PrismaClient} from '@prisma/client';
import {collectionCost} from './collection-cost';
import {freshnessConfig,type PriceObservation} from '@/domain/collection/freshness';

type AgeRow={seasonId:number|null;enhancement:number|null;total:number;fresh:number;stale:number;veryStale:number;medianHours:number|null;p90Hours:number|null;p95Hours:number|null;p99Hours:number|null;oldestHours:number|null;lastSuccessfulSync:Date|null};
export async function priceInfrastructure(db:PrismaClient,now=new Date()){
 const fresh=Number(process.env.PRICE_FRESH_HOURS??24),very=Math.max(fresh,Number(process.env.PRICE_SYNC_VERY_STALE_HOURS??720));
 const ages=await db.$queryRaw<AgeRow[]>(Prisma.sql`
  WITH prices AS (SELECT p."seasonId",v.enhancement,c."observedAt",GREATEST(0,EXTRACT(EPOCH FROM (${now}::timestamptz-c."observedAt"))/3600)::double precision AS age
   FROM "PlayerCurrentState" c JOIN "PlayerVariant" v ON v.id=c."variantId" JOIN "Player" p ON p.spid=v.spid)
  SELECT "seasonId",enhancement,count(*)::int AS total,count(*) FILTER(WHERE age<${fresh})::int AS fresh,
   count(*) FILTER(WHERE age>=${fresh} AND age<${very})::int AS stale,count(*) FILTER(WHERE age>=${very})::int AS "veryStale",
   percentile_cont(.5) WITHIN GROUP(ORDER BY age) AS "medianHours",percentile_cont(.9) WITHIN GROUP(ORDER BY age) AS "p90Hours",
   percentile_cont(.95) WITHIN GROUP(ORDER BY age) AS "p95Hours",percentile_cont(.99) WITHIN GROUP(ORDER BY age) AS "p99Hours",max(age) AS "oldestHours",max("observedAt") AS "lastSuccessfulSync"
  FROM prices GROUP BY GROUPING SETS ((),("seasonId"),(enhancement))`);
 const [cost,dataset,history,segments,classes,priced]=await Promise.all([
  collectionCost(db),db.playerDataset.findFirstOrThrow({orderBy:{observedAt:'desc'},select:{id:true,observedAt:true}}),db.playerPriceSnapshot.count(),
  db.priceCollectionSegment.findMany({where:{status:'SUCCEEDED'},select:{query:true,result:true,observedAt:true},orderBy:{observedAt:'desc'}}),
  db.player.groupBy({by:['seasonId'],_count:true}),db.player.findMany({where:{variants:{some:{current:{isNot:null}}}},select:{spid:true,seasonId:true}}),
 ]);
 const players=await db.player.findMany({where:{datasetId:dataset.id},select:{spid:true,seasonId:true}}),latestIds=new Set(players.map(p=>p.spid));
 const checked=new Set<string>(),observations:PriceObservation[]=[];
 for(const s of segments){const r=s.result as {playerIds?:string[];observation?:PriceObservation}|null;for(const id of r?.playerIds??[])if(latestIds.has(id))checked.add(id);if(r?.observation&&!(s.result as {checkpointSourceSegmentId?:string})?.checkpointSourceSegmentId)observations.push(r.observation);}
 const pricedIds=new Set(priced.filter(p=>latestIds.has(p.spid)).map(p=>p.spid));
 const intervals=[2,4,6,24].map(hours=>{const values=observations.map(o=>o.intervals[String(hours)]).filter(Boolean),checked=values.reduce((n,v)=>n+v.checked,0),changed=values.reduce((n,v)=>n+v.changed,0);return {hours,checked,changed,rate:checked?changed/checked:null,status:values.filter(v=>v.checked>0).length>=2?'OBSERVED_SAMPLE_ONLY':'INSUFFICIENT_DATA',qualifyingBatches:values.filter(v=>v.checked>0).length};});
 const http=cost.reconciliation.estimatedTotalRequests,policy=cost.safety;
 const strategy=(name:string,requestsPerDay:number)=>({name,estimatedHttpPerDay:requestsPerDay,estimatedHttpPer30Days:requestsPerDay*30,minimumActiveHoursPerDay:requestsPerDay*Number(process.env.PRICE_COLLECTION_REQUEST_DELAY_MS??10000)/3600000,medianAgeTargetHours:null,p95AgeTargetHours:null,coverage:'Unknown until discovery completes',feasibleWithinCurrentDayBudget:requestsPerDay<=cost.full.requestsPerDayCap});
 const due=cost.incremental.rows.filter(r=>r.due);
 const referenceDue=await db.playerPriceRankSnapshot.count({where:{status:{in:['PLANNED','COLLECTING']},windowStart:{lte:now},windowEnd:{gt:now}}});
 return {studies:await observationStatistics(db),observedAt:now,dataset,policyNotice:cost.policyNotice,coverage:{metadataPlayers:players.length,discoverablePlayers:null,observedDiscoverablePlayers:checked.size,playersWithPrice:pricedIds.size,playersWithoutPrice:players.length-pricedIds.size,uncheckedPlayers:players.filter(p=>!checked.has(p.spid)).length,observedWithoutPrice:[...checked].filter(id=>!pricedIds.has(id)).length,unavailablePlayers:null,definition:'Unchecked is not unavailable; absence from one response is not a deletion signal.'},
  freshness:{freshThresholdHours:fresh,veryStaleThresholdHours:very,...ages.find(r=>r.seasonId===null&&r.enhancement===null)},
  classes:classes.map(c=>({seasonId:c.seasonId,metadataPlayers:c._count,playersWithPrice:priced.filter(p=>p.seasonId===c.seasonId).length,...ages.find(r=>r.seasonId===c.seasonId)})),
  enhancements:ages.filter(r=>r.enhancement!==null).map(r=>{const checked=observations.reduce((n,o)=>n+(o.enhancements[r.enhancement!]?.checked??0),0),changed=observations.reduce((n,o)=>n+(o.enhancements[r.enhancement!]?.changed??0),0);return {...r,checked,changed,observedChangeRate:checked?changed/checked:null};}),
  observations:{batches:observations.length,intervals,notice:'Gap between our observations, not source change time. Samples are not a market-wide random sample.'},
  backlog:{bootstrapRemainingSegments:cost.market?.pendingSegments??153,estimatedRequestsToClearBootstrap:cost.full.estimatedRemainingPriceRequests,refreshDueSegments:due.reduce((n,r)=>n+r.initialQueries,0),estimatedRequestsToMeetConfiguredTargets:due.reduce((n,r)=>n+r.estimatedRequests,0),referenceDueSnapshots:referenceDue},
  strategies:[strategy('Full every 2h',http*12),strategy('Full every 4h',http*6),strategy('Full daily',http),strategy('HOT/WARM/COLD',cost.hybrid.incrementalHttpPerDay),strategy('Adaptive under budget',cost.full.requestsPerDayCap),strategy('Hybrid',cost.hybrid.amortizedHttpPerDay)],
  additionalSloCosts:[{name:'HOT 2h / WARM 12h / COLD 72h',priceRequestsPerDay:cost.incremental.tierCosts.reduce((n,t)=>n+t.requestsPerSweep*24/(t.tier==='HOT'?2:t.tier==='WARM'?12:72),0)},{name:'HOT 2h / all market 24h',priceRequestsPerDay:cost.reconciliation.estimatedPriceRequests+(cost.incremental.tierCosts.find(t=>t.tier==='HOT')?.requestsPerSweep??0)*11}],
  growth:{current:ages.find(r=>r.seasonId===null&&r.enhancement===null)?.total??0,history,forecast30Days:null,forecastYear:null,reason:'INSUFFICIENT_DATA: discovery, comparable change rates and heartbeat mix are not established.'},config:freshnessConfig(),safety:policy,cost};
}
