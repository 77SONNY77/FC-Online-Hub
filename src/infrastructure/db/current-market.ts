import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
const querySchema = z.object({ enhancement: z.number().int().min(1).max(13), seasons: z.array(z.number().int().min(100).max(999)).max(153).default([]), limit: z.number().int().min(1).max(1000).default(100) });
// Observational market ranking, never a verified reward/reference ranking.
export async function currentMarketRanking(db: PrismaClient, input: z.input<typeof querySchema>) {
  const q = querySchema.parse(input);
  const rows = await db.$queryRaw<{ spid: string; enhancement: number; seasonId: number; price: Prisma.Decimal; observedAt: Date; referenceAt: Date | null; observationId: string }[]>(Prisma.sql`
    SELECT spid, enhancement, "seasonId", price, "observedAt", "referenceAt", "observationId" FROM "PlayerPriceCurrent"
    WHERE enhancement=${q.enhancement} ${q.seasons.length ? Prisma.sql`AND "seasonId" IN (${Prisma.join(q.seasons)})` : Prisma.empty}
    ORDER BY price DESC, "variantId" ASC LIMIT ${q.limit}`);
  return rows.map(r => ({ ...r, price: r.price.toFixed(0), observedAt: r.observedAt.toISOString(), referenceAt: r.referenceAt?.toISOString() ?? null, verifiedRewardRank: false }));
}
