'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { chargeOptionsResponse, type ChargeOption } from '@/contracts/playground';
import { dateLabel } from '@/features/shop/format';
import { fc, usePlayground } from './provider';
export function ChargeView() {
  const { state, busy, run } = usePlayground();
  const [options, setOptions] = useState<ChargeOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/fc/options', { signal: abort.signal }).then(async r => { if (!r.ok) throw new Error(); return chargeOptionsResponse.parse(await r.json()); }).then(r => { setOptions(r.data); setFailed(false); }).catch(() => { if (!abort.signal.aborted) setFailed(true); });
    return () => abort.abort();
  }, [attempt]);
  return <main id="main" className="container shop-main charge-main"><div className="page-heading"><div><p className="eyebrow accent">FC STATION</p><h1>FC 구매<span className="heading-dot">.</span></h1><p className="intro">원하는 만큼 충전하고, 자유롭게 체험하세요.</p></div><Link className="back-link" href="/shop">상품 둘러보기 ↗</Link></div>
    <div className="charge-banner"><div><span className="badge">실제 결제 없음</span><h2>클릭하면 가상 FC가 바로 충전됩니다.</h2><p>현금이나 넥슨 캐시가 필요하지 않습니다. 실제 FC Online 계정에는 지급되지 않습니다.</p></div><div className="charge-balance"><span>보유 FC</span><strong>{state ? fc(state.balance) : '불러오는 중'}</strong></div></div>
    <div className="section-heading"><h2>충전할 FC 선택</h2><span>VIRTUAL FC</span></div>
    {failed ? <div className="empty-state" role="alert"><p>충전 옵션을 불러오지 못했습니다.</p><button className="button" onClick={() => setAttempt(v => v + 1)}>다시 불러오기</button></div> : options === null ? <p role="status" className="loading-message">충전 옵션을 불러오는 중</p> : options.length === 0 ? <p className="empty-state">사용 가능한 충전 옵션이 없습니다.</p> : <div className="fc-grid">{options.map(option => <button className="fc-option" key={option.id} disabled={!state || busy} onClick={() => void run('/api/fc/charges', { chargeOptionId: option.id })} aria-label={`${fc(option.totalFc)} 충전`}>
      <span className="fc-coin" aria-hidden="true">FC</span><span className="fc-base">{fc(option.fcAmount)}</span><span className="fc-bonus">{BigInt(option.bonusFc) > 0n ? `+ ${fc(option.bonusFc)} 추가` : '기본 FC'}</span><span className="fc-option-total">총 <strong>{fc(option.totalFc)}</strong><span aria-hidden="true">↗</span></span><small>{option.metadata.dataType === 'MOCK' ? '개발용 데이터' : '공식 단위 기준'} · 가상 충전</small>
    </button>)}</div>}
    {options?.[0] && <div className="charge-source"><p>일반 FC의 기본 수량과 추가 FC를 참고했습니다. 멤버십 할인·쿠폰·현금 가격은 적용하지 않습니다.</p><span>수량 확인: {dateLabel(options[0].metadata.verifiedAt)}</span>{options[0].metadata.sourceUrl && <a href={options[0].metadata.sourceUrl} target="_blank" rel="noopener noreferrer">공식 출처 확인 ↗<span className="sr-only"> (새 창)</span></a>}</div>}
  </main>;
}
