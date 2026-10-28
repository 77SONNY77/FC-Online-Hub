import type { PrismaClient } from '@prisma/client';
import { collectionPlanSchema, type CollectionPlan } from '@/domain/players/collection-plan';

export async function planFullMarket(db: PrismaClient) {
  const dataset = await db.playerDataset.findFirstOrThrow({ orderBy: { observedAt: 'desc' } });
  const [players, seasons] = await Promise.all([
    db.player.findMany({ where: { datasetId: dataset.id }, select: { spid: true, name: true, seasonId: true }, orderBy: { spid: 'asc' } }),
    db.season.findMany({ where: { datasetId: dataset.id }, orderBy: { id: 'asc' } }),
  ]);
  const enhancements = Array.from({ length: 14 }, (_, i) => i);
  return collectionPlanSchema.parse({ version: 1, mode: 'FULL', targetPoolId: null, targetName: 'Full Data Center Market', top: null, metadataDatasetId: dataset.id, expectedPlayers: players, enhancements,
    unsupportedConditions: ['Metadata is not a listing guarantee', 'Level 0 is a displayed no-price state in verified fixtures', 'Official reference time and pack eligibility unknown'],
    segments: seasons.map(s => ({ key: `${s.id}-0-200`, expectedCount: players.filter(p => p.seasonId === s.id).length, query: { seasonId: s.id, enhancements, selectedEnhancement: 1, ovrMin: 0, ovrMax: 200, page: 1, sort: 'BASE_PRICE_DESC' } })), createdAt: new Date().toISOString() });
}
export function auditFullPlan(plan: CollectionPlan, classIds: number[]) {
  const ids = plan.segments.map(s => s.query.seasonId);
  if (plan.mode !== 'FULL' || new Set(ids).size !== ids.length || ids.length !== classIds.length || classIds.some(id => !ids.includes(id)) || plan.expectedPlayers.some(p => !ids.includes(p.seasonId))) throw new Error('Missing or duplicate class segment');
  if (plan.segments.some(s => s.query.ovrMin !== 0 || s.query.ovrMax !== 200 || s.query.enhancements.join(',') !== '0,1,2,3,4,5,6,7,8,9,10,11,12,13')) throw new Error('Missing filter or enhancement coverage');
  const lowerBound = plan.segments.reduce((n, s) => n + Math.max(1, Math.ceil((s.expectedCount ?? 0) / 199)), 0);
  const estimate = plan.segments.reduce((n, s) => n + ((s.expectedCount ?? 0) < 200 ? 1 : 2 * Math.ceil((s.expectedCount ?? 0) / 150) - 1), 0);
  return { dryRun: true, players: plan.expectedPlayers.length, classes: ids.length, enhancementChecks: plan.enhancements, initialSegments: ids.length, metadataPriceUpperBound: plan.expectedPlayers.length * 13, validVariants: null, requests: { metadataBasedLowerBound: lowerBound, modelEstimate: estimate, absoluteOvrTreeBound: ids.length * 401 }, estimatedDelaySeconds: estimate * 3, note: 'Estimates assume metadata listings; distribution, empty ranges and retries change actual cost. Valid combinations are discovered, never pre-created.' };
}
export type SegmentResult = { playerIds: string[]; missing: { spid: string; enhancement: number; reason: string }[] };
export async function fullMarketStatus(db: PrismaClient, id: string) {
  const run = await db.priceCollectionRun.findUniqueOrThrow({ where: { id }, include: { segments: { select: { id: true, key: true, query: true, parentKey: true, status: true, result: true, lastError: true, expectedCount: true, retrievedCount: true, observedAt: true, snapshotId: true } } } });
  const plan = collectionPlanSchema.parse(run.plan);
  const keyedSnapshots=run.segments.filter(s=>(s.result as {pricedVariantIds?:string[]}|null)?.pricedVariantIds).map(s=>s.snapshotId).filter((id):id is string=>id!==null);
  const [prices, requests, historyRows] = await Promise.all([
    db.playerPriceSnapshot.findMany({ where: { snapshot: { collectionSegment: { runId: id } }, snapshotId:{notIn:keyedSnapshots} }, select: { snapshotId: true, variantId: true, observedAt: true, variant: { select: { spid: true, enhancement: true } } } }),
    db.priceCollectionRequest.findMany({ where: { segment: { runId: id } }, select: { segmentId: true, startedAt: true, finishedAt: true, errorCode: true } }),
    db.playerPriceSnapshot.count({where:{snapshot:{collectionSegment:{runId:id}}}}),
  ]);
  const discovered = run.segments.filter(s=>s.status==='SUCCEEDED').flatMap(s=>(s.result as {pricedVariantIds?:string[]}|null)?.pricedVariantIds??[]);
  const withKeys=new Set(run.segments.filter(s=>(s.result as {pricedVariantIds?:string[]}|null)?.pricedVariantIds).map(s=>s.snapshotId));
  const observedKeys=[...discovered,...prices.filter(p=>!withKeys.has(p.snapshotId)).map(p=>p.variantId)];
  const checked = new Set<string>(), missing = new Map<string, string>(), priced = new Set(observedKeys), pricedPlayers = new Set(observedKeys.map(k=>k.split('-')[0]));
  for (const s of run.segments.filter(s => s.status === 'SUCCEEDED')) { const result = s.result as SegmentResult | null; for (const spid of result?.playerIds ?? []) checked.add(spid); for (const m of result?.missing ?? []) missing.set(`${m.spid}-${m.enhancement}`, m.reason); }
  const classes = [...new Map(plan.segments.map(s => [s.query.seasonId, s])).values()].map(initial => {
    const seasonId = initial.query.seasonId, prefix = String(seasonId), segments = run.segments.filter(s => s.key.startsWith(prefix + '-'));
    const count = (set: Set<string>) => [...set].filter(k => k.startsWith(prefix)).length;
    const total = plan.expectedPlayers.filter(p => p.seasonId === seasonId).length;
    const completed = segments.every(s => ['SUCCEEDED','SPLIT'].includes(s.status));
    return { seasonId, totalPlayers: total, playersChecked: count(checked), playersWithPrice: count(pricedPlayers), variantsWithPrice: count(priced), notListed: completed ? plan.expectedPlayers.filter(p => p.seasonId === seasonId && !checked.has(p.spid)).length : null, segmentCoveragePercent: (segments.filter(s => ['SUCCEEDED','SPLIT'].includes(s.status)).length / segments.length * 100).toFixed(2), metadataPriceCoveragePercent: total ? (count(pricedPlayers) / total * 100).toFixed(2) : '0.00', complete: completed };
  });
  const enhancementCoverage = plan.enhancements.map(enhancement => ({ enhancement, variantsChecked: checked.size, variantsWithPrice: [...priced].filter(k=>k.endsWith(`-${enhancement}`)).length, notAvailable: [...missing.keys()].filter(k => k.endsWith(`-${enhancement}`)).length }));
  const pending = run.segments.filter(s => s.status === 'PENDING' || s.status === 'RUNNING').length, failed = run.segments.filter(s => ['FAILED','BLOCKED'].includes(s.status)).length;
  const times = requests.flatMap(r => [r.startedAt.getTime(), r.finishedAt.getTime()]);
  const start = times.length ? times.reduce((a,b) => Math.min(a,b)) : null, end = times.length ? times.reduce((a,b) => Math.max(a,b)) : null;
  const runtimeSeconds = start !== null && end !== null ? (end - start) / 1000 : 0;
  const durations = requests.map(r => r.finishedAt.getTime() - r.startedAt.getTime());
  const overlappingObservations=observedKeys.length-priced.size;
  const duplicateObservations=plan.segments.some(s=>s.query.subdivision==='LEGACY')?0:overlappingObservations;
  return { runId: id, status: run.status, source: 'OFFICIAL_WEB', collectionStartedAt: run.startedAt?.toISOString() ?? null, collectionCompletedAt: run.status === 'COMPLETE' ? run.finishedAt?.toISOString() : null,
    totalPlayers: plan.expectedPlayers.length, totalClasses: classes.length, playersChecked: checked.size, playersWithPrice: pricedPlayers.size, validPricedVariants: priced.size, variantsChecked: checked.size * plan.enhancements.length, notAvailable: missing.size, uncheckedMetadataPlayers: plan.expectedPlayers.filter(p => !checked.has(p.spid)).length,
    metadataPriceCoveragePercent: (pricedPlayers.size / plan.expectedPlayers.length * 100).toFixed(2), fullCoverageVerified: pending === 0 && failed === 0 && duplicateObservations === 0 && classes.every(c => c.complete),
    plannedSegments: run.segments.length, completedSegments: run.segments.filter(s => s.status === 'SUCCEEDED').length, splitSegments: run.segments.filter(s => s.status === 'SPLIT').length, pendingSegments: pending, failedSegments: failed,
    requests: requests.length, successfulRequests: requests.filter(r => !r.errorCode).length, failedRequests: requests.filter(r => r.errorCode).length, retryCount: requests.length - new Set(requests.map(r => r.segmentId)).size, runtimeSeconds, requestsPerSecond: runtimeSeconds ? requests.length / runtimeSeconds : 0, averageResponseMs: durations.length ? durations.reduce((a,b) => a+b,0) / durations.length : 0,
    overlappingObservations, observations: observedKeys.length, historyRows, duplicateObservations, observedWindow: { start: run.segments.filter(s=>s.status==='SUCCEEDED'&&s.observedAt).map(s=>s.observedAt!.toISOString()).sort()[0]??null, end: run.segments.filter(s=>s.status==='SUCCEEDED'&&s.observedAt).map(s=>s.observedAt!.toISOString()).sort().at(-1)??null }, classes, enhancementCoverage,
    segments: run.segments.map(s => ({ key: s.key, status: s.status, error: s.lastError, expectedCount: s.expectedCount, retrievedCount: s.retrievedCount })),
  };
}
