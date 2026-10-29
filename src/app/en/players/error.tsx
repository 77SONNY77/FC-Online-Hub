'use client';
export default function PlayerErrorEn({ reset }: { reset: () => void }) { return <main id="main" className="container"><div className="empty-state" role="alert"><h1>Failed to load player data</h1><p>Please try again later.</p><button className="secondary-button" onClick={reset}>Retry</button></div></main>; }
