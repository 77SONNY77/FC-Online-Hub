import {z} from 'zod';

export const freshnessConfigSchema=z.object({
 PRICE_MIN_REFRESH_INTERVAL_HOURS:z.coerce.number().min(2).max(168).default(2),
 PRICE_MAX_CONSECUTIVE_BOOTSTRAP_BATCHES:z.coerce.number().int().min(1).max(10).default(2),
 PRICE_MAX_CONSECUTIVE_REFRESH_BATCHES:z.coerce.number().int().min(1).max(10).default(2),
 PRICE_OBSERVATION_LARGE_CHANGE_PERCENT:z.coerce.number().positive().default(10),
 PRICE_OBSERVATION_WINDOW_TOLERANCE_MINUTES:z.coerce.number().min(1).max(30).default(15),
});
export const freshnessConfig=()=>freshnessConfigSchema.parse(process.env);
export function quantile(values:number[],p:number){
 if(!values.length)return null;
 const sorted=[...values].sort((a,b)=>a-b),index=(sorted.length-1)*p,low=Math.floor(index);
 return sorted[low]+(sorted[Math.ceil(index)]-sorted[low])*(index-low);
}
export function ageSummary(ages:number[],freshHours:number,veryStaleHours:number){
 const fresh=ages.filter(a=>a<freshHours).length,veryStale=ages.filter(a=>a>=veryStaleHours).length;
 return {total:ages.length,fresh,stale:ages.length-fresh-veryStale,veryStale,medianHours:quantile(ages,.5),p90Hours:quantile(ages,.9),p95Hours:quantile(ages,.95),p99Hours:quantile(ages,.99),oldestHours:ages.length?ages.reduce((a,b)=>Math.max(a,b),0):null};
}
// Bounded and deterministic. This is a usefulness score, not a price prediction.
export function adaptiveScore(input:{ageHours:number;targetHours:number;variants:number;requests:number;importance:number;changeRate:number|null}){
 return Math.min(2_000_000_000,Math.round(Math.min(100,input.ageHours/input.targetHours)*input.variants*input.importance*(1+(input.changeRate??0))/Math.max(1,input.requests)));
}
export type PriceObservation={
 checked:number;comparable:number;newPrices:number;changed:number;unchanged:number;freshened:number;
 changeRate:number|null;medianAbsoluteChangePercent:number|null;largeChanges:number;
 firstObservedChangedAt:string|null;observationEnd:string;
 intervals:Record<string,{checked:number;changed:number}>;
 enhancements:Record<string,{checked:number;changed:number}>;
};
export function compareObservations(rows:{id:string;price:string;enhancement:number}[],previous:Map<string,{price:string;observedAt:Date}>,at:Date,freshHours:number,largePercent=10,toleranceMinutes=15):PriceObservation{
 const intervals=Object.fromEntries([2,4,6,24].map(h=>[String(h),{checked:0,changed:0}]));
 const enhancements:PriceObservation['enhancements']={},magnitudes:number[]=[];
 let newPrices=0,changed=0,unchanged=0,freshened=0;
 for(const row of rows){
  const old=previous.get(row.id);
  if(!old){newPrices++;continue;}
  const gap=(at.getTime()-old.observedAt.getTime())/3600000;
  if(gap<=0)continue; // Cached replay must not manufacture a new comparison.
  const different=old.price!==row.price;
  if(different){changed++;const a=BigInt(old.price),b=BigInt(row.price);if(a>0n)magnitudes.push(Number((b>a?b-a:a-b)*1_000_000n/a)/10000);}else unchanged++;
  if(gap>=freshHours)freshened++;
  const grade=enhancements[row.enhancement]??={checked:0,changed:0};grade.checked++;if(different)grade.changed++;
  for(const h of [2,4,6,24])if(Math.abs(gap-h)<=toleranceMinutes/60){intervals[h].checked++;if(different)intervals[h].changed++;}
 }
 const comparable=changed+unchanged;
 return {checked:rows.length,comparable,newPrices,changed,unchanged,freshened,changeRate:comparable?changed/comparable:null,medianAbsoluteChangePercent:quantile(magnitudes,.5),largeChanges:magnitudes.filter(n=>n>=largePercent).length,firstObservedChangedAt:changed?at.toISOString():null,observationEnd:at.toISOString(),intervals,enhancements};
}
