import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { parseArgs } from 'node:util';
import { collectionStatus, createCollectionRun, describePlan, planCollection } from '@/application/price-collection';
import { safeCollect } from '@/application/safe-price-collection';
import { inKstCollectionWindow } from '@/domain/players/collection-plan';
const { values, positionals } = parseArgs({ allowPositionals: true, options: { pack: { type: 'string' }, seasons: { type: 'string' }, resume: { type: 'string' }, run: { type: 'string' }, 'max-segments': { type: 'string', default: '20' }, 'window-only': { type: 'boolean', default: false } } });
const action = positionals[0];
if (!['plan','collect','status'].includes(action) || positionals.length !== 1) throw new Error('Use plan, collect, or status');
if (values.pack && values.seasons) throw new Error('Choose pack or explicit classes');
if (values.resume && (values.pack || values.seasons)) throw new Error('A resumed plan cannot change');
const db = new PrismaClient();
try {
  if (action === 'status') {
    const id = values.run ?? (await db.priceCollectionRun.findFirst({ orderBy: { createdAt: 'desc' } }))?.id;
    console.log(id ? await collectionStatus(db, id) : { status: 'NO_RUNS' });
  } else {
    if (values['window-only'] && action === 'collect') {
      if (!inKstCollectionWindow()) throw new Error('Outside 00:00–01:00 KST. Collection skipped; no historical timestamp is created.');
    }
    const plan = values.resume ? null : await planCollection(db, { pack: values.pack, seasons: values.seasons?.split(',').map(Number) });
    if (plan && values['window-only']) { plan.mode = 'REFERENCE'; plan.targetName = `Reference-window observation: ${plan.targetName}`; }
    if (action === 'plan') { if (!plan) throw new Error('Plan does not accept resume'); console.log(JSON.stringify(describePlan(plan), null, 2)); }
    else {
      const limit = Number(values['max-segments']);
      if (!Number.isInteger(limit) || limit < 0 || limit > 100) throw new Error('max-segments must be 0–100');
      const runId = values.resume ?? (await createCollectionRun(db, plan!)).id;
      const { collection: result } = await safeCollect(db, runId, limit, values['window-only'] ? 'REFERENCE_SNAPSHOT' : 'MANUAL');
      console.log(JSON.stringify(result, null, 2));
      if (['FAILED','BLOCKED'].includes(result.status)) process.exitCode = 1;
    }
  }
} finally { await db.$disconnect(); }
