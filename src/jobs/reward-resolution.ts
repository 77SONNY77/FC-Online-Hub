import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { resolutionCoverage } from '@/application/reward-resolution';
const db = new PrismaClient();
try {
  const date = process.argv[2] ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected YYYY-MM-DD');
  const result = await resolutionCoverage(db, 'official-shop-44699-20260920', date);
  console.log(JSON.stringify({ referenceDate: date, ...result.counts, pools: result.pools }, null, 2));
} finally { await db.$disconnect(); }
