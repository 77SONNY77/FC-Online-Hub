import { verifiedPurchaseData } from '@/domain/playground/eligibility';
import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { metadataSchema } from '@/contracts/catalog';
import { chargeInput, purchaseInput, resetInput, requestKey, stateSchema, receiptSchema, inventorySchema, chargeOptionsResponse, type PlaygroundState } from '@/contracts/playground';
import { chargeBalance, purchaseCost, fail } from '@/domain/playground/rules';

type Tx = Prisma.TransactionClient;
type Kind = 'CHARGE' | 'PURCHASE' | 'RESET';
const walletKey = (browserId: string) => ({ browserId_dataType_currency: { browserId, dataType: 'MOCK' as const, currency: 'FC' } });

async function snapshot(tx: Tx, browserId: string): Promise<PlaygroundState> {
  const browser = await tx.browserState.findUniqueOrThrow({ where: { id: browserId } });
  const wallet = await tx.walletBalance.findUniqueOrThrow({ where: walletKey(browserId) });
  const purchases = await tx.purchase.findMany({ where: { browserId, epoch: browser.epoch, dataType: { in: ['MOCK', 'OFFICIAL'] } }, select: { quantity: true, productVersion: { select: { productId: true } } } });
  const purchased: Record<string, number> = {};
  for (const p of purchases) purchased[p.productVersion.productId] = (purchased[p.productVersion.productId] ?? 0) + p.quantity;
  return stateSchema.parse({ balance: wallet.balance.toString(), epoch: browser.epoch, revision: browser.revision, dataType: 'MOCK', purchased });
}

