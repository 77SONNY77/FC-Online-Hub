import { z } from 'zod';
import { hash } from './metadata';
export const segmentQuerySchema = z.object({ seasonId: z.number().int().min(100).max(999), subdivision: z.literal('LEGACY').optional(), position: z.array(z.number().int().min(0).max(27)).min(1).optional(), height: z.tuple([z.number().int().min(0).max(260),z.number().int().min(0).max(260)]).optional(), enhancements: z.array(z.number().int().min(0).max(13)).min(1).max(14).refine(v => new Set(v).size === v.length), selectedEnhancement: z.number().int().min(1).max(13), ovrMin: z.number().int().min(0).max(200), ovrMax: z.number().int().min(0).max(200), page: z.literal(1), sort: z.literal('BASE_PRICE_DESC') }).refine(q => q.ovrMin <= q.ovrMax);
export type SegmentQuery = z.infer<typeof segmentQuerySchema>;
export const collectionPlanSchema = z.object({ version: z.literal(1), mode: z.enum(['TARGETED', 'GENERAL', 'FULL', 'INCREMENTAL', 'REFERENCE', 'RECONCILIATION']), targetPoolId: z.string().nullable(), targetName: z.string(), top: z.number().int().positive().nullable(), metadataDatasetId: z.string(), expectedPlayers: z.array(z.object({ spid: z.string().regex(/^\d{9}$/), name: z.string(), seasonId: z.number().int() })), enhancements: z.array(z.number().int()), unsupportedConditions: z.array(z.string()), segments: z.array(z.object({ key: z.string(), priority: z.number().int().optional(), query: segmentQuerySchema, expectedCount: z.number().int().nullable() })).min(1), createdAt: z.iso.datetime() });
export type CollectionPlan = z.infer<typeof collectionPlanSchema>;
export function inKstCollectionWindow(date = new Date()) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).format(date) === '00'; }
export const planHash = (plan: CollectionPlan) => hash(JSON.stringify(collectionPlanSchema.parse(plan)));
export function splitSegment(query: SegmentQuery): SegmentQuery[] {
  if(query.subdivision==='LEGACY'){
    if(query.ovrMin<query.ovrMax)return Array.from({length:query.ovrMax-query.ovrMin+1},(_,i)=>({...query,ovrMin:query.ovrMin+i,ovrMax:query.ovrMin+i}));
    if(!query.position)return [[0],[24,25,26],[20,21,22],[27],[23],[13,14,15],[17,18,19],[9,10,11],[16],[12],[1,4,5,6],[3],[7],[2],[8]].map(position=>({...query,position}));
    if(!query.height)return [[0,169],[170,174],[175,179],[180,184],[185,260]].map(height=>({...query,height:height as [number,number]}));
    return [];
  }
  if (query.ovrMin === query.ovrMax) return [];
  const mid = Math.floor((query.ovrMin + query.ovrMax) / 2);
  return [{ ...query, ovrMax: mid }, { ...query, ovrMin: mid + 1 }];
}
export function candidateCoverage(expected: string[], actual: string[]) {
  const wanted = new Set(expected), received = new Set(actual);
  const missing = [...wanted].filter(k => !received.has(k)), unexpected = [...received].filter(k => !wanted.has(k));
  return { expected: wanted.size, collected: received.size, missing, unexpected, duplicateCount: actual.length - received.size, complete: wanted.size > 0 && !missing.length && !unexpected.length && actual.length === received.size };
}
export function rankCollectionGate(input: { coverageComplete: boolean; candidates: number; priced: number; referenceWindowVerified: boolean; conditionsVerified: boolean; coherentTime: boolean }) {
  if (!input.coverageComplete || input.candidates === 0 || input.priced !== input.candidates) return { verified: false, reason: 'INCOMPLETE_CANDIDATES' };
  if (!input.referenceWindowVerified || !input.coherentTime) return { verified: false, reason: 'OFFICIAL_REFERENCE_WINDOW_UNKNOWN' };
  if (!input.conditionsVerified) return { verified: false, reason: 'ELIGIBILITY_NOT_VERIFIED' };
  return { verified: true, reason: 'VERIFIED_INPUTS' };
}

export function segmentKey(q:SegmentQuery){return `${q.seasonId}-${q.ovrMin}-${q.ovrMax}${q.position?'-p'+q.position.join('_'):''}${q.height?'-h'+q.height.join('_'):''}`;}
