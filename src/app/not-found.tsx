import Link from 'next/link';
export default function NotFound() { return <main id="main" className="container"><div className="empty-state"><p className="eyebrow accent">404 / NOT FOUND</p><h1>상품 또는 페이지를 찾을 수 없습니다</h1><p>주소를 확인하거나 상품 목록으로 돌아가 주세요.</p><Link className="button" href="/shop">상품 목록으로 <span aria-hidden="true">↗</span></Link></div></main>; }