export function createPlaygroundService(db: PrismaClient) {
  async function locked<T>(browserId: string, fn: (tx: Tx) => Promise<T>) {
    return db.$transaction(async tx => {
      // One lock serializes all state changes (including reset) for this browser only.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "BrowserState" WHERE id = ${browserId} FOR UPDATE`);
      const browser = await tx.browserState.findUnique({ where: { id: browserId } });
      if (!browser || browser.expiresAt <= new Date()) fail('STATE_EXPIRED', '저장된 상태를 다시 불러와 주세요.', 419);
      return fn(tx);
    }, { maxWait: 10000, timeout: 15000 });
  }
  return {
    state: (id: string) => locked(id, tx => snapshot(tx, id)),
    async options() {
      const options = await db.fCChargeOption.findMany({ where: { enabled: true, dataset: { verificationStatus: { not: 'REJECTED' } } }, include: { dataset: { include: { source: true } } }, orderBy: { displayOrder: 'asc' } });
      return chargeOptionsResponse.parse({ data: options.map(o => {
        const d = o.dataset;
        return { id: o.id, fcAmount: o.fcAmount.toString(), bonusFc: o.bonusFc.toString(), totalFc: (o.fcAmount + o.bonusFc).toString(), metadata: metadataSchema.parse({ datasetId: d.id, datasetVersion: d.version, source: d.source.kind, sourceName: d.source.name, sourceUrl: d.source.url, sourceNotes: d.source.notes, dataType: d.dataType, verificationStatus: d.verificationStatus, verified: d.verificationStatus === 'VERIFIED', verifiedAt: d.verifiedAt?.toISOString() ?? null, lastUpdatedAt: d.lastUpdatedAt.toISOString() }) };
      }) });
    },
    async inventory(id: string) {
      return locked(id, async tx => {
        const state = await snapshot(tx, id);
        const rows = await tx.inventoryEntry.findMany({ where: { browserId: id, epoch: state.epoch, dataType: { in: ['MOCK', 'OFFICIAL'] } }, include: { purchase: { include: { productVersion: { select: { productId: true } } } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
        return inventorySchema.parse({ state, items: rows.map(r => ({ id: r.id, itemVersionId: r.itemVersionId, name: r.itemName, kind: r.itemKind, quantity: r.quantity, dataType: r.dataType, acquiredAt: r.createdAt.toISOString(), productName: r.purchase.productName, productId: r.purchase.productVersion.productId })) });
      });
    },
    async execute(browserId: string, kind: Kind, keyInput: unknown, body: unknown) {
      const key = requestKey.parse(keyInput);
      const input = kind === 'CHARGE' ? chargeInput.parse(body) : kind === 'PURCHASE' ? purchaseInput.parse(body) : resetInput.parse(body);
      const fingerprint = createHash('sha256').update(JSON.stringify({ kind, input })).digest('hex');
      return locked(browserId, async tx => {
        const previous = await tx.idempotencyRecord.findUnique({ where: { browserId_key: { browserId, key } } });
        if (previous) {
          if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', '처리 중인 요청과 내용이 다릅니다. 다시 시도해 주세요.');
          // Return the original receipt with CURRENT state, even after a reset or later charge.
          return { receipt: receiptSchema.parse(previous.receipt), state: await snapshot(tx, browserId), replayed: true };
        }
        const state = await snapshot(tx, browserId);
        if (state.epoch !== input.epoch) fail('STATE_CHANGED', '초기화된 상태입니다. 새로 불러온 뒤 다시 시도해 주세요.');
        const recent = await tx.idempotencyRecord.count({ where: { browserId, createdAt: { gt: new Date(Date.now() - 10000) } } });
        if (recent >= 30) fail('RATE_LIMITED', '요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
        const balance = BigInt(state.balance);
        let receipt: Prisma.InputJsonObject;
        if (kind === 'CHARGE') {
          const charge = chargeInput.parse(input);
          const option = await tx.fCChargeOption.findUnique({ where: { id: charge.chargeOptionId }, include: { dataset: true } });
          if (!option?.enabled || option.dataset.verificationStatus === 'REJECTED') fail('OPTION_UNAVAILABLE', '사용할 수 없는 충전 옵션입니다.', 422);
          const amount = option.fcAmount + option.bonusFc;
          const next = chargeBalance(balance, amount);
          await tx.walletBalance.update({ where: walletKey(browserId), data: { balance: next } });
          await tx.walletEntry.create({ data: { browserId, epoch: state.epoch, dataType: 'MOCK', type: 'CHARGE', amount, balanceAfter: next, reason: '가상 FC 충전', chargeOptionId: option.id } });
          receipt = { kind, amount: amount.toString() };
        } else if (kind === 'PURCHASE') {
          const request = purchaseInput.parse(input);
          const product = await tx.productVersion.findFirst({ where: { productId: request.productId, published: true }, orderBy: { version: 'desc' }, include: { dataset: true, purchasePolicy: true, components: { include: { itemVersion: { include: { dataset: true } } } } } });
          if (!product) fail('NOT_FOUND', '상품을 찾을 수 없습니다.', 404);
          if (!verifiedPurchaseData(product.dataset.dataType, product.dataset.verificationStatus, product.fieldVerification) || !product.purchasePolicy?.enabled || product.price === null || !['FC', 'VIRTUAL_FC'].includes(product.currency ?? '') || product.compositionStatus !== 'DOCUMENTED' || !product.components.length) fail('PRODUCT_UNAVAILABLE', '구매에 필요한 상품 정보가 확인되지 않았습니다.', 422);
          const price = BigInt(product.price.toFixed(0));
          const total = purchaseCost(price, request.quantity, balance, state.purchased[request.productId] ?? 0, product.purchasePolicy.maxPerReset);
          await tx.walletBalance.update({ where: walletKey(browserId), data: { balance: balance - total } });
          const purchase = await tx.purchase.create({ data: { browserId, epoch: state.epoch, productVersionId: product.id, productName: product.name, quantity: request.quantity, unitPrice: price, total, dataType: product.dataset.dataType } });
          await tx.walletEntry.create({ data: { browserId, epoch: state.epoch, dataType: 'MOCK', type: 'PURCHASE', amount: -total, balanceAfter: balance - total, reason: '상품 가상 구매', purchaseId: purchase.id } });
          // Only direct components are granted; a container stays a container.
          for (const c of product.components) {
            if (c.quantity <= 0 || c.quantity > 100000 || c.itemVersion.datasetId !== product.datasetId || c.itemVersion.dataset.dataType !== product.dataset.dataType || c.itemVersion.dataset.verificationStatus === 'REJECTED') fail('INVALID_PRODUCT', '상품 구성 정보를 확인할 수 없습니다.', 422);
            await tx.inventoryEntry.create({ data: { browserId, epoch: state.epoch, purchaseId: purchase.id, itemVersionId: c.itemVersionId, itemName: c.itemVersion.name, itemKind: c.itemVersion.kind, quantity: c.quantity * request.quantity, dataType: product.dataset.dataType } });
          }
          receipt = { kind, amount: total.toString(), quantity: request.quantity };
        } else {
          await tx.walletEntry.create({ data: { browserId, epoch: state.epoch, dataType: 'MOCK', type: 'RESET', amount: -balance, balanceAfter: 0n, reason: '시뮬레이션 초기화' } });
          await tx.walletBalance.update({ where: walletKey(browserId), data: { balance: 0n } });
          await tx.browserState.update({ where: { id: browserId }, data: { epoch: { increment: 1 } } });
          receipt = { kind, amount: '0' };
        }
        await tx.browserState.update({ where: { id: browserId }, data: { revision: { increment: 1 } } });
        await tx.idempotencyRecord.create({ data: { browserId, key, fingerprint, receipt } });
        return { receipt: receiptSchema.parse(receipt), state: await snapshot(tx, browserId), replayed: false };
      });
    },
  };
}
