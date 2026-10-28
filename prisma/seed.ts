import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { mockCatalog } from '../src/data/mock/catalog';
import { validateDataset } from '../src/domain/catalog/dataset';
const data = validateDataset(mockCatalog);
const prisma = new PrismaClient();
try {
  await prisma.$transaction(async tx => {
    // Published datasets are immutable. Re-running a seed never overwrites an existing version.
    if (await tx.datasetVersion.findUnique({ where: { id: data.metadata.datasetId } })) return;
    await tx.dataSource.upsert({ where: { id: data.sourceId }, update: {}, create: {
      id: data.sourceId, name: data.metadata.sourceName, kind: data.metadata.source,
      url: data.metadata.sourceUrl, notes: data.metadata.sourceNotes,
    } });
    await tx.datasetVersion.create({ data: {
      id: data.metadata.datasetId, version: data.metadata.datasetVersion, sourceId: data.sourceId,
      dataType: data.metadata.dataType, verificationStatus: data.metadata.verificationStatus,
      lastUpdatedAt: new Date(data.metadata.lastUpdatedAt), verifiedAt: null,
    } });
    for (const item of data.items) {
      await tx.item.upsert({ where: { id: item.itemId }, update: {}, create: { id: item.itemId } });
      await tx.itemVersion.create({ data: { id: item.id, itemId: item.itemId, version: item.version,
        name: item.name, kind: item.kind, description: item.description,
        compositionStatus: item.compositionStatus, datasetId: data.metadata.datasetId } });
    }
    for (const item of data.items) {
      for (const [position, child] of item.children.entries()) await tx.itemComponent.create({ data: {
        id: `${item.id}-child-${position}`, parentId: item.id, childId: child.itemVersionId, quantity: child.quantity, position,
      } });
    }
    for (const product of data.products) {
      await tx.product.upsert({ where: { id: product.id }, update: {}, create: { id: product.id } });
      await tx.productVersion.create({ data: {
        id: product.versionId, productId: product.id, version: product.version, datasetId: data.metadata.datasetId,
        name: product.name, description: product.description, imagePath: product.imagePath,
        price: product.price, currency: product.currency, salePeriod: product.salePeriod,
        purchaseLimit: product.purchaseLimit, compositionStatus: product.compositionStatus, published: true,
        components: { create: product.components.map((c, position) => ({
          id: `${product.versionId}-component-${position}`, itemVersionId: c.itemVersionId, quantity: c.quantity, position,
        })) },
      } });
    }
  });
  console.log('개발용 데이터셋 준비 완료: mock-catalog-v1 (실제 상품 아님)');
} finally { await prisma.$disconnect(); }
