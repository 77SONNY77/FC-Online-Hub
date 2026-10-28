import { z } from 'zod';
import { hash } from '@/domain/players/metadata';
import { bpSchema, spidSchema } from '@/domain/players/price';
export const conditionSchema = z.object({
  poolId: z.string().min(1), rawHash: z.string().regex(/^[a-f0-9]{64}$/), seasonId: z.number().int().positive(),
  enhancements: z.array(z.number().int().min(1).max(13)).min(1), minOvr: z.number().int().positive().nullable(),
  ovrBasis: z.enum(['ENHANCED', 'UNKNOWN', 'NONE']), excludeUnavailable: z.literal(true), top: z.number().int().positive(),
});
export type RankCondition = z.infer<typeof conditionSchema>;
export const conditionHash = (c: RankCondition) => hash(JSON.stringify(conditionSchema.parse(c)));
const rankEntrySchema = z.object({ rank: z.number().int().positive(), spid: spidSchema, name: z.string().min(1), seasonId: z.number().int().positive(), enhancement: z.number().int().min(1).max(13), price: bpSchema, referenceAt: z.iso.datetime(), observedAt: z.iso.datetime(), available: z.literal(true), ovr: z.number().int().positive().nullable(), verified: z.literal(true) });
export const rankSnapshotSchema = z.object({
  id: z.string().min(1), poolId: z.string(), referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), windowStart: z.iso.datetime(), windowEnd: z.iso.datetime(),
  conditionHash: z.string(), complete: z.literal(true), candidateCount: z.number().int().positive(), tiePolicy: z.literal('NO_TIES'),
  sourceUrl: z.string().url().refine(s => ['fconline.nexon.com', 'open.api.nexon.com'].includes(new URL(s).hostname) && new URL(s).protocol === 'https:'),
  datasetVersion: z.string().min(1), verified: z.literal(true), entries: z.array(rankEntrySchema).min(1),
});
export type ResolvedPlayer = z.infer<typeof rankEntrySchema> & { sourceUrl: string; snapshotId: string; seasonName?: string };
export type RankResult = { status: 'RESOLVED' | 'UNRESOLVED' | 'NEEDS_VERIFICATION'; reason: string; entries: ResolvedPlayer[] };
export function resolvePriceRank(condition: RankCondition, referenceDate: string, snapshot: unknown): RankResult {
  const fail = (reason: string, status: RankResult['status'] = 'UNRESOLVED'): RankResult => ({ status, reason, entries: [] });
  const c = conditionSchema.safeParse(condition);
  if (!c.success || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) return fail('INVALID_CONDITION', 'NEEDS_VERIFICATION');
  if (!snapshot) return fail('MISSING_REFERENCE_SNAPSHOT');
  const parsed = rankSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return fail('UNVERIFIED_OR_INCOMPLETE_SNAPSHOT', 'NEEDS_VERIFICATION');
  const s = parsed.data;
  const start = new Date(`${referenceDate}T00:00:00+09:00`), end = new Date(`${referenceDate}T01:00:00+09:00`);
  if (!Number.isFinite(start.getTime()) || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start) !== referenceDate) return fail('INVALID_DATE');
  if (s.poolId !== c.data.poolId || s.referenceDate !== referenceDate || s.windowStart !== start.toISOString() || s.windowEnd !== end.toISOString() || s.conditionHash !== conditionHash(c.data)) return fail('CONDITION_OR_TIME_MISMATCH');
  if (c.data.minOvr !== null && c.data.ovrBasis !== 'ENHANCED') return fail('OVR_BASIS_NOT_VERIFIED', 'NEEDS_VERIFICATION');
  const rows = [...s.entries].sort((a, b) => a.rank - b.rank);
  if (rows.length !== s.candidateCount || rows.length < c.data.top || new Set(rows.map(r => `${r.spid}-${r.enhancement}`)).size !== rows.length) return fail('INCOMPLETE_CANDIDATES');
  for (const [i, row] of rows.entries()) {
    if (row.rank !== i + 1 || row.seasonId !== c.data.seasonId || Number(row.spid.slice(0, 3)) !== row.seasonId || !c.data.enhancements.includes(row.enhancement) || (c.data.minOvr !== null && (row.ovr === null || row.ovr < c.data.minOvr))) return fail('CANDIDATE_CONDITION_MISMATCH');
    const reference = Date.parse(row.referenceAt), observed = Date.parse(row.observedAt);
    if (reference < start.getTime() || reference >= end.getTime() || observed < reference || observed < start.getTime() || observed >= end.getTime() || observed > Date.now()) return fail('PRICE_REFERENCE_MISMATCH');
    if (i && BigInt(rows[i - 1].price) <= BigInt(row.price)) return fail('TIES_OR_INVALID_ORDER', 'NEEDS_VERIFICATION');
  }
  // Require a coherent reference instant, not a mixture of quotes inside the hour.
  if (new Set(rows.map(r => r.referenceAt)).size !== 1) return fail('MIXED_REFERENCE_TIMES');
  return { status: 'RESOLVED', reason: 'MATCHED_VERIFIED_SNAPSHOT', entries: rows.slice(0, c.data.top).map(r => ({ ...r, sourceUrl: s.sourceUrl, snapshotId: s.id })) };
}
export type PoolStatus = 'RESOLVED' | 'PARTIALLY_RESOLVED' | 'UNRESOLVED' | 'NEEDS_VERIFICATION';
export function combineStatuses(statuses: PoolStatus[]): PoolStatus {
  if (!statuses.length) return 'UNRESOLVED';
  if (statuses.every(s => s === 'RESOLVED')) return 'RESOLVED';
  if (statuses.some(s => s === 'RESOLVED' || s === 'PARTIALLY_RESOLVED')) return 'PARTIALLY_RESOLVED';
  return statuses.includes('NEEDS_VERIFICATION') ? 'NEEDS_VERIFICATION' : 'UNRESOLVED';
}
