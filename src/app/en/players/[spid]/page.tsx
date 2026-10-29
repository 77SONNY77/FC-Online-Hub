import Link from 'next/link';
import { notFound } from 'next/navigation';
import { playerService } from '@/application/players-instance';
import { CatalogError } from '@/application/catalog';
import { PlayerImage } from '@/features/players/player-image';
import { PriceViewEn } from '@/features/players/price-view-en';
import { timestampLabel } from '@/features/players/format';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Player Info' };
export default async function PlayerPageEn({ params, searchParams }: { params: Promise<{ spid: string }>; searchParams: Promise<{ enhancement?: string }> }) {
  const { spid } = await params;
  const player = await playerService.detail(spid, await searchParams).catch(error => { if (error instanceof CatalogError && [400, 404].includes(error.status)) notFound(); throw error; });
  return <main id="main" className="container players-main"><nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/en/players">Players</Link><span>/</span><span>{player.name}</span></nav><section className="player-detail"><div className="player-portrait"><PlayerImage src={player.imageUrl} name={player.name} /></div><div><p className="eyebrow accent">OFFICIAL PLAYER DATA</p><p className="player-season">{player.season.name}</p><h1>{player.name}</h1><span className="badge">Official Data</span><p className="player-id">SPID {player.spid}</p></div></section>
    <section className="player-detail-price"><h2>Price by Enhancement Level</h2><nav className="enhancement-selector" aria-label="Enhancement level">{Array.from({ length: 13 }, (_, i) => i + 1).map(level => <Link key={level} href={`?enhancement=${level}`} aria-current={level === player.selectedEnhancement ? 'page' : undefined} aria-label={`+${level}${player.availableEnhancements.includes(level) ? '' : ' no price data'}`}>+{level}<small>{player.availableEnhancements.includes(level) ? 'Observed' : 'Unknown'}</small></Link>)}</nav><h3>+{player.selectedEnhancement}</h3><PriceViewEn price={player.price} />{player.price?.ovr !== null && player.price?.ovr !== undefined ? <p>Official OVR (+{player.selectedEnhancement}): {player.price.ovr} · Display value from default settings; pure enhancement OVR unconfirmed</p> : <p className="player-unavailable">OVR unknown for this enhancement level</p>}{player.price?.position ? <p>Official position: {player.price.position}</p> : <p className="player-unavailable">Position unknown</p>}</section>
    <aside className="source-panel"><h2>Data Source</h2><a className="source-link" href={player.sourceUrl} target="_blank" rel="noopener noreferrer">NEXON Open API ↗</a><p>Metadata verified: {timestampLabel(player.lastUpdatedAt)} KST</p><p>Class and name follow official metadata. Enhancement OVR is not calculated independently.</p></aside><Link className="back-link" href="/en/players">← Back to player search</Link></main>;
}
