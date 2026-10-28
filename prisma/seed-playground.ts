import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import options from '../src/data/official/fc-options.json';
import { chargeOptionsResponse } from '../src/contracts/playground';
const { data } = chargeOptionsResponse.parse(options);
const db = new PrismaClient();
try {
  await db.$transaction(async tx => {
    const meta = data[0].metadata;
    await tx.dataSource.upsert({ where: { id: 'official-shop-fc' }, update: {}, create: { id: 'official-shop-fc', name: meta.sourceName, kind: meta.source, url: meta.sourceUrl, notes: meta.sourceNotes } });
    await tx.datasetVersion.upsert({ where: { id: meta.datasetId }, update: {}, create: { id: meta.datasetId, version: 1, sourceId: 'official-shop-fc', dataType: meta.dataType, verificationStatus: meta.verificationStatus, verifiedAt: meta.verifiedAt, lastUpdatedAt: meta.lastUpdatedAt } });
    for (const [index, option] of data.entries()) {
      if (BigInt(option.fcAmount) + BigInt(option.bonusFc) !== BigInt(option.totalFc)) throw new Error('Invalid FC total');
      await tx.fCChargeOption.upsert({ where: { id: option.id }, update: {}, create: { id: option.id, fcAmount: BigInt(option.fcAmount), bonusFc: BigInt(option.bonusFc), displayOrder: index, datasetId: meta.datasetId } });
    }
    // Local simulator rules only. Never rewrite the official/unknown purchaseLimit field.
    for (const [id, max] of [['demo-foundation-package-v1', 5], ['demo-discovery-box-v1', null]] as const) {
      const product = await tx.productVersion.findUniqueOrThrow({ where: { id }, include: { dataset: true } });
      if (product.dataset.dataType !== 'MOCK') throw new Error('Only mock products are enabled in Phase 2');
      await tx.purchasePolicy.upsert({ where: { productVersionId: id }, update: {}, create: { productVersionId: id, enabled: true, maxPerReset: max } });
    }
  });
  console.log('가상 충전 옵션 7종 및 개발용 상품 구매 정책 준비 완료');
} finally { await db.$disconnect(); }
