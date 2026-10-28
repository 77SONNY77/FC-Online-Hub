'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { inventorySchema, type Inventory } from '@/contracts/playground';
import { usePlayground } from './provider';
const labels = { PLAYER_PACK: '선수팩', BOX: '상자', BP_CARD: 'BP 카드', EVENT_ITEM: '이벤트 아이템' };
export function InventoryView() {
  const { state, busy, run, apply } = usePlayground();
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const revision = state?.revision;
  const epoch = state?.epoch;
  const ready = !!state;
  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    void fetch('/api/inventory', { cache: 'no-store', signal: abort.signal }).then(async response => { if (!response.ok) throw new Error(); return inventorySchema.parse(await response.json()); }).then(result => { if (!abort.signal.aborted) { setInventory(result); setFailed(false); apply(result.state); } }).catch(() => { if (!abort.signal.aborted) setFailed(true); });
    return () => abort.abort();
  }, [revision, epoch, ready, attempt, apply]); // scalar dependencies avoid refetching the same snapshot
  const items = inventory && state && inventory.state.revision === state.revision ? inventory.items : null;
  const grouped = new Map<string, { name: string; kind: keyof typeof labels; quantity: number; dataType: 'MOCK' | 'OFFICIAL'; sources: { id: string; name: string; quantity: number }[] }>();
  for (const item of items ?? []) {
    const group = grouped.get(item.itemVersionId) ?? { name: item.name, kind: item.kind, quantity: 0, dataType: item.dataType, sources: [] };
    group.quantity += item.quantity;
    group.sources.push({ id: item.id, name: item.productName, quantity: item.quantity });
    grouped.set(item.itemVersionId, group);
  }
  return <main id="main" className="container shop-main inventory-main"><div className="page-heading"><div><p className="eyebrow accent">YOUR COLLECTION</p><h1>인벤토리<span className="heading-dot">.</span></h1><p className="intro">구매한 상품의 구성품이 이곳에 모입니다.</p></div><button className="reset-link" disabled={!state || busy} onClick={() => { dialog.current?.showModal(); cancel.current?.focus(); }}>시뮬레이션 초기화</button></div>
    <div className="inventory-note"><span className="badge">가상 인벤토리</span><p>가상으로 획득한 아이템입니다. 실제 게임 계정과 연결되지 않습니다.</p></div>
    {failed ? <div className="empty-state" role="alert"><p>인벤토리를 불러오지 못했습니다.</p><button className="button" onClick={() => setAttempt(v => v + 1)}>다시 불러오기</button></div> : !items ? <p role="status" className="loading-message">인벤토리를 불러오는 중</p> : !items.length ? <div className="empty-state"><span className="state-icon">◇</span><h2>아직 보유한 아이템이 없습니다</h2><p>FC를 충전하고 상점에서 상품을 구매해 보세요.</p><Link className="button" href="/shop">상점으로 이동 ↗</Link></div> : <><div className="list-caption"><span>보유 아이템 <strong>{grouped.size}종</strong></span><span>총 {items.reduce((sum, item) => sum + item.quantity, 0).toLocaleString('ko-KR')}개</span></div><div className="inventory-grid">{[...grouped.entries()].map(([id, item]) => <article className="inventory-card" key={id} data-testid={`inventory-${id}`}><Image src={`/images/item-${item.kind.toLowerCase()}.svg`} alt={`${labels[item.kind]} 개발용 아이콘`} width={72} height={88} /><div><span className="eyebrow">{labels[item.kind]}</span><h2>{item.name}</h2><span className="inventory-provenance">{item.dataType === 'OFFICIAL' ? '공식 데이터 · 가상 획득' : '개발용 데이터'}</span><strong className="inventory-quantity">× {item.quantity.toLocaleString('ko-KR')}</strong><details><summary>획득 경로 {item.sources.length}건</summary><ul>{item.sources.map(source => <li key={source.id}>{source.name} · {source.quantity}개</li>)}</ul></details></div></article>)}</div></>}
    <dialog className="reset-dialog" ref={dialog} aria-labelledby="reset-title" onCancel={event => { if (busy) event.preventDefault(); }}><h2 id="reset-title">시뮬레이션을 초기화할까요?</h2><p>보유 FC가 0이 되고, 인벤토리와 현재 구매 횟수가 초기화됩니다. 이 작업은 되돌릴 수 없습니다.</p><div><button ref={cancel} className="secondary-button" disabled={busy} onClick={() => dialog.current?.close()}>취소</button><button className="button" disabled={busy} onClick={async () => { const success = await run('/api/playground/reset', {}); dialog.current?.close(); if (success) setAttempt(v => v + 1); }}>초기화하기</button></div></dialog>
  </main>;
}
