import type { PlayerPriceView } from '@/contracts/players';
import { formatBP } from '@/domain/players/price';
import { timestampLabel } from '@/features/players/format';
export function PriceView({ price, compact = false }: { price: PlayerPriceView | null; compact?: boolean }) {
  if (!price) return <p className="player-unavailable">가격 정보 없음</p>;
  return <div className="player-price"><small>{price.verificationStatus === 'VERIFIED' ? '확인된 기준가' : '공식 화면에서 관측한 가격'}</small><strong>{formatBP(price.price)}</strong><p>기준 시각: {price.referenceAt ? `${timestampLabel(price.referenceAt)} KST` : '공식 기준 시각 미확인'}</p><p>확인 시각: {timestampLabel(price.observedAt)} KST</p>{!compact && <><p>{price.freshness === 'FRESH' ? '기준 시각으로부터 2시간 이내' : price.freshness === 'STALE' ? '이전 기준 시각의 가격입니다' : '가격의 최신성을 확인할 수 없습니다'}</p><a className="source-link" href={price.sourceUrl} target="_blank" rel="noopener noreferrer">공식 가격 출처 ↗</a><p>관측 가격은 개봉일 0~1시 가격을 대신하지 않습니다.</p></>}</div>;
}
