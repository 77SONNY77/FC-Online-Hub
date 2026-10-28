'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listResponseSchema, type CatalogMode, type Product } from '@/contracts/catalog';
import { ProductCard } from './product-card';
export function CatalogSkeleton() {
  return <div className="product-grid" role="status" aria-label="상품을 불러오는 중">{[1, 2, 3].map(i => <div className="skeleton-card" key={i}><div className="skeleton art" /><div className="skeleton line" /><div className="skeleton line short" /></div>)}</div>;
}
export function CatalogView({ mode }: { mode: CatalogMode }) {
  const [state, setState] = useState<{ kind: 'loading' | 'error' | 'ready'; products: Product[] }>({ kind: 'loading', products: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/products?mode=${mode}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Catalog unavailable');
        const result = listResponseSchema.parse(await response.json());
        if (!controller.signal.aborted) setState({ kind: 'ready', products: result.data });
      } catch { if (!controller.signal.aborted) setState({ kind: 'error', products: [] }); }
    }
    void load();
    return () => controller.abort();
  }, [mode, attempt]);
  if (state.kind === 'loading') return <CatalogSkeleton />;
  if (state.kind === 'error') return <div className="empty-state" role="alert"><span className="state-icon">!</span><h2>상품을 불러오지 못했습니다</h2><p>데이터 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요.</p><button className="button" onClick={() => { setState({ kind: 'loading', products: [] }); setAttempt(v => v + 1); }}>다시 불러오기 <span aria-hidden="true">↻</span></button></div>;
  if (!state.products.length) return <div className="empty-state"><span className="state-icon">◇</span><h2>{mode === 'official' ? '등록된 공식 상품이 없습니다' : '등록된 상품이 없습니다'}</h2><p>{mode === 'official' ? '공식 출처의 가격과 구성을 확인한 후 상품을 등록합니다.' : '확인 가능한 상품 데이터가 준비되면 이곳에 표시됩니다.'}</p>{mode !== 'mock' && <Link className="button" href="/shop?mode=mock">개발용 카탈로그 보기 <span aria-hidden="true">↗</span></Link>}</div>;
  return <><div className="list-caption"><span>전체 상품 <strong>{state.products.length}</strong></span><span>상품 구성과 데이터 출처를 확인해 보세요</span></div><div className="product-grid">{state.products.map(product => <ProductCard product={product} key={product.id} />)}</div></>;
}
