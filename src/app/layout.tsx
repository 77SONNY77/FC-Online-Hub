import type { Metadata } from 'next';
import { ShopHeader } from '@/features/playground/header';
import './globals.css';
export const metadata: Metadata = { title: { default: 'FC LAB · 선수 검색', template: '%s · FC LAB' }, description: 'FC Online 선수 정보를 확인하는 독립적인 개발 프로젝트입니다.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body><a className="skip-link" href="#main">본문으로 건너뛰기</a><ShopHeader />{children}<footer className="site-footer"><span>FC LAB <span className="footer-slash">/</span> Independent fan project</span><p>NEXON 및 EA와 제휴 관계가 없는 독립 프로젝트입니다.</p></footer></body></html>;
}
