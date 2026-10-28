import {Prisma,type PrismaClient} from '@prisma/client';
import {collectionPlanSchema} from '@/domain/players/collection-plan';
import {collectionPolicy} from '@/domain/collection/policy';
import {compareObservations,freshnessConfig} from '@/domain/collection/freshness';
import {planIncremental} from './incremental-prices';

type SamplePrice={id:string;price:string;enhancement:number;observedAt:string};
// Cohort creation is DB-only. Three cheap, fully discovered classes; value strata
// are selected within each class using observed +1 price, not invented popularity.
export async function createObservationStudy(db:PrismaClient,id='price-cycle-v1',now=new Date()){
 const existing=await db.priceObservationStudy.findUnique({where:{id}});if(existing)return existing;
 const active=await db.priceObservationStudy.findFirst({where:{active:true}});if(active)throw Error('An observation study is already active');
 const incremental=await planIncremental(db,collectionPolicy(),now);
 const eligible=incremental.summary.rows.filter(r=>!r.deferredToFullBuild&&r.estimatedRequests===1&&r.expectedVariants>0);
 const packIds=new Set([866,877]); // Existing, documented rank pack classes; not current sale/popularity claims.
 const chosen=[...eligible.filter(r=>packIds.has(r.seasonId)),...eligible.filter(r=>!packIds.has(r.seasonId)).sort((a,b)=>a.seasonId-b.seasonId)].slice(0,3);
 if(chosen.length<2)throw Error('INSUFFICIENT_DISCOVERED_CLASSES');
 const cohort:{id:string;seasonId:number;valueStratum:string;knownPackClass:boolean}[]=[];
 for(const row of chosen){
  const prices=await db.playerCurrentState.findMany({where:{variant:{enhancement:1,player:{seasonId:row.seasonId}}},orderBy:[{price:'asc'},{variantId:'asc'}],include:{variant:true}});
  for(const [label,fraction] of [['LOW',0],['MEDIUM',.5],['HIGH',1]] as const){
   const player=prices[Math.floor((prices.length-1)*fraction)];if(!player)continue;
   const variants=await db.playerVariant.findMany({where:{spid:player.variant.spid,current:{isNot:null}},select:{id:true}});
   for(const variant of variants)if(!cohort.some(c=>c.id===variant.id))cohort.push({id:variant.id,seasonId:row.seasonId,valueStratum:label,knownPackClass:packIds.has(row.seasonId)});
  }
 }
 const classes=new Set(chosen.map(r=>r.seasonId));
 const plan=collectionPlanSchema.parse({...incremental.reconciliationPlan,mode:'INCREMENTAL',targetName:`Observation study ${id}`,segments:incremental.reconciliationPlan.segments.filter(s=>classes.has(s.query.seasonId)),expectedPlayers:incremental.reconciliationPlan.expectedPlayers.filter(p=>classes.has(p.seasonId))});
 return db.priceObservationStudy.create({data:{id,plan:plan as unknown as Prisma.InputJsonValue,cohort,nextEligibleAt:now}});
}
export async function dueObservation(db:PrismaClient,now=new Date()){
 const study=await db.priceObservationStudy.findFirst({where:{active:true,nextEligibleAt:{lte:now}},orderBy:{createdAt:'asc'},include:{cycles:{orderBy:{startedAt:'desc'}}}});
 if(!study)return null;
 const plan=collectionPlanSchema.parse(study.plan),classes=plan.segments.map(s=>s.query.seasonId);
 const recent=await db.priceCollectionSegment.findMany({where:{status:'SUCCEEDED',observedAt:{gt:new Date(now.getTime()-freshnessConfig().PRICE_MIN_REFRESH_INTERVAL_HOURS*3600000)}},select:{query:true}});
 if(recent.some(s=>classes.includes((s.query as {seasonId:number}).seasonId)))return null;
 return study;
}
export async function finalizeObservation(db:PrismaClient,studyId:string,runId:string){
 const study=await db.priceObservationStudy.findUniqueOrThrow({where:{id:studyId},include:{cycles:{orderBy:{startedAt:'desc'}}}});
 const run=await db.priceCollectionRun.findUniqueOrThrow({where:{id:runId},include:{segments:true}});
 if(run.status!=='COMPLETE')return;
 const cycle=study.cycles.find(c=>c.runId===runId);if(!cycle||cycle.completedAt)return;
 const ids=new Set((study.cohort as {id:string}[]).map(c=>c.id)),prices:SamplePrice[]=[];
 for(const segment of run.segments.filter(s=>s.status==='SUCCEEDED'&&s.snapshotId)){
  const source=await db.priceSourceSnapshot.findUniqueOrThrow({where:{id:segment.snapshotId!}});
  const capture=JSON.parse(source.content) as {rows:{spid:string;enhancement:number;price:string}[]};
  for(const row of capture.rows){const id=`${row.spid}-${row.enhancement}`;if(ids.has(id))prices.push({id,price:row.price,enhancement:row.enhancement,observedAt:source.observedAt.toISOString()});}
 }
 const previous=study.cycles.find(c=>c.completedAt&&c.prices),old=(previous?.prices??[]) as SamplePrice[];
 const ended=new Date(Math.max(...run.segments.filter(s=>s.observedAt).map(s=>s.observedAt!.getTime())));
 const metrics=compareObservations(prices,new Map(old.map(p=>[p.id,{price:p.price,observedAt:new Date(p.observedAt)}])),ended,Number(process.env.PRICE_FRESH_HOURS??24));
 const completed=study.cycles.filter(c=>c.completedAt).length+1;
 await db.$transaction([
  db.priceObservationCycle.update({where:{id:cycle.id},data:{completedAt:ended,prices,metrics:{...metrics,baseline:!previous,missing:ids.size-prices.length,observationStart:cycle.startedAt.toISOString(),sourceChangedAt:null}}}),
  db.priceObservationStudy.update({where:{id:study.id},data:{active:completed<study.maxCycles,nextEligibleAt:new Date(ended.getTime()+study.intervalHours*3600000)}}),
 ]);
}

