import 'dotenv/config';
import { mkdir, readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { importPrices } from '@/application/import-players';
const file = '.local/player-prices/capture.json';
await mkdir('.local/player-prices', { recursive: true });
if (!process.argv.includes('--offline')) {
  process.argv = [process.argv[0], process.argv[1], 'collect', '--pack=official-pool-24987-v1'];
  await import('./price-collection');
  process.exit(0);
}

const db = new PrismaClient();
try { console.log(await importPrices(db, JSON.parse(await readFile(file, 'utf8')))); }
finally { await db.$disconnect(); }
