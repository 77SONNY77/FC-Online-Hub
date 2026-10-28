'use client';
import Image from 'next/image';
import { useState } from 'react';
export function PlayerImage({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="player-image-fallback" role="img" aria-label={`${name} 이미지 없음`}>◇<small>이미지 없음</small></div> : <Image src={src} alt={`${name} 선수 이미지`} width={160} height={160} unoptimized onError={() => setFailed(true)} />;
}
