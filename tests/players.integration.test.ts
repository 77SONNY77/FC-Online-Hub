import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { importPlayers, importPrices } from '@/application/import-players';
import { createPlayerRepository } from '@/infrastructure/db/player-repository';
import { createPlayerService } from '@/application/players';
import { resolutionCoverage } from '@/application/reward-resolution';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Dedicated test database required');
const db = new PrismaClient({ datasources: { db: { url } } });
const service = createPlayerService(createPlayerRepository(db));
const suffix = randomUUID();
const playersRaw = JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ id: 999000001 + i, name: `SYNTHETIC ${suffix} ${String(i).padStart(2, '0')}` })));
const seasonsRaw = JSON.stringify([{ seasonId: 999, className: `SYNTHETIC ${suffix}`, seasonImg: 'https://ssl.nexon.com/test.png' }]);
const observedAt = new Date().toISOString();
const capture = { sourceUrl: 'https://fconline.nexon.com/datacenter', observedAt, referenceAt: null, notes: `SYNTHETIC TEST ONLY ${suffix}`, rows: [{ spid: '999000001', name: `SYNTHETIC ${suffix} 00`, enhancement: 8, price: '123456789012345678901234567890', ovr: null, position: null }, { spid: '999000001', name: `SYNTHETIC ${suffix} 00`, enhancement: 9, price: '234567890123456789012345678901', ovr: null, position: null }] };
let datasetId: string;
beforeAll(async () => { const result = await importPlayers(db, playersRaw, seasonsRaw, new Date(observedAt)); datasetId = result.id; await importPrices(db, capture); });
afterAll(async () => {
  if (!datasetId) { await db.$disconnect(); return; }
  await db.playerPriceSnapshot.deleteMany({ where: { variant: { spid: { startsWith: '999' } } } });
  await db.playerVariant.deleteMany({ where: { spid: { startsWith: '999' } } });
  await db.priceSourceSnapshot.deleteMany({ where: { notes: { contains: suffix } } });
  await db.player.deleteMany({ where: { datasetId } }); await db.season.deleteMany({ where: { datasetId } }); await db.playerDataset.deleteMany({ where: { id: datasetId } }); await db.$disconnect();
});
describe('player/price persistence and internal API services', () => {
  it('imports metadata idempotently with unique SPID and exact UTC observation time', async () => { expect((await importPlayers(db, playersRaw, seasonsRaw, new Date(observedAt))).imported).toBe(false); expect(await db.player.count({ where: { datasetId } })).toBe(30); expect((await db.playerDataset.findUniqueOrThrow({ where: { id: datasetId } })).playersRaw).toBe(playersRaw); expect((await service.detail('999000001')).lastUpdatedAt).toBe(observedAt); });
  it('searches names and seasons with stable pagination', async () => { const first = await service.list({ q: suffix, season: 999 }); const second = await service.list({ q: suffix, season: 999, page: 2 }); expect(first.items).toHaveLength(24); expect(second.items).toHaveLength(6); expect(new Set([...first.items, ...second.items].map(p => p.spid)).size).toBe(30); expect((await service.list({ q: 'NOT_A_PLAYER' })).items).toEqual([]); });
  it('preserves exact BP per enhancement and unknown reference time', async () => { const p8 = await service.detail('999000001', { enhancement: 8 }); const p9 = await service.detail('999000001', { enhancement: 9 }); expect(p8.price?.price).toBe(capture.rows[0].price); expect(p9.price?.price).toBe(capture.rows[1].price); expect(p8.price).toMatchObject({ referenceAt: null, observedAt, freshness: 'UNKNOWN', verificationStatus: 'NEEDS_VERIFICATION', ovr: null, position: null }); expect(p8.availableEnhancements).toEqual([8, 9]); });
  it('represents missing price as null and history as an empty array', async () => { expect((await service.detail('999000001', { enhancement: 1 })).price).toBeNull(); expect(await service.history('999000002', {})).toMatchObject({ records: [], status: 'UNAVAILABLE', total: 0 }); });
  it('prevents duplicate and conflicting same-time price imports', async () => { expect((await importPrices(db, capture)).imported).toBe(false); await expect(importPrices(db, { ...capture, rows: [{ ...capture.rows[0], price: '1' }] })).rejects.toThrow('Conflicting'); expect((await service.history('999000001', { enhancement: 8 })).total).toBe(1); });
  it('appends real observations without fabricating reference time or overwriting history', async () => { await importPrices(db, { ...capture, observedAt: new Date(Date.parse(observedAt) - 1000).toISOString(), rows: [{ ...capture.rows[0], price: '100' }] }); const history = await service.history('999000001', { enhancement: 8 }); expect(history.records.map(p => p.price)).toEqual([capture.rows[0].price, '100']); expect(history.records.every(p => p.referenceAt === null)).toBe(true); });
  it('rejects wrong metadata atomically', async () => { const count = await db.priceSourceSnapshot.count(); await expect(importPrices(db, { ...capture, observedAt: new Date(Date.parse(observedAt) - 2000).toISOString(), rows: [{ ...capture.rows[0], name: 'WRONG' }] })).rejects.toThrow('metadata mismatch'); expect(await db.priceSourceSnapshot.count()).toBe(count); });
  it('keeps all actual rank players unresolved and propagates BP definitions', async () => { const result = await resolutionCoverage(db, 'official-shop-44699-20260920', '2026-09-20'); expect(result.counts).toEqual({ tables: 12, fullyResolved: 2, partiallyResolved: 4, unresolved: 6, entries: 1208, resolvedEntries: 5, unresolvedEntries: 1203, resolvedPlayers: 0 }); });
});
