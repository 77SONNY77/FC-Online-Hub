import Link from 'next/link';
import { notFound } from 'next/navigation';
import { playerService } from '@/application/players-instance';
import { CatalogError } from '@/application/catalog';
import { PlayerImage } from '@/features/players/player-image';
import { PriceView } from '@/features/players/price-view';
import { timestampLabel } from '@/features/players/format';
export const dynamic = 'force-dynamic';
export const metadata = { title: '선수 정보' };
export default async function PlayerPage({ params, searchParams }: { params: Promise<{ spid: string }>; searchParams: Promise<{ enhancement?: string }> }) {
  const { spid } = await params;
  const player = await playerService.detail(spid, await searchParams).catch(error => { if (error instanceof CatalogError && [400, 404].includes(error.status)) notFound(); throw error; });
  return <main id="main" className="container players-main"><nav className="breadcrumb" aria-label="현재 위치"><Link href="/players">선수</Link><span>/</span><span>{player.name}</span></nav><section className="player-detail"><div className="player-portrait"><PlayerImage src={player.imageUrl} name={player.name} /></div><div><p className="eyebrow accent">OFFICIAL PLAYER DATA</p><p className="player-season">{player.season.name}</p><h1>{player.name}</h1><span className="badge">공식 데이터</span><p className="player-id">SPID {player.spid}</p></div></section>
    <section className="player-detail-price"><h2>강화 단계별 가격</h2><nav className="enhancement-selector" aria-label="강화 단계">{Array.from({ length: 13 }, (_, i) => i + 1).map(level => <Link key={level} href={`?enhancement=${level}`} aria-current={level === player.selectedEnhancement ? 'page' : undefined} aria-label={`+${level}강${player.availableEnhancements.includes(level) ? '' : ' 가격 미확인'}`}>+{level}<small>{player.availableEnhancements.includes(level) ? '관측값 있음' : '미확인'}</small></Link>)}</nav><h3>+{player.selectedEnhancement}강</h3><PriceView price={player.price} />{player.price?.ovr !== null && player.price?.ovr !== undefined ? <p>공식 화면 OVR (+{player.selectedEnhancement}강): {player.price.ovr} · 화면 기본 설정의 표시값이며 순수 강화 OVR 여부는 미확인</p> : <p className="player-unavailable">이 강화 단계의 OVR 미확인</p>}{player.price?.position ? <p>공식 화면 포지션: {player.price.position}</p> : <p className="player-unavailable">선수별 포지션 미확인</p>}</section>
    <aside className="source-panel"><h2>선수 정보 출처</h2><a className="source-link" href={player.sourceUrl} target="_blank" rel="noopener noreferrer">NEXON Open API ↗</a><p>메타데이터 확인: {timestampLabel(player.lastUpdatedAt)} KST</p><p>클래스와 이름은 공식 메타데이터를 따릅니다. 강화별 OVR은 임의로 계산하지 않습니다.</p></aside><Link className="back-link" href="/players">← 선수 검색으로</Link></main>;
}
