'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Product } from '@/contracts/catalog';
import { fc, usePlayground } from './provider';
export function PurchasePanel({ product }: { product: Product }) {
  const { state, busy, run } = usePlayground();
  const [quantity, setQuantity] = useState(1);
  const [bought, setBought] = useState(false);
  const policy = product.simulationPolicy;
  if (!policy?.enabled || product.price === null) return <div className="purchase-unavailable">상품의 가격 또는 구성 확인 중입니다. 확인이 완료되면 구매할 수 있습니다.</div>;
  const total = BigInt(product.price) * BigInt(quantity);
  const insufficient = state ? BigInt(state.balance) < total : false;
  const purchased = state?.purchased[product.id] ?? 0;
  const limitReached = policy.maxPerReset !== null && purchased + quantity > policy.maxPerReset;
  return <section className="purchase-panel" aria-label="가상 구매"><div className="purchase-top"><span>구매 수량</span><div className="quantity-input"><button aria-label="수량 줄이기" disabled={quantity <= 1 || busy} onClick={() => setQuantity(v => v - 1)}>−</button><input aria-label="구매 수량" type="number" inputMode="numeric" min="1" max="100" value={quantity} disabled={busy} onChange={e => setQuantity(Math.max(1, Math.min(100, Math.trunc(Number(e.target.value)) || 1)))} /><button aria-label="수량 늘리기" disabled={quantity >= 100 || busy} onClick={() => setQuantity(v => v + 1)}>+</button></div></div>
    <div className="purchase-total"><span>총 필요 FC</span><strong>{fc(total)}</strong></div><p className="purchase-wallet">보유 FC <span>{state ? fc(state.balance) : '불러오는 중'}</span></p>
    {policy.maxPerReset !== null && <p className="purchase-rule">체험 한도: 초기화 전 {policy.maxPerReset}개 · 구매 {purchased}개 <span>{product.metadata.dataType === 'OFFICIAL' ? '공식 한도를 참고한 체험 규칙' : '개발용 규칙'}</span></p>}
    {limitReached ? <p className="purchase-warning">이 상품의 체험 구매 한도를 초과했습니다.</p> : insufficient ? <p className="purchase-warning">FC가 부족합니다. <Link href="/shop/fc">FC 충전하기 ↗</Link></p> : null}
    <button className="button purchase-button" disabled={!state || busy || insufficient || limitReached} onClick={async () => { if (await run('/api/purchases', { productId: product.id, quantity })) setBought(true); }}>{busy ? '처리 중…' : '가상 구매'} <span aria-hidden="true">↗</span></button>
    <p className="purchase-disclaimer">실제 결제 없이 가상 FC만 사용합니다.</p>{bought && state?.purchased[product.id] && <Link className="inventory-cta" href="/inventory">지급된 아이템 확인 · 인벤토리로 →</Link>}
  </section>;
}
