import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { planFullMarket, auditFullPlan, fullMarketStatus } from '@/application/full-market';
import { createCollectionRun } from '@/application/price-collection';
import { safeCollect } from '@/application/safe-price-collection';
import { safetyStatus } from '@/infrastructure/fconline-data-center/safety';
import { collectionPolicy } from '@/domain/collection/policy';
const { values, positionals } = parseArgs({ allowPositionals: true, options: { resume: { type: 'string' }, run: { type: 'string' }, 'max-segments': { type: 'string', default: '20' }, output: { type: 'string' } } });
const db = new PrismaClient();
try {
  let result: unknown;
  const action = positionals[0];
  if (action === 'plan') {
    const plan = await planFullMarket(db);
    const classes = await db.season.findMany({ where: { datasetId: plan.metadataDatasetId }, select: { id: true } });
    const freshHours = Number(process.env.PRICE_FRESH_HOURS ?? 24);
    if (!Number.isFinite(freshHours) || freshHours <= 0) throw new Error('PRICE_FRESH_HOURS must be positive');
    const fresh = await db.playerPriceSnapshot.findMany({ where: { observedAt: { gte: new Date(Date.now() - freshHours * 3600000) }, verificationStatus: { not: 'REJECTED' } }, distinct: ['variantId'], select: { variantId: true } });
    result = { ...auditFullPlan(plan, classes.map(s => s.id)), alreadyRecentlyObserved: fresh.length, freshHours, needObservationUpperBound: plan.expectedPlayers.length * 13 - fresh.length, freshSkipPolicy: 'Full snapshots recollect all segments to preserve run coverage; no automatic freshness skip', classPlans: plan.segments.map(s => ({ seasonId: s.query.seasonId, expectedMetadataPlayers: s.expectedCount })) };
  } else if (action === 'status') {
    const id = values.run ?? (await db.priceCollectionRun.findFirst({ where: { mode: 'FULL' }, orderBy: { createdAt: 'desc' } }))?.id;
    const execution = id ? await db.priceCollectorExecution.findFirst({where:{runId:id},orderBy:{startedAt:'desc'}}) : null;
    result = { execution, market: id ? await fullMarketStatus(db, id) : { status: 'NO_RUNS' }, safety: await safetyStatus(db, collectionPolicy(), undefined, execution?.id) };
  } else if (action === 'collect') {
    const limit = Number(values['max-segments']);
    if (!Number.isInteger(limit) || limit < 0 || limit > 100) throw new Error('max-segments must be 0–100');
    const plan = values.resume ? null : await planFullMarket(db);
    if (plan) auditFullPlan(plan, (await db.season.findMany({ where: { datasetId: plan.metadataDatasetId }, select: { id: true } })).map(s => s.id));
    const id = values.resume ?? (await createCollectionRun(db, plan!)).id;
    const run = await db.priceCollectionRun.findUniqueOrThrow({ where: { id } });
    if (run.mode !== 'FULL') throw new Error('Full resume requires a FULL run');
    console.log(JSON.stringify({ runId: id, maxSegments: limit }));
    const execution = await safeCollect(db, id, limit, 'FULL_BUILD');
    result = { ...await fullMarketStatus(db, id), execution };
  } else throw new Error('Use plan, collect, status');
  const text = JSON.stringify(result, null, 2);
  if (values.output) await writeFile(values.output, text + '\n');
  console.log(text);
} finally { await db.$disconnect(); }
