import 'server-only';
import type { PrismaClient, Prisma } from '@prisma/client';
import { getDb } from './client';
import { priceFreshness, observationFreshness, observationStaleness } from '@/domain/players/price';
import { metadataUrl } from '@/domain/players/metadata';
const priceInclude = { snapshot: true, variant: true } satisfies Prisma.PlayerPriceSnapshotInclude;
function priceView(p: Prisma.PlayerPriceSnapshotGetPayload<{ include: typeof priceInclude }>) {
  return { staleness:observationStaleness(p.observedAt.toISOString()), reason:p.reason, price: p.price.toFixed(0), enhancement: p.variant.enhancement, referenceAt: p.referenceAt?.toISOString() ?? null, observedAt: p.observedAt.toISOString(), source: p.snapshot.source, sourceUrl: p.snapshot.sourceUrl, datasetVersion: p.snapshotId, verificationStatus: p.verificationStatus, observationFreshness: observationFreshness(p.observedAt.toISOString()), freshness: priceFreshness(p.referenceAt?.toISOString() ?? null, p.observedAt.toISOString()), ovr: p.ovr, position: p.position };
}
const includePlayer = (enhancement: number) => ({ season: true, variants: { where: { enhancement }, include: { current: true, prices: { where: { verificationStatus: { not: 'REJECTED' as const }, snapshot: { source: { in: ['OFFICIAL_WEB' as const, 'OFFICIAL_API' as const] } } }, orderBy: [{ observedAt: 'desc' as const }, { id: 'asc' as const }], take: 1, include: priceInclude } } } });
function playerView(p: Prisma.PlayerGetPayload<{ include: ReturnType<typeof includePlayer> }>) {
  const latest = p.variants[0]?.prices[0];
  const current = p.variants[0]?.current;
  const price = latest ? priceView(latest) : null;
  if (price && current) Object.assign(price, {staleness:observationStaleness(current.observedAt.toISOString()),price:current.price.toFixed(0), observedAt:current.observedAt.toISOString(), datasetVersion:current.snapshotId, ovr:current.ovr, position:current.position, observationFreshness:observationFreshness(current.observedAt.toISOString())});
  return { source: 'OFFICIAL_API', verificationStatus: 'VERIFIED', spid: p.spid, name: p.name, imageUrl: p.imageUrl, season: { id: p.season.id, name: p.season.name, imageUrl: p.season.imageUrl }, lastUpdatedAt: p.lastUpdatedAt.toISOString(), sourceUrl: metadataUrl, datasetVersion: p.datasetId, price };
}
export function createPlayerRepository(db: PrismaClient) {
  return {
    async list(query: { q: string; season?: number; page: number; enhancement: number }) {
      const current = await db.playerDataset.findFirst({ orderBy: { observedAt: 'desc' } });
      const where: Prisma.PlayerWhereInput = { datasetId: current?.id ?? '__none__', ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}), ...(query.season ? { seasonId: query.season } : {}) };
      const [total, players, seasons] = await Promise.all([db.player.count({ where }), db.player.findMany({ where, orderBy: [{ name: 'asc' }, { spid: 'asc' }], skip: (query.page - 1) * 24, take: 24, include: includePlayer(query.enhancement) }), db.season.findMany({ where: { datasetId: current?.id ?? '__none__' }, select: { id: true, name: true }, orderBy: { id: 'desc' } })]);
      return { items: players.map(playerView), seasons, pagination: { page: query.page, pageSize: 24, total, pages: Math.ceil(total / 24) } };
    },
    async detail(spid: string, enhancement: number) {
      const player = await db.player.findUnique({ where: { spid }, include: includePlayer(enhancement) });
      if (!player) return null;
      const variants = await db.playerVariant.findMany({ where: { spid, prices: { some: { verificationStatus: { not: 'REJECTED' } } } }, orderBy: { enhancement: 'asc' } });
      return { ...playerView(player), selectedEnhancement: enhancement, availableEnhancements: variants.map(v => v.enhancement) };
    },
    async history(spid: string, enhancement: number, page: number) {
      if (!await db.player.findUnique({ where: { spid }, select: { spid: true } })) return null;
      const where: Prisma.PlayerPriceSnapshotWhereInput = { variant: { spid, enhancement }, verificationStatus: { not: 'REJECTED' }, snapshot: { source: { in: ['OFFICIAL_API', 'OFFICIAL_WEB'] } } };
      const [total, rows] = await Promise.all([db.playerPriceSnapshot.count({ where }), db.playerPriceSnapshot.findMany({ where, orderBy: [{ observedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50, include: priceInclude })]);
      return { spid, enhancement, status: total ? 'AVAILABLE' : 'UNAVAILABLE', records: rows.map(priceView), page, pages: Math.ceil(total / 50), total };
    },
  };
}
export const playerRepository = { list: (...args: Parameters<ReturnType<typeof createPlayerRepository>['list']>) => createPlayerRepository(getDb()).list(...args), detail: (...args: Parameters<ReturnType<typeof createPlayerRepository>['detail']>) => createPlayerRepository(getDb()).detail(...args), history: (...args: Parameters<ReturnType<typeof createPlayerRepository>['history']>) => createPlayerRepository(getDb()).history(...args) };
