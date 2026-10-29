import Link from 'next/link';
import { playerService } from '@/application/players-instance';
import { CatalogError } from '@/application/catalog';
import { PlayerImage } from '@/features/players/player-image';
import { PriceViewEn } from '@/features/players/price-view-en';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Player Search' };
export default async function PlayersPageEn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const input = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== ''));
  let data;
  try { data = await playerService.list(input); } catch (e) { if (e instanceof CatalogError && e.status === 400) return <main id="main" className="container"><h1>Please check your search criteria</h1><Link href="/en/players">Back to search</Link></main>; throw e; }
  const { pagination } = data;
  const queryPage = (page: number) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(input)) if (typeof v === 'string') q.set(k, v); q.set('page', String(page)); return `/en/players?${q}`; };
  return <main id="main" className="container players-main"><p className="eyebrow accent">PLAYER DATABASE</p><h1>Player Search</h1><p className="players-intro">Browse players by class and check confirmed info by enhancement level.</p><form action="/en/players" className="player-search"><label>Player Name<input name="q" defaultValue={typeof raw.q === 'string' ? raw.q : ''} maxLength={80} placeholder="Search player name" /></label><label>Class<select aria-label="Class" name="season" defaultValue={typeof raw.season === 'string' ? raw.season : ''}><option value="">All Classes</option>{data.seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Enhancement<select aria-label="Enhancement" name="enhancement" defaultValue={typeof raw.enhancement === 'string' ? raw.enhancement : '1'}>{Array.from({ length: 13 }, (_, i) => <option key={i} value={i + 1}>+{i + 1}</option>)}</select></label><button className="button" type="submit">Search</button></form>
    <div className="players-summary"><span>{pagination.total.toLocaleString('en-US')} players found</span><span className="badge">NEXON Open API Official Data</span></div>
    <p className="rank-notice">Prices are available for selected players only. Players without price data are not shown as 0 BP.</p>
    <div className="player-grid">{data.items.map(player => <article className="player-card" key={player.spid}><Link className="player-card-link" href={`/en/players/${player.spid}?enhancement=${typeof raw.enhancement === 'string' ? encodeURIComponent(raw.enhancement) : '1'}`}><PlayerImage src={player.imageUrl} name={player.name} /><div><span className="player-season">{player.season.name}</span><h2>{player.name}</h2><small>+{typeof raw.enhancement === 'string' ? raw.enhancement : '1'}</small></div></Link><PriceViewEn price={player.price} compact /></article>)}</div>
    {!data.items.length && <div className="empty-state"><h2>No results found</h2><p>Try a different player name or class filter.</p></div>}
    {pagination.pages > 1 && <nav className="probability-pagination" aria-label="Player pages">{pagination.page > 1 ? <Link className="secondary-button" href={queryPage(pagination.page - 1)}>Previous</Link> : <span />}<span>{pagination.page} / {pagination.pages}</span>{pagination.page < pagination.pages ? <Link className="secondary-button" href={queryPage(pagination.page + 1)}>Next</Link> : <span />}</nav>}
    <p className="players-attribution">Player & class data provided by: <a href="https://openapi.nexon.com/game/fconline/" target="_blank" rel="noopener noreferrer">NEXON Open API ↗</a></p></main>;
}
