import {knownPartitions} from './known-partitions';
import type {PrismaClient} from '@prisma/client';
import {collectionPlanSchema,segmentKey,type CollectionPlan} from '@/domain/players/collection-plan';
import {planFullMarket} from './full-market';
import {planIncremental} from './incremental-prices';
import {collectionPolicy} from '@/domain/collection/policy';

export async function legacyPricePlan(db:PrismaClient,options:{minOvr?:number;classes?:number[];activePack?:boolean}={}){
 const min=options.minOvr??0;if(!Number.isInteger(min)||min<0||min>200)throw Error('OVR threshold must be 0–200');
 const full=await planFullMarket(db),current=await planIncremental(db,collectionPolicy());
 const classes=options.classes??full.segments.map(s=>s.query.seasonId);
 if(classes.some(id=>!full.segments.some(s=>s.query.seasonId===id)))throw Error('Unknown metadata class');
 const manifest=await knownPartitions(db);
 const segments:CollectionPlan['segments']=[];
 for(const root of full.segments.filter(s=>classes.includes(s.query.seasonId))){
  const lower=options.activePack&&current.summary.hotClasses.includes(root.query.seasonId)?0:min;
  const verified=manifest.get(root.query.seasonId);
  if(verified){for(const leaf of verified.queries.filter(q=>q.ovrMax>=lower)){const query={...leaf,ovrMin:Math.max(lower,leaf.ovrMin),subdivision:'LEGACY' as const};segments.push({key:segmentKey(query),query,expectedCount:null});}continue;}
  const row=current.summary.rows.find(r=>r.seasonId===root.query.seasonId)!;
  // A complete, non-position partition already established by this project avoids discovery again.
  const known=row.lastObserved===null?[]:current.reconciliationPlan.segments.filter(s=>s.query.seasonId===root.query.seasonId&&s.query.ovrMax>=lower);
  if(known.length){for(const leaf of known){const query={...leaf.query,ovrMin:Math.max(lower,leaf.query.ovrMin),subdivision:'LEGACY' as const};segments.push({...leaf,key:segmentKey(query),query});}continue;}
  if((root.expectedCount??200)<200){const query={...root.query,ovrMin:lower,subdivision:'LEGACY' as const};segments.push({...root,key:segmentKey(query),query});continue;}
  for(let lo=lower;lo<=200;lo+=5){const query={...root.query,ovrMin:lo,ovrMax:Math.min(lo+4,200),subdivision:'LEGACY' as const};segments.push({key:segmentKey(query),query,expectedCount:null});}
 }
 return collectionPlanSchema.parse({...full,mode:min?'INCREMENTAL':'RECONCILIATION',targetName:min?`Legacy HOT OVR >= ${min}${options.activePack?' + active packs':''}`:'Legacy-derived FULL',segments,expectedPlayers:full.expectedPlayers.filter(p=>classes.includes(p.seasonId))});
}
export const legacyScheduleCandidate={timezone:'Asia/Seoul',hot:'0 */2 * * *',full:'30 4 * * *',installed:false,overlap:'Single source lock; defer HOT while FULL owns source, then source minimum interval skips recent overlap.'};
