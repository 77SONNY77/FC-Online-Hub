import 'dotenv/config';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { load } from 'cheerio';
import defaults from '../infrastructure/fconline-data-center/request-defaults.json' with { type: 'json' };

const db = new PrismaClient();
const endpoint = 'https://fconline.nexon.com/datacenter/PlayerList';
const DELAY = 5000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const dataset = await db.playerDataset.findFirstOrThrow({ orderBy: { observedAt: 'desc' } });
const seasons = await db.season.findMany({ where: { datasetId: dataset.id }, orderBy: { id: 'asc' } });

// Pre-load all valid player spids
const allPlayers = await db.player.findMany({ where: { datasetId: dataset.id }, select: { spid: true } });
const validSpids = new Set(allPlayers.map(p => p.spid));
console.log(`Found ${seasons.length} seasons, ${validSpids.size} valid players to crawl`);

let totalObservations = 0;
let totalRequests = 0;
let skippedUnknown = 0;

for (const season of seasons) {
  for (let enhancement = 1; enhancement <= 13; enhancement++) {
    const body = new URLSearchParams({
      ...defaults,
      strSeason: `,${season.id},`,
      n1Strong: String(enhancement),
      n4OvrMin: '0',
      n4OvrMax: '200',
      strOrderby: ' n8playergrade1 descending',
      n4PageNo: '1',
    }).toString();

    try {
      await sleep(DELAY);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
        body,
        signal: AbortSignal.timeout(30000),
      });
      totalRequests++;

      if (!response.ok) {
        console.error(`  HTTP ${response.status} for season ${season.id} +${enhancement}`);
        if ([401, 403, 429].includes(response.status)) {
          console.error('Rate limited. Waiting 60s...');
          await sleep(60000);
        }
        continue;
      }

      const html = await response.text();
      const $ = load(html);
      const elements = $('[id^="area_playerunit_"]');

      if (!elements.length) continue;

      const observedAt = new Date();

      // Create source snapshot
      const ssId = `crawl-${season.id}-${enhancement}-${Date.now()}`;
      const sourceSnapshot = await db.priceSourceSnapshot.create({
        data: {
          id: ssId,
          sourceUrl: endpoint,
          source: 'OFFICIAL_WEB',
          observedAt,
          contentHash: createHash('sha256').update(html.slice(0, 1000)).digest('hex').slice(0, 16),
          content: '',
          notes: `Full crawl: season ${season.id} +${enhancement}`,
        },
      });

      let seasonObs = 0;

      for (const element of elements.toArray()) {
        const node = $(element);
        const spid = node.attr('id')!.replace('area_playerunit_', '');

        // Skip if player not in metadata
        if (!validSpids.has(spid)) {
          skippedUnknown++;
          continue;
        }

        const priceNode = node.find(`.td_ar_bp .span_bp${enhancement}`);
        if (priceNode.length !== 1 || !priceNode.attr('title')) continue;
        const rawPrice = priceNode.attr('title')!.trim().replace(/\s+BP$/, '').replaceAll(',', '');
        if (!/^\d+$/.test(rawPrice) || rawPrice === '0') continue;

        const variantId = `${spid}-${enhancement}`;
        const price = rawPrice; // Decimal as string
        const psId = `${variantId}-${ssId}`;

        try {
          await db.playerVariant.upsert({
            where: { id: variantId },
            create: { id: variantId, spid, enhancement },
            update: {},
          });

          await db.playerPriceSnapshot.create({
            data: {
              id: psId,
              variantId,
              price,
              observedAt,
              snapshotId: ssId,
              verificationStatus: 'NEEDS_VERIFICATION',
              reason: 'INITIAL',
            },
          });

          await db.playerCurrentState.upsert({
            where: { variantId },
            create: { variantId, price, observedAt, historyAt: observedAt, snapshotId: ssId, historyId: psId },
            update: { price, observedAt, historyAt: observedAt, snapshotId: ssId, historyId: psId },
          });

          seasonObs++;
        } catch (e: any) {
          if (e.code === 'P2002') continue; // duplicate
          console.error(`  DB error ${variantId}: ${e.code ?? ''} ${e.message?.slice(0, 150)}`);
        }
      }

      totalObservations += seasonObs;
      if (seasonObs > 0) {
        console.log(`[${totalRequests}] Season ${season.id} (${season.name}) +${enhancement}: ${seasonObs} prices | Total: ${totalObservations}`);
      }

      if (elements.length === 200) {
        console.log(`  ⚠ Season ${season.id} +${enhancement} hit 200 cap`);
      }
    } catch (e: any) {
      console.error(`  Request failed ${season.id} +${enhancement}:`, e.message?.slice(0, 150));
    }
  }
}

console.log(`\n=== CRAWL COMPLETE ===`);
console.log(`Total requests: ${totalRequests}`);
console.log(`Total observations: ${totalObservations}`);
console.log(`Skipped (not in metadata): ${skippedUnknown}`);

await db.$disconnect();
