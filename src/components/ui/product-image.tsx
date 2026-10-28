'use client';
import Image from 'next/image';
import { useState } from 'react';
export function ProductImage({ src, name, priority = false }: { src: string | null; name: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="image-fallback" role="img" aria-label={`${name}: 상품 이미지 없음`}><span>◇</span><p>상품 이미지 확인 필요</p></div>;
  return <Image src={src} alt={`${name} 상품 이미지`} width={960} height={640} priority={priority} unoptimized onError={() => setFailed(true)} />;
}
