import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { importOfficial } from '../src/application/import-official';
import snapshots from '../src/data/official/product-44699/snapshots.json';
import capture from '../src/data/official/product-44699/capture.json';
import { validateOfficialImport } from '../src/domain/official/import';
if (process.argv.includes('--validate-only')) {
  const d = validateOfficialImport(snapshots, capture);
  console.log({ valid: true, products: 1, items: d.items.length, pools: d.pools.length, entries: d.pools.reduce((n, p) => n + p.entries.length, 0) });
} else {
  const db = new PrismaClient();
  try { console.log(await importOfficial(db, snapshots, capture)); } finally { await db.$disconnect(); }
}
