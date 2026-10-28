import type { PrismaClient } from '@prisma/client';
import { hash } from '@/domain/players/metadata';
import { combineStatuses, conditionHash, resolvePriceRank, type PoolStatus, type RankCondition, type ResolvedPlayer } from '@/domain/rewards/resolution';
// Only these documented Phase 3 definitions are supported. OVR basis is deliberately unknown.
export const definitions: Record<string, { classPrefix: string; enhancements: number[]; top: number; minOvr: number | null }> = {
  '24962': { classPrefix: '26 TOTS (', enhancements: [11], top: 135, minOvr: 120 },
  '24963': { classPrefix: '26 TOTS (', enhancements: [10], top: 105, minOvr: 120 },
  '24965': { classPrefix: 'UC (', enhancements: [11], top: 80, minOvr: 119 },
  '24966': { classPrefix: 'UC (', enhancements: [10], top: 65, minOvr: 119 },
  '24964': { classPrefix: 'UC (', enhancements: [8, 9], top: 60, minOvr: 118 },
  '24987': { classPrefix: 'UC (', enhancements: [1, 2, 3, 4, 5, 6, 7], top: 750, minOvr: null },
};
export async function resolutionCoverage(db: PrismaClient, datasetId: string, referenceDate: string) {
  const pools = await db.rewardPoolVersion.findMany({ where: { datasetId }, include: { itemVersion: true, entries: true } });
  const seasons = await db.season.findMany();
  const entryResults = new Map<string, { status: PoolStatus; reason: string; player: ResolvedPlayer | null }>();
  const poolResults = new Map<string, PoolStatus>();
  for (const pool of pools.filter(p => p.behavior === 'PLAYER_POOL')) {
    const sn = /^official-pool-(\d+)-v1$/.exec(pool.id)?.[1], definition = sn ? definitions[sn] : undefined;
    const season = definition ? seasons.find(s => s.name.startsWith(definition.classPrefix)) : undefined;
    let result = { status: 'NEEDS_VERIFICATION', reason: 'UNSUPPORTED_CONDITION', entries: [] } as ReturnType<typeof resolvePriceRank>;
    if (definition && season && pool.entries.length === definition.top) {
      const condition: RankCondition = { poolId: pool.id, rawHash: hash(pool.itemVersion.name + '\n' + pool.conditionRaw), seasonId: season.id, enhancements: definition.enhancements, minOvr: definition.minOvr, ovrBasis: definition.minOvr === null ? 'NONE' : 'UNKNOWN', excludeUnavailable: true, top: definition.top };
      const snapshots = await db.playerPriceRankSnapshot.findMany({ where: { poolId: pool.id, referenceDate, conditionHash: conditionHash(condition), verificationStatus: 'VERIFIED', resolutionStatus: 'RESOLVED' }, include: { entries: { include: { variant: { include: { player: true } }, priceSnapshot: { include: { snapshot: true } } } } }, orderBy: { id: 'asc' } });
      // Conflicting snapshots require review; never silently select the latest one.
      const s = snapshots.length === 1 ? snapshots[0] : null;
      result = resolvePriceRank(condition, referenceDate, s ? { ...s, verified: true, windowStart: s.windowStart.toISOString(), windowEnd: s.windowEnd.toISOString(), entries: s.entries.map(e => ({ rank: e.rank, spid: e.variant.spid, name: e.variant.player.name, seasonId: e.variant.player.seasonId, enhancement: e.variant.enhancement, price: e.priceSnapshot.price.toFixed(0), referenceAt: e.priceSnapshot.referenceAt?.toISOString(), observedAt: e.priceSnapshot.observedAt.toISOString(), available: e.available, ovr: e.priceSnapshot.ovr, verified: e.priceSnapshot.verificationStatus === 'VERIFIED' && e.priceSnapshot.variantId === e.variantId && ['OFFICIAL_WEB', 'OFFICIAL_API'].includes(e.priceSnapshot.snapshot.source) })) } : null);
      if (snapshots.length > 1) result = { status: 'NEEDS_VERIFICATION', reason: 'CONFLICTING_SNAPSHOTS', entries: [] };
    }
    for (const entry of pool.entries) entryResults.set(entry.id, { status: result.status, reason: result.reason, player: (() => { const player = result.entries.find(r => r.rank === entry.rank); return player ? { ...player, seasonName: seasons.find(s => s.id === player.seasonId)?.name } : null; })() });
    poolResults.set(pool.id, result.status);
  }
  const byItem = new Map(pools.map(p => [p.itemVersionId, p]));
  function visit(pool: typeof pools[number], path = new Set<string>()): PoolStatus {
    if (poolResults.has(pool.id)) return poolResults.get(pool.id)!;
    if (path.has(pool.id)) return 'NEEDS_VERIFICATION';
    const next = new Set(path).add(pool.id);
    const statuses = pool.entries.map(e => {
      let status: PoolStatus = 'UNRESOLVED';
      if (e.targetType === 'BP_AMOUNT' && e.bpAmount && pool.verificationStatus === 'VERIFIED') status = 'RESOLVED';
      else if (e.targetItemVersionId && byItem.has(e.targetItemVersionId)) status = visit(byItem.get(e.targetItemVersionId)!, next);
      entryResults.set(e.id, { status, reason: status === 'RESOLVED' ? 'FIXED_REWARD_DEFINED' : 'NESTED_PLAYER_SNAPSHOT_MISSING', player: null });
      return status;
    });
    const status = combineStatuses(statuses); poolResults.set(pool.id, status); return status;
  }
  pools.forEach(p => visit(p));
  const entries = [...entryResults.values()];
  return { referenceDate, pools: Object.fromEntries(poolResults), entries: Object.fromEntries(entryResults), counts: { tables: pools.length, fullyResolved: [...poolResults.values()].filter(s => s === 'RESOLVED').length, partiallyResolved: [...poolResults.values()].filter(s => s === 'PARTIALLY_RESOLVED').length, unresolved: [...poolResults.values()].filter(s => s === 'UNRESOLVED' || s === 'NEEDS_VERIFICATION').length, entries: entries.length, resolvedEntries: entries.filter(e => e.status === 'RESOLVED').length, unresolvedEntries: entries.filter(e => e.status !== 'RESOLVED').length, resolvedPlayers: entries.filter(e => e.player).length } };
}
