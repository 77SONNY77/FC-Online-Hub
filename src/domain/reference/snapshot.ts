import {z} from 'zod';
import {conditionSchema,conditionHash,resolvePriceRank,type RankCondition} from '@/domain/rewards/resolution';
export function referenceWindow(date:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Invalid reference date');
 const start=new Date(`${date}T00:00:00+09:00`),end=new Date(`${date}T01:00:00+09:00`);
 if(!Number.isFinite(start.getTime())||new Date(start.getTime()+9*3600000).toISOString().slice(0,10)!==date)throw new Error('Invalid reference date');
 return {start,end,timezone:'Asia/Seoul' as const};
}
export const referenceEvidenceSchema=z.object({
 eligibilityVerified:z.boolean(),referenceRuleVerified:z.boolean(),candidateScopeVerified:z.boolean(),
 sourceUrl:z.string().url(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),
 candidateVariantIds:z.array(z.string()).min(1),unknowns:z.array(z.string()),
});
export type ReferenceEvidence=z.infer<typeof referenceEvidenceSchema>;
export type ReferenceRow={variantId:string;priceSnapshotId:string;spid:string;name:string;seasonId:number;enhancement:number;price:string;referenceAt:string|null;observedAt:string;ovr:number|null;verified:boolean};
export function validateReferenceSnapshot(input:{id:string;date:string;condition:RankCondition;evidence:ReferenceEvidence;datasetVersion:string;structureVerified:boolean;segments:{status:string;truncated:boolean}[];rows:ReferenceRow[];now?:number}){
 const window=referenceWindow(input.date),issues:string[]=[];
 if(!input.structureVerified)issues.push('INVALID_SEGMENT_PARTITION');
 const c=conditionSchema.parse(input.condition),e=referenceEvidenceSchema.parse(input.evidence);
 if(!e.eligibilityVerified)issues.push('ELIGIBILITY_NOT_VERIFIED');
 if(!e.referenceRuleVerified)issues.push('REFERENCE_RULE_NOT_VERIFIED');
 if(!e.candidateScopeVerified)issues.push('CANDIDATE_SCOPE_NOT_VERIFIED');
 if(e.unknowns.length)issues.push(...e.unknowns);
 if(!input.segments.length||input.segments.some(s=>!['SUCCEEDED','SPLIT'].includes(s.status)))issues.push('INCOMPLETE_SEGMENTS');
 if(input.segments.some(s=>s.truncated&&s.status!=='SPLIT'))issues.push('TRUNCATED_SEGMENT');
 const wanted=new Set(e.candidateVariantIds),actual=new Set(input.rows.map(r=>r.variantId));
 if(wanted.size!==e.candidateVariantIds.length||actual.size!==input.rows.length||wanted.size!==actual.size||[...wanted].some(k=>!actual.has(k)))issues.push('INCOMPLETE_CANDIDATES');
 if(input.rows.some(r=>r.variantId!==`${r.spid}-${r.enhancement}`))issues.push('VARIANT_MISMATCH');
 if(input.rows.some(r=>!r.verified||r.referenceAt===null))issues.push('AUTHORITATIVE_REFERENCE_PRICE_MISSING');
 if(input.rows.some(r=>Date.parse(r.observedAt)<window.start.getTime()||Date.parse(r.observedAt)>=window.end.getTime()||Date.parse(r.observedAt)>(input.now??Date.now())))issues.push('OBSERVATION_OUTSIDE_WINDOW');
 const rows=[...input.rows].sort((a,b)=>BigInt(a.price)>BigInt(b.price)?-1:BigInt(a.price)<BigInt(b.price)?1:0);
 const ties=rows.filter((r,i)=>i>0&&r.price===rows[i-1].price).length;
 const cutoffTie=rows.length>c.top&&rows[c.top-1]?.price===rows[c.top]?.price;
 // Every rank has its own probability: ties anywhere are conservatively unresolved.
 if(ties)issues.push(cutoffTie?'CUTOFF_TIE':'RANK_TIE_RULE_UNKNOWN');
 const entries=rows.map((r,i)=>({...r,rank:i+1,available:true as const}));
 const result=resolvePriceRank(c,input.date,{id:input.id,poolId:c.poolId,referenceDate:input.date,windowStart:window.start.toISOString(),windowEnd:window.end.toISOString(),conditionHash:conditionHash(c),complete:issues.length===0,candidateCount:wanted.size,tiePolicy:'NO_TIES',sourceUrl:e.sourceUrl,datasetVersion:input.datasetVersion,verified:issues.length===0,entries});
 if(!issues.length&&result.status!=='RESOLVED')issues.push(result.reason);
 return {verified:issues.length===0,issues:[...new Set(issues)],candidateCount:wanted.size,pricedCount:actual.size,coverage:wanted.size?actual.size/wanted.size:0,tieCount:ties,cutoffTie,entries:issues.length?[]:entries};
}
