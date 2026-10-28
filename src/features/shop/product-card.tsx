import Link from 'next/link';
import type { Product } from '@/contracts/catalog';
import { ProductImage } from '@/components/ui/product-image';
import { priceLabel, sourceLabel, verificationLabel } from './format';
export function ProductCard({ product }: { product: Product }) {
  return <Link className={`product-card ${product.metadata.dataType === 'OFFICIAL' ? 'official-product' : ''}`} href={`/shop/product/${product.id}`}>
    <div className="card-art"><ProductImage src={product.imagePath} name={product.name} /><span className="art-label">{sourceLabel(product.metadata)}</span><span className="art-index">{String(product.version).padStart(2, '0')} / EDITION</span></div>
    <div className="card-body"><div className="card-meta"><span>패키지</span><span className="status-dot">{verificationLabel(product.metadata)}</span></div>
      <h2>{product.name}</h2><p className="card-description">{product.description}</p>
      <div className="card-price"><strong>{priceLabel(product)}</strong><span aria-hidden="true">↗</span></div>
      <div className="card-period">{product.salePeriod ?? '판매 기간 확인 필요'}</div>
    </div>
  </Link>;
}
