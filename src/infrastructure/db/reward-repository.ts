import 'server-only';
import { resolutionCoverage } from '@/application/reward-resolution';
import { getDb } from './client';
import type { RewardRepository } from '@/domain/rewards/repository';
export const rewardRepository: RewardRepository = {
  async probabilities(itemVersionId, page) {
    const db = getDb();
    const pool = await db.rewardPoolVersion.findFirst({ where: { itemVersionId, verificationStatus: { not: 'REJECTED' }, dataset: { verificationStatus: { not: 'REJECTED' } } }, include: { itemVersion: true, dataset: { include: { source: true } }, snapshot: true, _count: { select: { entries: true } } } });
    if (!pool) return null;
    if (pool.itemVersion.datasetId !== pool.datasetId || pool.snapshot.datasetId !== pool.datasetId) throw new Error('Reward source isolation failure');
    const rows = await db.probabilityEntry.findMany({ where: { poolId: pool.id }, orderBy: { position: 'asc' }, skip: (page - 1) * 50, take: 50 });
    const d = pool.dataset;
    const referenceDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const resolution = await resolutionCoverage(db, d.id, referenceDate);
    return {
      item: { id: pool.itemVersion.id, name: pool.itemVersion.name, kind: pool.itemVersion.kind, metadata: { datasetId: d.id, datasetVersion: d.version, source: d.source.kind, sourceName: 'FC Online 공식 확률 공시', sourceUrl: pool.snapshot.sourceUrl, sourceNotes: d.source.notes, dataType: d.dataType, verificationStatus: d.verificationStatus, verified: d.verificationStatus === 'VERIFIED', verifiedAt: d.verifiedAt?.toISOString() ?? null, lastUpdatedAt: d.lastUpdatedAt.toISOString() } },
      pool: { resolutionStatus: resolution.pools[pool.id], resolutionDate: referenceDate, id: pool.id, version: pool.version, behavior: pool.behavior, conditionRaw: pool.conditionRaw, effectivePeriod: pool.effectivePeriod, verificationStatus: pool.verificationStatus, denominator: pool.denominator.toFixed(0), sumNumerator: pool.sumNumerator.toFixed(0), toleranceNumerator: pool.toleranceNumerator.toFixed(0), evidence: { id: pool.snapshot.id, sourceUrl: pool.snapshot.sourceUrl, fetchedAt: pool.snapshot.fetchedAt.toISOString(), verifiedAt: pool.snapshot.verifiedAt.toISOString(), contentHash: pool.snapshot.contentHash, acquisition: pool.snapshot.acquisition, retrievalNote: pool.snapshot.retrievalNote } },
      entries: rows.map(r => ({ resolution: resolution.entries[r.id], id: r.id, rewardLabel: r.rewardLabel, quantity: r.quantity, probabilityRaw: r.probabilityRaw, numerator: r.numerator.toFixed(0), conditionRaw: r.conditionRaw, targetType: r.targetType, rank: r.rank, bpAmount: r.bpAmount?.toFixed(0) ?? null, targetItemVersionId: r.targetItemVersionId })),
      pagination: { page, pageSize: 50, total: pool._count.entries, pages: Math.ceil(pool._count.entries / 50) },
    };
  },
};
