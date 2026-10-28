import { load } from 'cheerio';
import { bpSchema, spidSchema } from '@/domain/players/price';
export class CollectionError extends Error {
  deferUntil?: Date;
  constructor(public code: string, public retryable = false, public blocked = false) { super(code); }
}
export function parseBP(raw: string): string {
  const value = raw.trim().replace(/\s+BP$/, '');
  if (!/^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(value)) throw new CollectionError('INVALID_PRICE');
  return bpSchema.parse(value.replaceAll(',', ''));
}
export type CollectedPrice = { spid: string; name: string; enhancement: number; price: string; ovr: number | null; position: string | null };
export function parsePlayerList(html: string, query: { seasonId: number; enhancements: number[]; selectedEnhancement: number }, market = false) {
  if (!html.trim() || html.length > 6000000) throw new CollectionError('UNEXPECTED_RESPONSE');
  const $ = load(html);
  const visible = $.root().clone(); visible.find('script,style').remove();
  const text = visible.text();
  if (/captcha|security verification|access denied|접근이 제한|보안.{0,10}(확인|검사|인증)/i.test(text)) throw new CollectionError('SECURITY_PAGE', false, true);
  if (/서비스.{0,10}점검|점검.{0,10}중|일시적.{0,10}오류/.test(text)) throw new CollectionError('MAINTENANCE_PAGE', false, true);
  const elements = $('[id^="area_playerunit_"]');
  if(!elements.length&&/로그인|sign in|log in/i.test(text))throw new CollectionError('ACCESS_PAGE',false,true);
  // A missing container is not assumed to be a legitimate empty result.
  if (!elements.length && market && $('.tr.empty .txt').length === 1 && $('.tr.empty .txt').text().trim() === '검색 결과가 없습니다.') return { rows: [], missing: [], playerIds: [], retrievedCount: 0, capped: false, pagination: { page: 1, nextPageVerified: false } };
  if (!elements.length) throw new CollectionError('EMPTY_OR_CHANGED_RESPONSE');
  if (elements.length > 200) throw new CollectionError('UNEXPECTED_RESULT_LIMIT');
  const seen = new Set<string>(), rows: CollectedPrice[] = [];
  const missing: { spid: string; enhancement: number; reason: string }[] = [];
  elements.each((_, element) => {
    const node = $(element), spid = node.attr('id')!.replace('area_playerunit_', '');
    if (!spidSchema.safeParse(spid).success || Number(spid.slice(0, 3)) !== query.seasonId) throw new CollectionError('PLAYER_ID_OR_SEASON_MISMATCH');
    if (seen.has(spid)) throw new CollectionError('DUPLICATE_PLAYER'); seen.add(spid);
    const names = node.find('.info_top .name');
    if (names.length !== 1 || !names.text().trim()) throw new CollectionError('MISSING_PLAYER_NAME');
    const name = names.text().trim();
    const selected = node.find(`input[name="Strong${spid}"]`).attr('value');
    if (!selected || Number(selected.split('/')[0]) !== query.selectedEnhancement) throw new CollectionError('ENHANCEMENT_MISMATCH');
    for (const enhancement of query.enhancements) {
      const priceNode = node.find(`.td_ar_bp .span_bp${enhancement}`);
      if (market && priceNode.length === 1 && priceNode.text().trim() === '-' && !priceNode.attr('title')) { missing.push({ spid, enhancement, reason: 'NOT_AVAILABLE' }); continue; }
      if(market&&priceNode.length===1&&priceNode.attr('title')?.trim()==='0'&&priceNode.text().trim()==='0'){missing.push({spid,enhancement,reason:'ZERO_DISPLAY_NO_POSITIVE_PRICE'});continue;}
      if (priceNode.length !== 1 || !priceNode.attr('title')) throw new CollectionError('MISSING_PRICE');
      const price = parseBP(priceNode.attr('title')!);
      // Collector does not infer pure base/enhanced OVR from display formulas.
      rows.push({ spid, name, enhancement, price, ovr: null, position: null });
    }
  });
  return { rows, missing, playerIds: [...seen], retrievedCount: seen.size, capped: seen.size === 200, pagination: { page: 1, nextPageVerified: false } };
}
