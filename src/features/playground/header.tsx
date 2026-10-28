'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export function ShopHeader() {
  const pathname = usePathname();
  return <header className="site-header"><div className="header-inner"><Link className="brand" href="/" aria-label="FC LAB 홈"><span className="brand-mark" aria-hidden="true">F</span><span>FC<span className="brand-light">LAB</span><small>PLAY WITHOUT PAYING</small></span></Link>
    <nav aria-label="주 메뉴">{[['/players', '선수']].map(([href, label]) => <Link href={href} key={href} aria-current={(pathname === href || pathname.startsWith('/players/')) ? 'page' : undefined}>{label}</Link>)}</nav>
  </div></header>;
}
