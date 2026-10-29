import type { PlayerPriceView } from '@/contracts/players';
import { formatBP } from '@/domain/players/price';
import { timestampLabel } from '@/features/players/format';
export function PriceViewEn({ price, compact = false }: { price: PlayerPriceView | null; compact?: boolean }) {
  if (!price) return <p className="player-unavailable">No price data</p>;
  return <div className="player-price"><small>{price.verificationStatus === 'VERIFIED' ? 'Verified base price' : 'Observed from official screen'}</small><strong>{formatBP(price.price)}</strong><p>Reference: {price.referenceAt ? `${timestampLabel(price.referenceAt)} KST` : 'Official reference time unknown'}</p><p>Observed: {timestampLabel(price.observedAt)} KST</p>{!compact && <><p>{price.freshness === 'FRESH' ? 'Within 2 hours of reference time' : price.freshness === 'STALE' ? 'Price from a previous reference time' : 'Freshness cannot be verified'}</p><a className="source-link" href={price.sourceUrl} target="_blank" rel="noopener noreferrer">Official price source ↗</a><p>Observed prices do not substitute opening day 0–1 AM prices.</p></>}</div>;
}