export async function observationStatistics(db:PrismaClient){
 const studies=await db.priceObservationStudy.findMany({include:{cycles:{where:{completedAt:{not:null}},orderBy:{startedAt:'asc'}}}});
 return studies.map(study=>{
  const windows=[2,4,6,24].map(hours=>{
   let pairs=0,checked=0,changed=0;
   for(let i=0;i<study.cycles.length;i++)for(let j=i+1;j<study.cycles.length;j++){
    const old=study.cycles[i].prices as SamplePrice[],current=study.cycles[j].prices as SamplePrice[];
    const before=new Map(old.map(p=>[p.id,p]));let comparable=0,different=0;
    for(const row of current){const previous=before.get(row.id);if(!previous)continue;
     const gap=(Date.parse(row.observedAt)-Date.parse(previous.observedAt))/3600000;
     if(Math.abs(gap-hours)<=freshnessConfig().PRICE_OBSERVATION_WINDOW_TOLERANCE_MINUTES/60){comparable++;if(previous.price!==row.price)different++;}
    }
    if(comparable){pairs++;checked+=comparable;changed+=different;}
   }
   return {hours,pairs,checked,changed,rate:checked?changed/checked:null,status:pairs>=2?'OBSERVED_SAMPLE_ONLY':'INSUFFICIENT_DATA'};
  });
  return {id:study.id,active:study.active,cohort:study.cohort,maxCycles:study.maxCycles,completedCycles:study.cycles.length,nextEligibleAt:study.nextEligibleAt,windows,cycles:study.cycles.map(({prices,...cycle})=>({...cycle,retainedSampleValues:Array.isArray(prices)?prices.length:0})),notice:'Endpoint comparisons can miss intervening changes. Pairs overlap and are not independent market samples.'};
 });
}
