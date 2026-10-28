import 'server-only';
import { verifiedPurchaseData } from '@/domain/playground/eligibility';
import { Prisma } from '@prisma/client';
import { getDb } from './client';
import { metadataSchema, productSchema, type ComponentNode } from '@/contracts/catalog';
import type { CatalogRepository } from '@/domain/catalog/repository';

const datasetInclude = { source: true } satisfies Prisma.DatasetVersionInclude;
type Dataset = Prisma.DatasetVersionGetPayload<{ include: typeof datasetInclude }>;
const itemInclude = { rewardPool: { select: { id: true, verificationStatus: true, _count: { select: { entries: true } } } }, children: { orderBy: { position: 'asc' as const } }, dataset: { include: datasetInclude } } satisfies Prisma.ItemVersionInclude;
type Item = Prisma.ItemVersionGetPayload<{ include: typeof itemInclude }>;
const productInclude = { evidenceSnapshot: true, purchasePolicy: true, dataset: { include: datasetInclude }, components: { orderBy: { position: 'asc' as const } } } satisfies Prisma.ProductVersionInclude;
type Row = Prisma.ProductVersionGetPayload<{ include: typeof productInclude }>;
function metadata(dataset: Dataset) {
  return metadataSchema.parse({
    datasetId: dataset.id, datasetVersion: dataset.version, source: dataset.source.kind,
    sourceName: dataset.source.name, sourceUrl: dataset.source.url, sourceNotes: dataset.source.notes,
    verificationStatus: dataset.verificationStatus, verified: dataset.verificationStatus === 'VERIFIED',
    verifiedAt: dataset.verifiedAt?.toISOString() ?? null,
    lastUpdatedAt: dataset.lastUpdatedAt.toISOString(), dataType: dataset.dataType,
  });
}
function mapProduct(row: Row, items: Map<string, Item>) {
  const component = (id: string, quantity: number, path: string[]): ComponentNode => {
    if (path.includes(id) || path.length >= 8) throw new Error('Invalid component graph');
    const item = items.get(id);
    if (!item || item.dataset.verificationStatus === 'REJECTED') throw new Error('Unavailable component');
    return {
      id, quantity, name: item.name, description: item.description, kind: item.kind,
      rewardBehavior: item.rewardBehavior, conditionRaw: item.conditionRaw, probability: item.rewardPool ? { poolId: item.rewardPool.id, entryCount: item.rewardPool._count.entries, verificationStatus: item.rewardPool.verificationStatus } : null,
      compositionStatus: item.compositionStatus, metadata: metadata(item.dataset),
      children: item.children.map(child => component(child.childId, child.quantity, [...path, id])),
    };
  };
  return productSchema.parse({
    id: row.productId, versionId: row.id, version: row.version, name: row.name,
    description: row.description, imagePath: row.imagePath,
    price: row.price?.toFixed(0) ?? null, currency: row.currency,
    salePeriod: row.salePeriod, purchaseLimit: row.purchaseLimit, compositionStatus: row.compositionStatus,
    simulationPolicy: row.purchasePolicy ? { enabled: row.purchasePolicy.enabled && verifiedPurchaseData(row.dataset.dataType, row.dataset.verificationStatus, row.fieldVerification), maxPerReset: row.purchasePolicy.maxPerReset } : undefined,
    fieldVerification: row.fieldVerification ?? undefined, evidence: row.evidenceSnapshot ? { ...row.evidenceSnapshot, fetchedAt: row.evidenceSnapshot.fetchedAt.toISOString(), verifiedAt: row.evidenceSnapshot.verifiedAt.toISOString() } : undefined,
    saleStartsAt: row.saleStartsAt?.toISOString() ?? null, saleEndsAt: row.saleEndsAt?.toISOString() ?? null,
    metadata: metadata(row.dataset), components: row.components.map(c => component(c.itemVersionId, c.quantity, [])),
  });
}
async function materialize(rows: Row[]) {
  if (!rows.length) return [];
  const db = getDb();
  // One batched item query, not one query for each component or nested node.
  const items = await db.itemVersion.findMany({
    where: { datasetId: { in: [...new Set(rows.map(row => row.datasetId))] } }, include: itemInclude,
  });
  const byId = new Map(items.map(item => [item.id, item]));
  return rows.map(row => mapProduct(row, byId));
}
export const catalogRepository: CatalogRepository = {
  async list(dataType) {
    const rows = await getDb().productVersion.findMany({
      where: { published: true, dataset: { dataType, verificationStatus: { not: 'REJECTED' } } },
      include: productInclude, orderBy: [{ productId: 'asc' }, { version: 'desc' }],
    });
    const latest = new Map<string, Row>();
    for (const row of rows) if (!latest.has(row.productId)) latest.set(row.productId, row);
    return materialize([...latest.values()]);
  },
  async find(id) {
    const row = await getDb().productVersion.findFirst({
      where: { productId: id, published: true, dataset: { verificationStatus: { not: 'REJECTED' } } },
      include: productInclude, orderBy: { version: 'desc' },
    });
    return row ? (await materialize([row]))[0] : null;
  },
};
