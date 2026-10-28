import {compareObservations,freshnessConfig,type PriceObservation} from '@/domain/collection/freshness';
import { pauseCodes } from '@/domain/collection/policy';
import { fullMarketStatus } from './full-market';
import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '@prisma/client';
import { hash } from '@/domain/players/metadata';
import { collectionPlanSchema, segmentQuerySchema, planHash, segmentKey, splitSegment, candidateCoverage, rankCollectionGate, type CollectionPlan } from '@/domain/players/collection-plan';
import { validatePrices } from '@/domain/players/price';
import { importPrices } from './import-players';
import { CollectionError, parsePlayerList } from '@/infrastructure/fconline-data-center/parser';
import type { DataCenterClient } from '@/infrastructure/fconline-data-center/client';
export const targets: Record<string, { season: number; enhancements: number[]; top: number }> = {
  'official-pool-24987-v1': { season: 877, enhancements: [1,2,3,4,5,6,7], top: 750 },
  'official-pool-24965-v1': { season: 877, enhancements: [11], top: 80 },
  'official-pool-24966-v1': { season: 877, enhancements: [10], top: 65 },
  'official-pool-24964-v1': { season: 877, enhancements: [8,9], top: 60 },
  'official-pool-24962-v1': { season: 866, enhancements: [11], top: 135 },
  'official-pool-24963-v1': { season: 866, enhancements: [10], top: 105 },
};
export async function planCollection(db: PrismaClient, options: { pack?: string; seasons?: number[] }) {
  const current = await db.playerDataset.findFirst({ orderBy: { observedAt: 'desc' } });
  if (!current) throw new Error('Import official player metadata first');
  const pack = options.pack ?? (options.seasons ? null : 'official-pool-24987-v1');
  const target = pack ? targets[pack] : undefined;
  const pool = pack ? await db.rewardPoolVersion.findUnique({ where: { id: pack }, include: { itemVersion: true } }) : null;
  if (pack && (!target || !pool || pool.verificationStatus !== 'VERIFIED')) throw new Error('Unsupported or unverified target pack');
  const seasons = target ? [target.season] : [...new Set(options.seasons ?? [])];
  if (!seasons.length || seasons.length > 10 || seasons.some(s => !Number.isInteger(s) || s < 100 || s > 999)) throw new Error('General mode requires 1–10 explicit class IDs');
  const expectedPlayers = await db.player.findMany({ where: { datasetId: current.id, seasonId: { in: seasons } }, select: { spid: true, name: true, seasonId: true }, orderBy: { spid: 'asc' } });
  if (seasons.some(s => !expectedPlayers.some(p => p.seasonId === s))) throw new Error('Class metadata missing');
  const enhancements = target?.enhancements ?? [1,2,3,4,5,6,7,8,9,10,11,12,13];
  return collectionPlanSchema.parse({ version: 1, mode: pack ? 'TARGETED' : 'GENERAL', targetPoolId: pack, targetName: pool?.itemVersion.name ?? 'Explicit class collection', top: target?.top ?? null, metadataDatasetId: current.id, expectedPlayers, enhancements, unsupportedConditions: ['Official 00:00–01:00 reference time is not supplied', 'Creation restriction / eligibility is not verified', ...(pack && pack !== 'official-pool-24987-v1' ? ['Pack OVR basis is not verified; collect a class superset without claiming OVR eligibility'] : [])], segments: seasons.map(seasonId => ({ key: `${seasonId}-0-200`, query: { seasonId, enhancements, selectedEnhancement: 1, ovrMin: 0, ovrMax: 200, page: 1, sort: 'BASE_PRICE_DESC' }, expectedCount: expectedPlayers.filter(p => p.seasonId === seasonId).length })), createdAt: new Date().toISOString() });
}
export function describePlan(plan: CollectionPlan) { return { mode: plan.mode, targetPack: plan.targetName, targetPoolId: plan.targetPoolId, enhancements: plan.enhancements, expectedMetadataPlayers: plan.expectedPlayers.length, expectedMetadataVariants: plan.expectedPlayers.length * plan.enhancements.length, candidateEligibilityVerified: false, initialSegments: plan.segments.length, estimatedRequests: { minimum: plan.segments.length, maximum: 'bounded by CLI max-segments (default 20); adaptive split if capped' }, unsupportedConditions: plan.unsupportedConditions, segments: plan.segments }; }
export async function createCollectionRun(db: PrismaClient, input: CollectionPlan) {
  const plan = collectionPlanSchema.parse(input);
  return db.priceCollectionRun.create({ data: { mode: plan.mode, targetPoolId: plan.targetPoolId, plan: plan as unknown as Prisma.InputJsonValue, planHash: planHash(plan), segments: { create: plan.segments.map(s => ({ key: s.key, priority: s.priority ?? 0, query: s.query, expectedCount: s.expectedCount })) } } });
}
export async function collectionStatus(db: PrismaClient, id: string) {
  if ((await db.priceCollectionRun.findUnique({ where: { id }, select: { mode: true } }))?.mode?.match(/^(FULL|INCREMENTAL|RECONCILIATION)$/)) {
    const m = await fullMarketStatus(db, id);
    return { runId: id, status: m.status, targetPoolId: null, requests: m.requests, failedRequests: m.failedRequests, players: m.playersWithPrice, variants: m.validPricedVariants, observations: m.observations, expectedMetadataVariants: m.totalPlayers * 13, missingPrices: m.notAvailable, unexpectedVariants: 0, duplicates: m.duplicateObservations, metadataCoveragePercent: m.metadataPriceCoveragePercent, metadataCoverageComplete: m.fullCoverageVerified, candidateEligibilityVerified: false, resolvedRankPacks: 0, rankGate: { verified: false, reason: 'OFFICIAL_REFERENCE_WINDOW_UNKNOWN' }, observedWindow: m.observedWindow, segments: m.segments.map(s => ({ ...s, page: 1, query: {}, attempts: 0 })) };
  }
  const run = await db.priceCollectionRun.findUniqueOrThrow({ where: { id }, include: { segments: { include: { requests: true, snapshot: { include: { prices: { include: { variant: true } } } } } } } });
  const plan = collectionPlanSchema.parse(run.plan);
  const prices = run.segments.flatMap(s => s.snapshot?.prices ?? []);
  const expected = plan.expectedPlayers.flatMap(p => plan.enhancements.map(e => `${p.spid}-${e}`));
  const coverage = candidateCoverage(expected, prices.map(p => `${p.variant.spid}-${p.variant.enhancement}`));
  const complete = coverage.complete && run.segments.every(s => ['SUCCEEDED','SPLIT'].includes(s.status));
  const requests = run.segments.flatMap(s => s.requests);
  return { runId: id, status: run.status, targetPoolId: run.targetPoolId, requests: requests.length, failedRequests: requests.filter(r => r.errorCode).length, players: new Set(prices.map(p => p.variant.spid)).size, variants: new Set(prices.map(p => p.variantId)).size, observations: prices.length, expectedMetadataVariants: expected.length, missingPrices: coverage.missing.length, unexpectedVariants: coverage.unexpected.length, duplicates: coverage.duplicateCount, metadataCoveragePercent: expected.length ? (coverage.collected / expected.length * 100).toFixed(2) : '0.00', metadataCoverageComplete: complete, candidateEligibilityVerified: false, resolvedRankPacks: 0, rankGate: rankCollectionGate({ coverageComplete: complete, candidates: expected.length, priced: prices.length, referenceWindowVerified: false, conditionsVerified: false, coherentTime: false }), observedWindow: { start: prices.length ? new Date(Math.min(...prices.map(p => p.observedAt.getTime()))).toISOString() : null, end: prices.length ? new Date(Math.max(...prices.map(p => p.observedAt.getTime()))).toISOString() : null }, segments: run.segments.map(s => ({ key: s.key, status: s.status, expectedCount: s.expectedCount, retrievedCount: s.retrievedCount, page: 1, query: s.query, attempts: s.requests.length, error: s.lastError })) };
}
export async function collectRun(db: PrismaClient, id: string, client: Pick<DataCenterClient, 'collect'>, maxSegments = 20, hooks: { failure?: (code: string) => Promise<void>; success?: () => Promise<void>; beforeSegment?: () => void; continueTruncation?: boolean } = {}, concurrency=1) {
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>6)throw new Error('concurrency must be 1–6');
  if (!Number.isInteger(maxSegments) || maxSegments < 0 || maxSegments > 100) throw new Error('max-segments must be 0–100');
  if ((await db.priceCollectionRun.findUnique({ where: { id } }))?.status === 'COMPLETE') return collectionStatus(db, id);
  const token = randomUUID();
  const claimed = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(41045001)::text`;
    if (await tx.priceCollectionRun.findFirst({ where: { status: 'RUNNING', leaseExpiresAt: { gt: new Date() } } })) throw new Error('Another collection is active');
    return tx.priceCollectionRun.updateMany({ where: { id, status: { notIn: ['BLOCKED','COMPLETE'] }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }] }, data: { status: 'RUNNING', lastError: null, leaseToken: token, leaseExpiresAt: new Date(Date.now() + 1800000), } });
  });
  if (!claimed.count) throw new Error('Run is locked, blocked, complete, or absent');
  let finalStatus: 'PAUSED' | 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'BLOCKED' = 'PAUSED';
  try {
    const run = await db.priceCollectionRun.findUniqueOrThrow({ where: { id } });
    const plan = collectionPlanSchema.parse(run.plan);
    if (!run.startedAt) await db.priceCollectionRun.update({ where: { id }, data: { startedAt: new Date() } });
    if (planHash(plan) !== run.planHash) throw new Error('Immutable plan hash mismatch');
    await db.priceCollectionSegment.updateMany({ where: { runId: id, status: { in: hooks.continueTruncation?['RUNNING']:['RUNNING','FAILED'] } }, data: { status: 'PENDING' } });
    if(hooks.continueTruncation){const deferred=await db.priceCollectionSegment.findMany({where:{runId:id,status:'PENDING',lastError:'SOURCE_MIN_REFRESH_INTERVAL'}});for(const segment of deferred){const until=(segment.result as {deferredUntil?:string}|null)?.deferredUntil;if(!until||new Date(until)<=new Date())await db.priceCollectionSegment.update({where:{id:segment.id},data:{lastError:null}});}}
    let processed=0,stopped=false,blockedFailure=false;
    const worker=async(slot:number)=>{while(!stopped&&processed<maxSegments){
      processed++;
      const segment=await db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(41045002)::text`;
        if(stopped)return null;
        const candidate=await tx.priceCollectionSegment.findFirst({where:{runId:id,status:'PENDING',...(hooks.continueTruncation?{OR:[{lastError:null},{lastError:{not:'SOURCE_MIN_REFRESH_INTERVAL'}}]}:{})},orderBy:[{priority:'desc'},{key:'asc'}]});
        if(!candidate)return null;
        return tx.priceCollectionSegment.update({where:{id:candidate.id},data:{status:'RUNNING',lastError:null}});
      });
      if(!segment)break;
      await db.priceCollectionRun.update({where:{id},data:{leaseExpiresAt:new Date(Date.now()+1800000)}});
      try {
        hooks.beforeSegment?.();
        const query = segmentQuerySchema.parse(segment.query);
        let html = segment.responseHtml, observedAt = segment.observedAt;
        if (!html || !observedAt) {
          const response = await client.collect(query, async event => { await db.priceCollectionRequest.create({ data: { ...event, segmentId: segment.id } }); },{segmentId:segment.id,slot});
          html = response.html; observedAt = response.observedAt;
          if (html.length > 6000000) throw new CollectionError('RESPONSE_TOO_LARGE');
          await db.priceCollectionSegment.update({ where: { id: segment.id }, data: { responseHtml: html, responseHash: hash(html), observedAt } });
        } else if (segment.responseHash !== hash(html)) throw new CollectionError('RESPONSE_HASH_MISMATCH');
        const parseStarted=performance.now();
        const result = parsePlayerList(html, query, ['FULL','INCREMENTAL','RECONCILIATION','REFERENCE'].includes(plan.mode));
        const parseMs=performance.now()-parseStarted;
        await db.priceCollectionSegment.update({ where: { id: segment.id }, data: { retrievedCount: result.retrievedCount } });
        if (result.capped) {
          const children = splitSegment(query);
          if (!children.length) throw new CollectionError(query.subdivision==='LEGACY'?'UNRESOLVED_TRUNCATION':'UNSPLITTABLE_RESULT_CAP',false,true);
          await db.$transaction(async tx => {
            for (const child of children) { const key = segmentKey(child); await tx.priceCollectionSegment.upsert({ where: { runId_key: { runId: id, key } }, create: { runId: id, key, query: child, priority: segment.priority, parentKey: segment.key, expectedCount: null }, update: {} }); }
            await tx.priceCollectionSegment.update({ where: { id: segment.id }, data: { status: 'SPLIT' } });
          });
          await hooks.success?.();
          continue;
        }
        const expectedNames = new Map(plan.expectedPlayers.map(p => [p.spid, p.name]));
        if (result.playerIds.some(spid => !expectedNames.has(spid)) || result.rows.some(p => expectedNames.get(p.spid) !== p.name)) throw new CollectionError('PLAN_METADATA_MISMATCH');
        const previousResult = segment.result as { observation?: PriceObservation; efficiency?: { newPrices: number; changed: number; unchanged: number } } | null;
        let efficiency = previousResult?.efficiency;
        let observation = previousResult?.observation;
        if (!efficiency) {
          const latest = await db.playerPriceSnapshot.findMany({ where: { variantId: { in: result.rows.map(r => `${r.spid}-${r.enhancement}`) }, observedAt: { lt: observedAt } }, orderBy: [{ observedAt: 'desc' }, { id: 'asc' }], distinct: ['variantId'], select: { variantId: true, price: true } });
          const byVariant = new Map(latest.map(p => [p.variantId,p.price.toFixed(0)]));
          efficiency = { newPrices: 0, changed: 0, unchanged: 0 };
          for (const row of result.rows) { const previous = byVariant.get(`${row.spid}-${row.enhancement}`); if (previous === undefined) efficiency.newPrices++; else if (previous === row.price) efficiency.unchanged++; else efficiency.changed++; }
        }
        if (!observation) {
          const old=await db.playerCurrentState.findMany({where:{variantId:{in:result.rows.map(r=>`${r.spid}-${r.enhancement}`)}}});
          const config=freshnessConfig();
          observation=compareObservations(result.rows.map(r=>({id:`${r.spid}-${r.enhancement}`,price:r.price,enhancement:r.enhancement})),new Map(old.map(p=>[p.variantId,{price:p.price.toFixed(0),observedAt:p.observedAt}])),observedAt,Number(process.env.PRICE_FRESH_HOURS??24),config.PRICE_OBSERVATION_LARGE_CHANGE_PERCENT,config.PRICE_OBSERVATION_WINDOW_TOLERANCE_MINUTES);
        }
        await db.priceCollectionSegment.update({ where: { id: segment.id }, data: { result: { performance:{slot,concurrency,parseMs}, observation, playerIds: result.playerIds, pricedVariantIds: result.rows.map(r=>`${r.spid}-${r.enhancement}`), missing: result.missing, efficiency } } });
        if (!result.rows.length && ['FULL','INCREMENTAL','RECONCILIATION','REFERENCE'].includes(plan.mode)) { await db.priceCollectionSegment.update({ where: { id: segment.id }, data: { status: 'SUCCEEDED' } }); await hooks.success?.(); continue; }
        const capture = validatePrices({ sourceUrl: 'https://fconline.nexon.com/datacenter', observedAt: observedAt.toISOString(), referenceAt: null, notes: `Collection run ${id}; segment ${segment.key}; response SHA256 ${hash(html)}. Public PlayerList HTML. Data Center displayed price; official reference time and pack eligibility unknown.`, rows: result.rows });
        const writeStarted=performance.now();
        const imported=await importPrices(db, capture, {compact:['FULL','INCREMENTAL','RECONCILIATION'].includes(plan.mode),reference:plan.mode==='REFERENCE',collectionSegmentId:segment.id});
        const snapshotId = `prices-${hash(JSON.stringify(capture))}`;
        // If interrupted after import, the stored response/time reproduces this immutable import.
        await db.priceCollectionSegment.update({ where: { id: segment.id }, data: { snapshotId, status: 'SUCCEEDED', result:{observation,playerIds:result.playerIds,pricedVariantIds:result.rows.map(r=>`${r.spid}-${r.enhancement}`),missing:result.missing,efficiency,performance:{...('timings' in imported?imported.timings:{}),slot,concurrency,parseMs,writeMs:performance.now()-writeStarted,historyRows:'historyRows' in imported?imported.historyRows:0}} } });
        await hooks.success?.();
      } catch (error) {
        const e = error instanceof CollectionError ? error : new CollectionError('VALIDATION_OR_STORAGE_FAILURE');
        if(e.code==='SOURCE_MIN_REFRESH_INTERVAL'&&hooks.continueTruncation){await db.priceCollectionSegment.update({where:{id:segment.id},data:{status:'PENDING',lastError:e.code,priority:-100,result:{deferredUntil:(e.deferUntil??new Date(Date.now()+7200000)).toISOString()}}});continue;}
        if(e.code==='UNRESOLVED_TRUNCATION'&&hooks.continueTruncation){await db.priceCollectionSegment.update({where:{id:segment.id},data:{status:'BLOCKED',lastError:e.code}});continue;}
        await hooks.failure?.(e.code);
        if(e.blocked)blockedFailure=true;
        if (pauseCodes.includes(e.code)||e.blocked)stopped=true;
        if (pauseCodes.includes(e.code)) { await db.priceCollectionSegment.update({ where: { id: segment.id }, data: { status: 'PENDING', lastError: e.code } }); await db.priceCollectionRun.update({ where: { id }, data: { lastError: e.code } }); finalStatus = 'PAUSED'; break; }
        await db.priceCollectionSegment.update({ where: { id: segment.id }, data: { status: e.blocked ? 'BLOCKED' : 'FAILED', lastError: e.code } });
        finalStatus = e.blocked ? 'BLOCKED' : 'FAILED';
        await db.priceCollectionRun.update({ where: { id }, data: { lastError: e.code } });
        if (['FULL','INCREMENTAL','RECONCILIATION'].includes(plan.mode) && !e.blocked) { finalStatus = 'PAUSED'; continue; }
        break;
      }
    }};
    const outcomes=await Promise.allSettled(Array.from({length:concurrency},(_,slot)=>worker(slot)));
    if(outcomes.some(o=>o.status==='rejected'))throw new Error('Worker storage failure');
    if(hooks.continueTruncation){const available=await db.priceCollectionSegment.count({where:{runId:id,status:'PENDING',OR:[{lastError:null},{lastError:{not:'SOURCE_MIN_REFRESH_INTERVAL'}}]}});const deferred=await db.priceCollectionSegment.count({where:{runId:id,status:'PENDING',lastError:'SOURCE_MIN_REFRESH_INTERVAL'}});if(!available&&deferred)await db.priceCollectionRun.update({where:{id},data:{lastError:'SOURCE_MIN_REFRESH_INTERVAL'}});}
    if(blockedFailure)finalStatus='BLOCKED';
    if (finalStatus === 'PAUSED' && ['FULL','INCREMENTAL','RECONCILIATION'].includes(plan.mode)) { const state = await fullMarketStatus(db, id); finalStatus = state.pendingSegments ? 'PAUSED' : state.fullCoverageVerified ? 'COMPLETE' : 'PARTIAL'; }
    else if (finalStatus === 'PAUSED') { const state = await collectionStatus(db, id); const remaining = state.segments.some(s => s.status === 'PENDING'); finalStatus = remaining ? 'PAUSED' : state.metadataCoverageComplete ? 'COMPLETE' : 'PARTIAL'; }
  } catch { finalStatus = 'FAILED'; await db.priceCollectionRun.update({ where: { id }, data: { lastError: 'RUN_VALIDATION_FAILURE' } }); }
  finally { await db.priceCollectionRun.updateMany({ where: { id, leaseToken: token }, data: { status: finalStatus, leaseToken: null, leaseExpiresAt: null, finishedAt: ['COMPLETE','PARTIAL','FAILED','BLOCKED'].includes(finalStatus) ? new Date() : null } }); }
  return collectionStatus(db, id);
}
