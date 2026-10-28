import { readFileSync } from 'node:fs';
import { load } from 'cheerio';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { planIncremental } from '@/application/incremental-prices';
import { freshQueryCache } from '@/application/collection-cache';
import { policySchema } from '@/domain/collection/policy';
import { planFullMarket, fullMarketStatus } from '@/application/full-market';
import { currentMarketRanking } from '@/infrastructure/db/current-market';
import { importPlayers } from '@/application/import-players';
import { createCollectionRun, collectRun, planCollection, collectionStatus } from '@/application/price-collection';
import { CollectionError, parsePlayerList } from '@/infrastructure/fconline-data-center/parser';
import { createPlayerRepository } from '@/infrastructure/db/player-repository';
import { createPlayerService } from '@/application/players';
import type { DataCenterClient } from '@/infrastructure/fconline-data-center/client';
import type { CollectionPlan } from '@/domain/players/collection-plan';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Dedicated test database required');
const db = new PrismaClient({ datasources: { db: { url } } });
const html = readFileSync('tests/fixtures/datacenter/uc-two-players.html', 'utf8');
const $ = load(html), fragments = $('[id^="area_playerunit_"]').map((_, e) => $.html(e)).get();
let plan: CollectionPlan, datasetId: string;
const runs: string[] = [];
let tick = 0;
const clock = () => new Date(Date.now() - 10000 + (++tick));
function clientFor(body: string): Pick<DataCenterClient, 'collect'> { return { collect: vi.fn(async (_, record) => { const observedAt = clock(); await record({ startedAt: observedAt, finishedAt: observedAt, statusCode: 200, errorCode: null }); return { html: body, observedAt }; }) }; }
async function create(input = plan) { const run = await createCollectionRun(db, input); runs.push(run.id); return run.id; }
beforeAll(async () => {
  const rows = parsePlayerList(html, { seasonId: 877, enhancements: [1], selectedEnhancement: 1 }).rows;
  const metadata = await importPlayers(db, JSON.stringify(rows.map(r => ({ id: Number(r.spid), name: r.name }))), JSON.stringify([{ seasonId: 877, className: 'UC (Untouchable Champions)', seasonImg: 'https://ssl.nexon.com/test-only.png' }]), new Date()); datasetId = metadata.id;
  plan = await planCollection(db, { pack: 'official-pool-24987-v1' });
});
afterAll(async () => {
  if (!datasetId) { await db.$disconnect(); return; }
  const sources = await db.priceSourceSnapshot.findMany({ where: { OR: runs.map(id => ({ notes: { contains: `Collection run ${id};` } })) }, select: { id: true } });
  await db.priceCollectionRequest.deleteMany({ where: { segment: { runId: { in: runs } } } });
  await db.priceCollectionSegment.deleteMany({ where: { runId: { in: runs } } }); await db.priceCollectionRun.deleteMany({ where: { id: { in: runs } } });
  await db.playerPriceSnapshot.deleteMany({ where: { snapshotId: { in: sources.map(s => s.id) } } }); await db.priceSourceSnapshot.deleteMany({ where: { id: { in: sources.map(s => s.id) } } });
  await db.playerVariant.deleteMany({ where: { player: { datasetId } } }); await db.player.deleteMany({ where: { datasetId } }); await db.season.deleteMany({ where: { datasetId } }); await db.playerDataset.delete({ where: { id: datasetId } }); await db.$disconnect();
});
describe('durable collector, snapshots and resume', () => {
  it('plans from official metadata and saves all enhancements with source links', async () => {
    expect(plan.expectedPlayers).toHaveLength(2); expect(plan.enhancements).toEqual([1,2,3,4,5,6,7]);
    const id = await create(), client = clientFor(html); const result = await collectRun(db, id, client);
    expect(result).toMatchObject({ status: 'COMPLETE', requests: 1, observations: 14, metadataCoverageComplete: true, candidateEligibilityVerified: false, resolvedRankPacks: 0 });
    expect(result.rankGate.verified).toBe(false);
    const source = await db.priceCollectionSegment.findFirstOrThrow({ where: { runId: id }, include: { snapshot: true } }); expect(source.responseHash).toHaveLength(64); expect(source.responseHtml).toBe(html); expect(source.snapshotId).toBeTruthy();
  });
  it('completed runs are idempotent and make no further price request', async () => {
    const id = await create(); await collectRun(db, id, clientFor(html));
    const client = clientFor(html); expect((await collectRun(db, id, client)).observations).toBe(14);
    expect(client.collect).not.toHaveBeenCalled();
  });
  it('splits capped responses into disjoint ranges without importing the truncated parent', async () => {
    const capped = Array.from({ length: 200 }, (_, i) => fragments[0].replaceAll('877020801', String(877100000 + i))).join('');
    const id = await create(); const result = await collectRun(db, id, clientFor(capped), 1);
    expect(result.status).toBe('PAUSED'); expect(result.observations).toBe(0);
    expect(result.segments.map(s => s.status).sort()).toEqual(['PENDING','PENDING','SPLIT']);
    expect(result.segments.filter(s => s.status === 'PENDING').map(s => s.key).sort()).toEqual(['877-0-100','877-101-200']);
  });
  it('pauses pending work when the collection window closes', async () => {
    const id = await create(); const client = { collect: vi.fn(async () => { throw new CollectionError('COLLECTION_WINDOW_CLOSED'); }) };
    const result = await collectRun(db, id, client); expect(result.status).toBe('PAUSED'); expect(result.requests).toBe(0); expect(result.segments[0].status).toBe('PENDING');
  });
  it('pauses and resumes without issuing a request before the budget allows', async () => { const id = await create(), client = clientFor(html); expect((await collectRun(db, id, client, 0)).status).toBe('PAUSED'); expect(client.collect).not.toHaveBeenCalled(); expect((await collectRun(db, id, client, 1)).observations).toBe(14); });
  it('resumes after partial failure and skips completed segments', async () => {
    const p = structuredClone(plan); const q = p.segments[0].query;
    p.segments = [{ key: '877-0-100', query: { ...q, ovrMax: 100 }, expectedCount: 1 }, { key: '877-101-200', query: { ...q, ovrMin: 101 }, expectedCount: 1 }];
    const id = await create(p); let calls = 0;
    const first: Pick<DataCenterClient,'collect'> = { collect: async (q, record) => { calls++; if (q.ovrMin === 101) { const at = clock(); await record({ startedAt: at, finishedAt: at, statusCode: 503, errorCode: 'HTTP_503' }); throw new CollectionError('HTTP_503'); } return clientFor(fragments[0]).collect(q, record); } };
    expect((await collectRun(db, id, first)).status).toBe('FAILED'); expect(calls).toBe(2);
    const resumed = clientFor(fragments[1]); const result = await collectRun(db, id, resumed);
    expect(result).toMatchObject({ status: 'COMPLETE', observations: 14, requests: 3, failedRequests: 1 }); expect(resumed.collect).toHaveBeenCalledTimes(1);
  });
  it('replays persisted HTML/time after an import checkpoint interruption without duplicates', async () => {
    const id = await create(); await collectRun(db, id, clientFor(html));
    await db.priceCollectionSegment.updateMany({ where: { runId: id }, data: { status: 'RUNNING', snapshotId: null } }); await db.priceCollectionRun.update({ where: { id }, data: { status: 'PAUSED' } });
    const client = clientFor('must not be fetched'); const result = await collectRun(db, id, client); expect(result.observations).toBe(14); expect(result.requests).toBe(1); expect(client.collect).not.toHaveBeenCalled();
    expect(await db.priceSourceSnapshot.count({ where: { notes: { contains: `Collection run ${id};` } } })).toBe(1);
  });
  it('security HTML blocks collection and creates no zero-price observations', async () => { const id = await create(); const result = await collectRun(db, id, clientFor('<h1>Security Verification</h1>')); expect(result.status).toBe('BLOCKED'); expect(result.observations).toBe(0); await expect(collectRun(db, id, clientFor(html))).rejects.toThrow('blocked'); });
  it('incomplete metadata coverage remains partial with missing prices', async () => { const id = await create(); const result = await collectRun(db, id, clientFor(fragments[0])); expect(result).toMatchObject({ status: 'PARTIAL', missingPrices: 7, observations: 7, metadataCoverageComplete: false }); expect(result.rankGate.verified).toBe(false); });
  it('30-digit prices survive DB persistence and existing API serialization', async () => { const value = '123,456,789,012,345,678,901,234,567,890'; const huge = html.replace('title="1,260,000,000"', `title="${value}"`); const id = await create(); await collectRun(db, id, clientFor(huge)); const service = createPlayerService(createPlayerRepository(db)); const history = await service.history('877020801', { enhancement: 1 }); expect(history.records.some(r => r.price === value.replaceAll(',','') && r.referenceAt === null)).toBe(true); });
  it('prevents another process collecting while a run lease is active', async () => { const id = await create(); await db.priceCollectionRun.update({ where: { id }, data: { status: 'RUNNING', leaseToken: 'TEST', leaseExpiresAt: new Date(Date.now() + 60000) } }); try { await expect(collectRun(db, id, clientFor(html))).rejects.toThrow('active'); } finally { await db.priceCollectionRun.update({ where: { id }, data: { status: 'PAUSED', leaseToken: null, leaseExpiresAt: null } }); } });
  it('full market collects displayed variants and explicit no-price states, with indexed current ranking', async () => {
    const full = await planFullMarket(db); const id = await create(full);
    await collectRun(db, id, clientFor(html));
    const status = await fullMarketStatus(db, id);
    expect(status).toMatchObject({ fullCoverageVerified: true, playersChecked: 2, variantsChecked: 28, validPricedVariants: 26, notAvailable: 2 });
    expect(status.enhancementCoverage[0]).toMatchObject({ enhancement: 0, variantsWithPrice: 0, notAvailable: 2 });
    await db.$executeRaw`REFRESH MATERIALIZED VIEW "PlayerPriceCurrent"`;
    const ranking = await currentMarketRanking(db, { enhancement: 13, seasons: [877] });
    expect(ranking.length).toBe(2); expect(ranking.every(r => r.referenceAt === null && !r.verifiedRewardRank)).toBe(true);
    expect(BigInt(ranking[0].price) >= BigInt(ranking[1].price)).toBe(true);
  });
  it('full market continues independent segments after a request failure and cannot claim completion', async () => {
    const full = await planFullMarket(db); const q = full.segments[0].query;
    full.segments = [{ key: '877-0-100', query: { ...q, ovrMax: 100 }, expectedCount: null }, { key: '877-101-200', query: { ...q, ovrMin: 101 }, expectedCount: null }];
    const id = await create(full);
    const client = { collect: async (query: typeof q, record: Parameters<Pick<DataCenterClient,'collect'>['collect']>[1]) => { if (query.ovrMax === 100) throw new CollectionError('HTTP_503'); return clientFor(html).collect(query, record); } };
    await collectRun(db, id, client);
    const status = await fullMarketStatus(db, id); expect(status.failedSegments).toBe(1); expect(status.fullCoverageVerified).toBe(false); expect(status.playersWithPrice).toBe(2);
    const resumed = clientFor(readFileSync('tests/fixtures/datacenter/empty.html', 'utf8'));
    await collectRun(db, id, resumed); expect(resumed.collect).toHaveBeenCalledTimes(1);
    expect((await fullMarketStatus(db,id)).fullCoverageVerified).toBe(true);
  });
  it('overlapping segments never create duplicate current variants and remain flagged', async () => {
    const full = await planFullMarket(db); const q = full.segments[0].query;
    full.segments.push({ key: '877-1-200', query: { ...q, ovrMin: 1 }, expectedCount: null });
    const id = await create(full); await collectRun(db, id, clientFor(html));
    const status = await fullMarketStatus(db,id); expect(status.duplicateObservations).toBe(26); expect(status.fullCoverageVerified).toBe(false);
    await db.$executeRaw`REFRESH MATERIALIZED VIEW "PlayerPriceCurrent"`;
    expect((await currentMarketRanking(db,{enhancement:13,seasons:[877]})).length).toBe(2);
  });
  it('budget exhaustion pauses a full build and resume skips successful segments', async () => {
    const full = await planFullMarket(db), q = full.segments[0].query;
    full.segments = [{ key: '877-0-100', query: { ...q, ovrMax: 100 }, expectedCount: null }, { key: '877-101-200', query: { ...q, ovrMin: 101 }, expectedCount: null }];
    const id = await create(full); let calls = 0;
    const client = { collect: async (query: typeof q, record: Parameters<Pick<DataCenterClient,'collect'>['collect']>[1]) => { if (++calls > 1) throw new CollectionError('REQUEST_BUDGET_EXHAUSTED'); return clientFor(fragments[0]).collect(query, record); } };
    expect((await collectRun(db,id,client)).status).toBe('PAUSED');
    expect((await db.priceCollectionRun.findUniqueOrThrow({where:{id}})).lastError).toBe('REQUEST_BUDGET_EXHAUSTED');
    const resumed = clientFor(fragments[1]); await collectRun(db,id,resumed); expect(resumed.collect).toHaveBeenCalledTimes(1);
    expect((await fullMarketStatus(db,id)).fullCoverageVerified).toBe(true);
  });
  it('fresh completed class and query caches skip repeated collection without new observations', async () => {
    const full = await planFullMarket(db), id = await create(full); await collectRun(db,id,clientFor(html));
    const before = await db.playerPriceSnapshot.count();
    const planned = await planIncremental(db,policySchema.parse({})); expect(planned.plan).toBeNull(); expect(planned.summary.skippedFreshClasses).toBe(1);
    const manual = await create(); expect(await freshQueryCache(db,manual)).toBe(true);
    expect(await db.playerPriceSnapshot.count()).toBe(before);
  });
  it('reports changed and unchanged values while preserving heartbeat history', async () => {
    const full = await planFullMarket(db), first = await create(full); await collectRun(db,first,clientFor(html));
    const second = await create(full); await collectRun(db,second,clientFor(html));
    const s = await db.priceCollectionSegment.findFirstOrThrow({where:{runId:second}});
    expect((s.result as {efficiency: unknown}).efficiency).toEqual({newPrices:0,changed:0,unchanged:26});
    const third = await create(full); await collectRun(db,third,clientFor(html.replace('title="1,260,000,000"','title="1,260,000,001"')));
    const t = await db.priceCollectionSegment.findFirstOrThrow({where:{runId:third}});
    expect((t.result as {efficiency: unknown}).efficiency).toEqual({newPrices:0,changed:1,unchanged:25});
  });
  it('a missing enhancement preserves its last current value and does not delete history', async () => {
    const full=await planFullMarket(db), first=await create(full);await collectRun(db,first,clientFor(html));
    const previous=await db.playerCurrentState.findUniqueOrThrow({where:{variantId:'877020801-8'}});
    const missing=load(html);missing('#area_playerunit_877020801 .span_bp8').removeAttr('title').text('-');
    const id=await create({...full,mode:'INCREMENTAL'});await collectRun(db,id,clientFor(missing.html()));
    const current=await db.playerCurrentState.findUniqueOrThrow({where:{variantId:'877020801-8'}});
    expect(current).toEqual(previous);
    const segment=await db.priceCollectionSegment.findFirstOrThrow({where:{runId:id}});
    expect((segment.result as {missing:unknown[]}).missing).toContainEqual({spid:'877020801',enhancement:8,reason:'NOT_AVAILABLE'});
    expect((await fullMarketStatus(db,id)).observations).toBe(25);
  });
  it('compressed incremental run coverage counts observed variants even without history inserts',async()=>{
    const full=await planFullMarket(db),first=await create(full);await collectRun(db,first,clientFor(html));
    const count=await db.playerPriceSnapshot.count();
    const id=await create({...full,mode:'INCREMENTAL'});await collectRun(db,id,clientFor(html));
    expect(await db.playerPriceSnapshot.count()).toBe(count);
    expect(await fullMarketStatus(db,id)).toMatchObject({status:'COMPLETE',observations:26,historyRows:0,validPricedVariants:26,duplicateObservations:0});
    expect((await fullMarketStatus(db,id)).observedWindow.start).not.toBeNull();
  });
  it('keeps historical source timestamps and never creates a verified rank snapshot', async () => { const result = await collectionStatus(db, runs[0]); expect(result.observedWindow.start).toBe(result.observedWindow.end); expect(await db.playerPriceRankSnapshot.count()).toBe(0); });
});
