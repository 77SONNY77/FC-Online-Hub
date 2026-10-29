'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export function ShopHeader() {
  const pathname = usePathname();
  const isEn = pathname.startsWith('/en');
  const playersHref = isEn ? '/en/players' : '/players';
  const switchHref = isEn ? pathname.replace(/^\/en/, '') || '/players' : `/en${pathname === '/' ? '/players' : pathname}`;
  return <header className="site-header"><div className="header-inner"><Link className="brand" href="/" aria-label="FC LAB 홈"><span className="brand-mark" aria-hidden="true">F</span><span>FC<span className="brand-light">LAB</span><small>PLAY WITHOUT PAYING</small></span></Link>
    <nav aria-label={isEn ? 'Main menu' : '주 메뉴'}>{[[playersHref, isEn ? 'Players' : '선수']].map(([href, label]) => <Link href={href} key={href} aria-current={(pathname === href || pathname.startsWith(playersHref + '/')) ? 'page' : undefined}>{label}</Link>)}</nav>
    <Link href={switchHref} className="lang-switch">{isEn ? '한국어' : 'EN'}</Link>
  </div></header>;
}
