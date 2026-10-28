import { createHash } from 'node:crypto';
import { z } from 'zod';
import { idSchema } from '@/contracts/catalog';
import { parseProbability, validateProbabilitySum, type Behavior } from '@/domain/rewards/probability';
export const officialUrl = z.string().url().refine(value => {
  const u = new URL(value); return u.protocol === 'https:' && ['shop.fconline.nexon.com', 'iteminfo.nexon.com'].includes(u.hostname) && !u.username && !u.password;
}, 'Missing official source');
export const snapshotSchema = z.object({
  id: idSchema, sourceUrl: officialUrl, fetchedAt: z.string().datetime(), verifiedAt: z.string().datetime(),
  acquisition: z.enum(['LIVE_BROWSER_TEXT', 'PUBLIC_WEB_TEXT']), retrievalNote: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), content: z.string().min(1),
}).strict();
export const captureSchema = z.object({
  datasetId: idSchema, sourceId: idSchema, version: z.number().int().positive(), productId: idSchema,
  detailSnapshotId: idSchema, cardSnapshotId: idSchema,
  imageUrl: z.string().regex(/^https:\/\/fo4\.dn\.nexoncdn\.co\.kr\/live\/externalAssets\/shop\/items\/product\/\d+\.png$/),
  imageObservedUrl: z.string().url(), imageCheckedAt: z.string().datetime(),
}).strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Target = { targetType: 'PRICE_RANK' | 'NESTED_ITEM' | 'BP_AMOUNT'; rank: number | null; bpAmount: string | null; targetItemVersionId: string | null };
export type Entry = Target & { rewardLabel: string; quantity: number; conditionRaw: string; probabilityRaw: string; numerator: string };
export type Pool = { id: string; itemVersionId: string; snapshotId: string; name: string; behavior: Behavior; conditionRaw: string; effectivePeriod: string; entries: Entry[]; denominator: string; sumNumerator: string; toleranceNumerator: string };
export function hashContent(content: string) { return createHash('sha256').update(content).digest('hex'); }
export function parseOfficialTable(snapshot: Snapshot) {
  const name = snapshot.content.match(/^### (.+)$/m)?.[1];
  const effectivePeriod = snapshot.content.match(/^\* 판매 or 획득 가능 기간 : (.+)$/m)?.[1];
  if (!name || !effectivePeriod) throw new Error('Unsupported table header');
  const conditionRaw = snapshot.content.split('\n').filter(line => line.startsWith('* ') && !line.startsWith('* 판매')).join('\n');
  const candidates = snapshot.content.split('\n').filter(line => line.includes('|') && !line.includes('---') && !line.includes('확률'));
  if (!candidates.length) throw new Error('Missing reward table');
  let grade = '';
  const rows = candidates.map(line => {
    const cells = line.split('|').map(c => c.trim());
    if (![3, 4].includes(cells.length)) throw new Error('Unsupported table row');
    if (cells.length === 4) grade = cells.shift()!;
    const [label, quantityRaw, probabilityRaw] = cells;
    if (!label || !/^[1-9]\d{0,4}$/.test(quantityRaw)) throw new Error('Missing reward or invalid quantity');
    parseProbability(probabilityRaw);
    return { label, quantity: Number(quantityRaw), probabilityRaw, grade };
  });
  if (new Set(rows.map(r => `${r.grade}|${r.label}`)).size !== rows.length) throw new Error('Duplicate reward');
  return { name, effectivePeriod, conditionRaw, rows };
}
const itemId = (sn: string, version: number) => `official-item-${sn}-v${version}`;
export function validateOfficialImport(rawSnapshots: unknown, rawCapture: unknown) {
  const snapshots = z.array(snapshotSchema).min(1).parse(rawSnapshots);
  const capture = captureSchema.parse(rawCapture);
  if (new Set(snapshots.map(s => s.id)).size !== snapshots.length) throw new Error('Duplicate snapshots');
  for (const s of snapshots) if (hashContent(s.content) !== s.contentHash) throw new Error('Source snapshot hash mismatch');
  const get = (id: string) => { const s = snapshots.find(s => s.id === id); if (!s) throw new Error('Missing source snapshot'); return s; };
  const detail = get(capture.detailSnapshotId), card = get(capture.cardSnapshotId);
  if (new URL(detail.sourceUrl).hostname !== 'shop.fconline.nexon.com' || new URL(card.sourceUrl).hostname !== 'shop.fconline.nexon.com') throw new Error('Invalid product source');
  const lines = card.content.split('\n').map(s => s.trim()).filter(Boolean);
  const name = lines.find(s => s.startsWith('[쓸돌]'));
  const priceMatch = card.content.match(/^\s*(\d{1,3}(?:,\d{3})*|\d{1,30}) (FC)\s*$/m);
  const salePeriod = lines.find(s => /^\d{4}\.\d{2}\.\d{2}/.test(s));
  const limit = card.content.match(/구매제한 계정 (\d+)회/);
  if (!name || !priceMatch || !salePeriod || !limit || !detail.content.includes(name) || !detail.content.includes(priceMatch[0].trim())) throw new Error('Incomplete product facts');
  if (!card.content.includes(`FCO, FCOM, WEB에서 각 ${limit[1]}회`)) throw new Error('Unverified purchase limit scope');
  if (!Number.isSafeInteger(Number(limit[1])) || Number(limit[1]) < 1 || Number(limit[1]) > 100000) throw new Error('Invalid purchase limit');
  const period = /^(\d{4})\.(\d{2})\.(\d{2})\(.\) (\d{2}:\d{2}) ~ (\d{2})\.(\d{2})\(.\) (\d{2}:\d{2})$/.exec(salePeriod);
  if (!period) throw new Error('Unsupported sale period');
  const saleStartsAt = new Date(`${period[1]}-${period[2]}-${period[3]}T${period[4]}:00+09:00`).toISOString();
  const saleEndsAt = new Date(`${period[1]}-${period[5]}-${period[6]}T${period[7]}:00+09:00`).toISOString();
  if (saleStartsAt >= saleEndsAt) throw new Error('Invalid sale period');
  const tables = snapshots.filter(s => new URL(s.sourceUrl).hostname === 'iteminfo.nexon.com').map(s => ({ snapshot: s, sn: new URL(s.sourceUrl).searchParams.get('sn')!, ...parseOfficialTable(s) }));
  if (tables.some(t => !/^\d+$/.test(t.sn)) || new Set(tables.map(t => t.name)).size !== tables.length) throw new Error('Duplicate or missing table identity');
  const byName = new Map(tables.map(t => [t.name, itemId(t.sn, capture.version)]));
  const pools: Pool[] = tables.map(t => {
    const rankBased = t.rows.every(r => /^개봉일 0~1시 사이 기준가 TOP [1-9]\d*$/.test(r.label));
    const bp = t.rows.every(r => r.grade === 'BP' && /^\d+$/.test(r.label));
    const behavior: Behavior = rankBased ? 'PLAYER_POOL' : bp ? 'FIXED' : t.rows.every(r => parseProbability(r.probabilityRaw).numerator === 100n * 10n ** 18n) ? 'ALL' : 'WEIGHTED_RANDOM';
    const conditionRaw = `${t.name}\n${t.conditionRaw}`;
    const entries: Entry[] = t.rows.map(r => {
      const target: Target = rankBased ? { targetType: 'PRICE_RANK', rank: Number(r.label.match(/TOP (\d+)$/)![1]), bpAmount: null, targetItemVersionId: null } : bp ? { targetType: 'BP_AMOUNT', rank: null, bpAmount: r.label, targetItemVersionId: null } : { targetType: 'NESTED_ITEM', rank: null, bpAmount: null, targetItemVersionId: byName.get(r.label) ?? null };
      if (target.targetType === 'NESTED_ITEM' && !target.targetItemVersionId) throw new Error(`Missing reward target: ${r.label}`);
      return { ...target, rewardLabel: r.label, quantity: r.quantity, probabilityRaw: r.probabilityRaw, numerator: parseProbability(r.probabilityRaw).numerator.toString(), conditionRaw: [t.name, r.grade, rankBased ? '개봉일 0~1시 사이 기준가 순위; 실제 선수 매핑 미확보' : ''].filter(Boolean).join(' · ') };
    });
    if (rankBased) {
      const expected = Number(t.name.match(/Top Price (\d+)/)?.[1]);
      if (!expected || entries.length !== expected || entries.some((e, i) => e.rank !== i + 1)) throw new Error('Incomplete rank table');
    }
    const totals = validateProbabilitySum(entries.map(e => e.probabilityRaw), behavior);
    return { id: `official-pool-${t.sn}-v${capture.version}`, itemVersionId: itemId(t.sn, capture.version), snapshotId: t.snapshot.id, name: t.name, behavior, conditionRaw, effectivePeriod: t.effectivePeriod, entries, denominator: totals.denominator.toString(), sumNumerator: totals.sum.toString(), toleranceNumerator: totals.tolerance.toString() };
  });
  const componentLines = card.content.split('\n구성품\n')[1]?.trim().split('\n').filter(Boolean);
  if (!componentLines?.length) throw new Error('Missing product components');
  const eventItems: { id: string; name: string; kind: 'EVENT_ITEM'; conditionRaw: string; behavior: 'UNKNOWN' }[] = [];
  const components = componentLines.map(line => {
    const match = /^(.+) (\d+)개$/.exec(line.trim()); if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) < 1 || Number(match[2]) > 100000) throw new Error('Invalid component quantity');
    const label = match[1];
    const detailLines = detail.content.split('\n').map(s => s.trim()).filter(Boolean);
    const index = detailLines.lastIndexOf(label);
    if (index < 0) throw new Error('Component absent from official detail');
    const shownQuantity = /^x (\d+)$/.exec(detailLines[index - 1] ?? '');
    // Unmarked single-item rows are cross-checked against the explicit card quantity.
    if ((shownQuantity ? Number(shownQuantity[1]) : 1) !== Number(match[2])) throw new Error('Conflicting component quantity');
    // The official shop omits the opening quote; the probability title includes it.
    const target = byName.get(label) ?? byName.get(`'${label}`);
    if (target) return { itemVersionId: target, quantity: Number(match[2]) };
    if (!label.includes('쓸돌 코인') || !detail.content.includes(label)) throw new Error('Unverified component mapping');
    const id = `official-autumn-coin-v${capture.version}`;
    const conditionRaw = detail.content.slice(detail.content.lastIndexOf(label + '\n')).trim();
    eventItems.push({ id, name: label, kind: 'EVENT_ITEM', conditionRaw, behavior: 'UNKNOWN' });
    return { itemVersionId: id, quantity: Number(match[2]) };
  });
  if (new Set(components.map(c => c.itemVersionId)).size !== components.length) throw new Error('Duplicate product component');
  const items = [...pools.map(p => ({ id: p.itemVersionId, name: p.name, kind: p.behavior === 'PLAYER_POOL' ? 'PLAYER_PACK' as const : p.behavior === 'FIXED' ? 'BP_CARD' as const : 'BOX' as const, conditionRaw: p.conditionRaw, behavior: p.behavior })), ...eventItems];
  const visited = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (path.includes(id) || path.length >= 8) throw new Error('Cyclic or excessive reward tree');
    if (!items.some(i => i.id === id)) throw new Error('Missing item');
    visited.add(id);
    for (const e of pools.find(p => p.itemVersionId === id)?.entries ?? []) if (e.targetItemVersionId) visit(e.targetItemVersionId, [...path, id]);
  };
  for (const c of components) visit(c.itemVersionId, []);
  if (visited.size !== items.length) throw new Error('Unreachable reward items');
  return { capture, snapshots, items, pools, product: { id: capture.productId, versionId: `${capture.productId}-v${capture.version}`, name, price: priceMatch[1].replaceAll(',', ''), currency: 'FC' as const, salePeriod, saleStartsAt, saleEndsAt, purchaseLimit: `계정 ${limit[1]}회 (FCO, FCOM, WEB 각각)`, maxPerReset: Number(limit[1]), components }, importHash: hashContent(JSON.stringify({ capture, snapshots })) };
}
