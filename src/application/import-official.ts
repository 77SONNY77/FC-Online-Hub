import { type PrismaClient, Prisma } from '@prisma/client';
import { validateOfficialImport } from '@/domain/official/import';
export async function importOfficial(db: PrismaClient, snapshots: unknown, capture: unknown) {
  // No writes occur before the complete source graph and all probability tables pass validation.
  const data = validateOfficialImport(snapshots, capture);
  return db.$transaction(async tx => {
    const existing = await tx.datasetVersion.findUnique({ where: { id: data.capture.datasetId } });
    if (existing) {
      if (existing.importHash !== data.importHash) throw new Error('Immutable dataset conflict: use a new version');
      return { imported: false, products: 1, items: data.items.length, pools: data.pools.length, entries: data.pools.reduce((n, p) => n + p.entries.length, 0) };
    }
    const verifiedAt = data.snapshots.map(s => s.verifiedAt).sort().at(-1)!;
    await tx.dataSource.upsert({ where: { id: data.capture.sourceId }, update: {}, create: { id: data.capture.sourceId, name: 'FC Online 공식 웹 상점 · 상품 44699', kind: 'OFFICIAL_WEB', url: 'https://shop.fconline.nexon.com/Shop/View?strPid=44699', notes: '상품 필드와 직접 구성품을 공식 상세/카드로 검증. 확률은 각 공식 공시 문서 스냅샷에 연결합니다. 확률 문서는 공개 웹 텍스트로 확인했으며 직접 접속은 보안 검사로 제한되었습니다. 실제 선수·시세·이벤트 코인 교환은 미구현입니다.' } });
    await tx.datasetVersion.create({ data: { id: data.capture.datasetId, version: data.capture.version, sourceId: data.capture.sourceId, dataType: 'OFFICIAL', verificationStatus: 'VERIFIED', verifiedAt, lastUpdatedAt: verifiedAt, importHash: data.importHash } });
    await tx.sourceSnapshot.createMany({ data: data.snapshots.map(s => ({ ...s, datasetId: data.capture.datasetId })) });
    for (const item of data.items) {
      const logicalId = item.id.replace(/-v\d+$/, '');
      await tx.item.upsert({ where: { id: logicalId }, update: {}, create: { id: logicalId } });
      await tx.itemVersion.create({ data: { id: item.id, itemId: logicalId, version: data.capture.version, datasetId: data.capture.datasetId, name: item.name, kind: item.kind, description: item.behavior === 'UNKNOWN' ? '상품에 포함되는 이벤트 재료입니다. 교환·사용 보상은 이번 정의에 포함하지 않습니다.' : item.behavior === 'PLAYER_POOL' ? '공식 조건과 기준가 순위에 따른 선수팩입니다. 실제 선수 매핑은 아직 제공하지 않습니다.' : item.behavior === 'ALL' ? '표에 기재된 구성품을 모두 획득하는 상자입니다.' : item.behavior === 'FIXED' ? '공식 표에 기재된 BP 수량을 지급하는 카드입니다.' : '표에 기재된 구성품 중 1종을 서로 다른 확률로 획득하는 상자입니다.', compositionStatus: item.behavior === 'UNKNOWN' ? 'UNKNOWN' : 'DOCUMENTED', rewardBehavior: item.behavior, conditionRaw: item.conditionRaw } });
    }
    for (const pool of data.pools) {
      const { entries, name: _name, ...fields } = pool;
      void _name;
      await tx.rewardPoolVersion.create({ data: { ...fields, version: data.capture.version, datasetId: data.capture.datasetId, verificationStatus: 'VERIFIED' } });
      await tx.probabilityEntry.createMany({ data: entries.map((e, position) => ({ ...e, id: `${pool.id}-entry-${position}`, poolId: pool.id, position })) });
      const nested = entries.filter(e => e.targetType === 'NESTED_ITEM');
      if (nested.length) await tx.itemComponent.createMany({ data: nested.map((e, position) => ({ id: `${pool.itemVersionId}-child-${position}`, parentId: pool.itemVersionId, childId: e.targetItemVersionId!, quantity: e.quantity, position })) });
    }
    const product = data.product;
    await tx.product.upsert({ where: { id: product.id }, update: {}, create: { id: product.id } });
    await tx.productVersion.create({ data: { id: product.versionId, productId: product.id, version: data.capture.version, datasetId: data.capture.datasetId, name: product.name, description: '공식 판매 상품의 가격과 구성품을 그대로 확인하고 가상 FC로 체험합니다. 상자·선수팩은 보유품으로만 지급하며 개봉하지 않습니다.', price: product.price, currency: product.currency, imagePath: data.capture.imageUrl, salePeriod: product.salePeriod, saleStartsAt: product.saleStartsAt, saleEndsAt: product.saleEndsAt, purchaseLimit: product.purchaseLimit, compositionStatus: 'DOCUMENTED', published: true, evidenceSnapshotId: data.capture.detailSnapshotId, fieldVerification: Object.fromEntries(['name', 'price', 'currency', 'salePeriod', 'purchaseLimit', 'components'].map(k => [k, 'VERIFIED'])) as Prisma.InputJsonObject, purchasePolicy: { create: { enabled: true, maxPerReset: product.maxPerReset } }, components: { create: product.components.map((c, position) => ({ id: `${product.versionId}-component-${position}`, itemVersionId: c.itemVersionId, quantity: c.quantity, position })) } } });
    return { imported: true, products: 1, items: data.items.length, pools: data.pools.length, entries: data.pools.reduce((n, p) => n + p.entries.length, 0) };
  }, { timeout: 30000 });
}
