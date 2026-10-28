import { historyDecision, syncConfig } from '@/domain/collection/sync';
import type { PrismaClient } from '@prisma/client';
import { hash, metadataUrl, validateMetadata } from '@/domain/players/metadata';
import { validatePrices } from '@/domain/players/price';
export async function importPlayers(db: PrismaClient, playersRaw: string, seasonsRaw: string, observedAt: Date) {
  const data = validateMetadata(playersRaw, seasonsRaw);
  if (!Number.isFinite(observedAt.getTime()) || observedAt.getTime() > Date.now() + 60000) throw new Error('Invalid observation time');
  const id = `players-${data.contentHash}`;
  return db.$transaction(async tx => {
    // Serializes metadata publication; failures leave the previous catalog intact.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(41004001)::text`;
    if (await tx.playerDataset.findUnique({ where: { id } })) return { imported: false, players: data.players.length, seasons: data.seasons.length, id };
    const latest = await tx.playerDataset.findFirst({ orderBy: { observedAt: 'desc' } });
    if (latest && latest.observedAt > observedAt) throw new Error('Older metadata cannot replace current metadata');
    await tx.playerDataset.create({ data: { id, sourceUrl: metadataUrl, observedAt, contentHash: data.contentHash, playersRaw, seasonsRaw } });
    for (const s of data.seasons) await tx.season.upsert({ where: { id: s.seasonId }, create: { id: s.seasonId, name: s.className, imageUrl: s.seasonImg, datasetId: id }, update: { name: s.className, imageUrl: s.seasonImg, datasetId: id } });
    // Parameterized bulk SQL avoids 88k sequential upserts. Historical datasets remain immutable.
    for (let i = 0; i < data.players.length; i += 1000) {
      const rows = JSON.stringify(data.players.slice(i, i + 1000));
      await tx.$executeRaw`INSERT INTO "Player" ("spid","pid","name","seasonId","imageUrl","datasetId","lastUpdatedAt") SELECT x.spid,x.pid,x.name,x."seasonId",x."imageUrl",${id},(${observedAt.toISOString()}::timestamptz AT TIME ZONE 'UTC') FROM jsonb_to_recordset(${rows}::jsonb) AS x(spid text,pid text,name text,"seasonId" integer,"imageUrl" text) ON CONFLICT ("spid") DO UPDATE SET name=EXCLUDED.name,"seasonId"=EXCLUDED."seasonId","imageUrl"=EXCLUDED."imageUrl","datasetId"=EXCLUDED."datasetId","lastUpdatedAt"=EXCLUDED."lastUpdatedAt"`;
    }
    return { imported: true, players: data.players.length, seasons: data.seasons.length, id };
  }, { timeout: 120000 });
}
export async function importPrices(db: PrismaClient, input: unknown, options: { compact?: boolean; reference?: boolean; heartbeatHours?: number; collectionSegmentId?:string } = {}) {
  const capture = validatePrices(input), content = JSON.stringify(capture), contentHash = hash(content), id = `prices-${contentHash}`;
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(41004002)::text`;
    const transactionStarted=performance.now();
    const existing = await tx.priceSourceSnapshot.findUnique({where:{id}})??await tx.priceSourceSnapshot.findUnique({ where: { sourceUrl_observedAt_captureKey: { sourceUrl: capture.sourceUrl, observedAt: new Date(capture.observedAt),captureKey:options.collectionSegmentId??'GENERAL' } } });
    if (existing) { if (existing.contentHash !== contentHash) throw new Error('Conflicting immutable price observation'); return { imported: false, records: capture.rows.length }; }
    const players = await tx.player.findMany({ where: { spid: { in: [...new Set(capture.rows.map(r => r.spid))] } } });
    const names = new Map(players.map(p => [p.spid, p.name]));
    if (capture.rows.some(r => names.get(r.spid) !== r.name)) throw new Error('Price player metadata mismatch');
    await tx.priceSourceSnapshot.create({ data: { id, captureKey:options.collectionSegmentId??'GENERAL', sourceUrl: capture.sourceUrl, source: 'OFFICIAL_WEB', observedAt: new Date(capture.observedAt), contentHash, content, notes: capture.notes } });
    await tx.playerVariant.createMany({ data: capture.rows.map(row => ({ id: `${row.spid}-${row.enhancement}`, spid: row.spid, enhancement: row.enhancement })), skipDuplicates: true });
    const before = await tx.playerCurrentState.findMany({where:{variantId:{in:capture.rows.map(r=>`${r.spid}-${r.enhancement}`)}}});
    const previous = new Map(before.map(p=>[p.variantId,p]));
    const at = new Date(capture.observedAt), decisions = capture.rows.map(row=>{
      const variantId=`${row.spid}-${row.enhancement}`, old=previous.get(variantId);
      const decision=historyDecision(old?{price:old.price.toFixed(0),historyAt:old.historyAt}:null,row.price,at,options.heartbeatHours??syncConfig().PRICE_HISTORY_HEARTBEAT_HOURS,options.reference);
      const reason=decision.reason??(options.compact?null:'HEARTBEAT');
      return {row,variantId,old,reason,classification:decision.classification};
    });
    const history=decisions.filter(d=>d.reason);
    const historyStarted=performance.now();
    if(history.length) await tx.playerPriceSnapshot.createMany({data:history.map(({row,variantId,reason})=>({id:`${id}-${variantId}`,variantId,price:row.price,referenceAt:null,observedAt:at,snapshotId:id,verificationStatus:'NEEDS_VERIFICATION',ovr:row.ovr,position:row.position,reason:reason!}))});
    const historyWriteMs=performance.now()-historyStarted,currentStarted=performance.now();
    // One transaction publishes current value/lastSeen and selected history together.
    for(const {row,variantId,old,reason} of decisions){
      if(old && old.observedAt>=at) continue; // Historical imports cannot roll current backwards.
      const historyId=reason?`${id}-${variantId}`:old!.historyId, historyAt=reason?at:old!.historyAt;
      await tx.playerCurrentState.upsert({where:{variantId},create:{variantId,price:row.price,observedAt:at,historyAt,snapshotId:id,historyId,ovr:row.ovr,position:row.position},update:{...(old?.price.toFixed(0)===row.price?{}:{price:row.price}),observedAt:at,historyAt,snapshotId:id,historyId,ovr:row.ovr,position:row.position}});
    }
    return { imported: true, records: capture.rows.length, historyRows: history.length, timings:{historyWriteMs,currentUpsertMs:performance.now()-currentStarted,transactionMs:performance.now()-transactionStarted} };
  }, { timeout: 30000 });
}
