import Link from 'next/link';
import { playerService } from '@/application/players-instance';
import { CatalogError } from '@/application/catalog';
import { PlayerImage } from '@/features/players/player-image';
import { PriceView } from '@/features/players/price-view';
export const dynamic = 'force-dynamic';
export const metadata = { title: '선수 검색' };
export default async function PlayersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const input = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== ''));
  let data;
  try { data = await playerService.list(input); } catch (e) { if (e instanceof CatalogError && e.status === 400) return <main id="main" className="container"><h1>검색 조건을 확인해 주세요</h1><Link href="/players">선수 검색으로</Link></main>; throw e; }
  const { pagination } = data;
  const queryPage = (page: number) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(input)) if (typeof v === 'string') q.set(k, v); q.set('page', String(page)); return `/players?${q}`; };
  return <main id="main" className="container players-main"><p className="eyebrow accent">PLAYER DATABASE</p><h1>선수 검색</h1><p className="players-intro">클래스별 선수를 찾아보고 강화 단계별로 확인된 정보를 살펴보세요.</p><form action="/players" className="player-search"><label>선수 이름<input name="q" defaultValue={typeof raw.q === 'string' ? raw.q : ''} maxLength={80} placeholder="선수 이름 검색" /></label><label>클래스<select aria-label="클래스" name="season" defaultValue={typeof raw.season === 'string' ? raw.season : ''}><option value="">전체 클래스</option>{data.seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>강화 단계<select aria-label="강화 단계" name="enhancement" defaultValue={typeof raw.enhancement === 'string' ? raw.enhancement : '1'}>{Array.from({ length: 13 }, (_, i) => <option key={i} value={i + 1}>+{i + 1}강</option>)}</select></label><button className="button" type="submit">검색</button></form>
    <div className="players-summary"><span>검색 결과 {pagination.total.toLocaleString('ko-KR')}명</span><span className="badge">NEXON Open API 공식 데이터</span></div>
    <p className="rank-notice">가격은 일부 선수만 확인됐습니다. 가격 정보가 없는 선수는 0 BP로 표시하지 않습니다.</p>
    <div className="player-grid">{data.items.map(player => <article className="player-card" key={player.spid}><Link className="player-card-link" href={`/players/${player.spid}?enhancement=${typeof raw.enhancement === 'string' ? encodeURIComponent(raw.enhancement) : '1'}`}><PlayerImage src={player.imageUrl} name={player.name} /><div><span className="player-season">{player.season.name}</span><h2>{player.name}</h2><small>+{typeof raw.enhancement === 'string' ? raw.enhancement : '1'}강</small></div></Link><PriceView price={player.price} compact /></article>)}</div>
    {!data.items.length && <div className="empty-state"><h2>검색 결과가 없습니다</h2><p>선수 이름 또는 클래스 조건을 바꿔보세요.</p></div>}
    {pagination.pages > 1 && <nav className="probability-pagination" aria-label="선수 페이지">{pagination.page > 1 ? <Link className="secondary-button" href={queryPage(pagination.page - 1)}>이전 페이지</Link> : <span />}<span>{pagination.page} / {pagination.pages}</span>{pagination.page < pagination.pages ? <Link className="secondary-button" href={queryPage(pagination.page + 1)}>다음 페이지</Link> : <span />}</nav>}
    <p className="players-attribution">선수 및 클래스 정보 제공: <a href="https://openapi.nexon.com/game/fconline/" target="_blank" rel="noopener noreferrer">NEXON Open API ↗</a></p></main>;
}
