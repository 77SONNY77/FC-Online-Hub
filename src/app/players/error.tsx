'use client';
export default function PlayerError({ reset }: { reset: () => void }) { return <main id="main" className="container"><div className="empty-state" role="alert"><h1>선수 정보를 불러오지 못했습니다</h1><p>잠시 후 다시 시도해 주세요.</p><button className="secondary-button" onClick={reset}>다시 시도</button></div></main>; }
