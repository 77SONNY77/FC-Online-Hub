import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { importPlayers } from '@/application/import-players';
import { metadataUrl, seasonsUrl, validateMetadata } from '@/domain/players/metadata';
const directory = '.local/player-metadata';
// Public static metadata requires no key. Never forward NEXON_API_KEY to a CDN.
async function download(url: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try { response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' }); }
    catch { if (attempt === 2) throw new Error('Metadata network failure'); await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
    if (response.ok) { const text = await response.text(); if (text.length > 20000000) throw new Error('Metadata exceeds size budget'); return text; }
    if (response.status !== 429 && response.status < 500) throw new Error(`Metadata HTTP ${response.status}`);
    const retryHeader = response.headers.get('retry-after');
    const retry = retryHeader && !/^\d+$/.test(retryHeader) ? Math.max(0, (Date.parse(retryHeader) - Date.now()) / 1000) : Number(retryHeader);
    if (retry > 60) throw new Error('Retry later: upstream rate limit');
    await new Promise(r => setTimeout(r, Math.max(1000 * (attempt + 1), Number.isFinite(retry) ? retry * 1000 : 0)));
  }
  throw new Error('Metadata retry limit exceeded');
}
await mkdir(directory, { recursive: true });
if (!process.argv.includes('--offline')) {
  const players = await download(metadataUrl);
  await new Promise(r => setTimeout(r, 1000));
  const seasons = await download(seasonsUrl);
  validateMetadata(players, seasons);
  // Publish a single complete capture only after both downloads pass validation.
  await writeFile(`${directory}/capture.json`, JSON.stringify({ players, seasons, observedAt: new Date().toISOString() }));
}
const capture = JSON.parse(await readFile(`${directory}/capture.json`, 'utf8'));
const db = new PrismaClient();
try { console.log(await importPlayers(db, capture.players, capture.seasons, new Date(capture.observedAt))); }
finally { await db.$disconnect(); }
