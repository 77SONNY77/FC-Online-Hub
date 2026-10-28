import {load} from 'cheerio';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CollectionError, parseBP, parsePlayerList } from '@/infrastructure/fconline-data-center/parser';
import { DataCenterClient, crawlerConfigSchema, requestBody } from '@/infrastructure/fconline-data-center/client';
import { candidateCoverage, rankCollectionGate, splitSegment, inKstCollectionWindow, type SegmentQuery } from '@/domain/players/collection-plan';
import { resolvePriceRank, conditionHash, type RankCondition } from '@/domain/rewards/resolution';
import { hash } from '@/domain/players/metadata';
const html = readFileSync('tests/fixtures/datacenter/uc-two-players.html', 'utf8');
const query: SegmentQuery = { seasonId: 877, enhancements: [1,8,13], selectedEnhancement: 1, ovrMin: 0, ovrMax: 200, page: 1, sort: 'BASE_PRICE_DESC' };
describe('actual official response fixture parsing', () => {
  it('records zero display as missing without manufacturing a zero current price',()=>{const $=load(html);$('.td_ar_bp .span_bp1').attr('title','0').text('0');const result=parsePlayerList($.html(),query,true);expect(result.missing).toHaveLength(2);expect(result.rows.every(r=>r.enhancement!==1)).toBe(true);expect(result.missing[0].reason).toBe('ZERO_DISPLAY_NO_POSITIVE_PRICE');});
  it('blocks unexpected login pages immediately',()=>{expect(()=>parsePlayerList('<form>로그인</form>',query,true)).toThrow('ACCESS_PAGE');});
  it('extracts stable SPID, class and enhancement-specific exact prices', () => { const result = parsePlayerList(html, query); expect(result.retrievedCount).toBe(2); expect(result.rows).toHaveLength(6); expect(result.rows[0]).toMatchObject({ spid: '877020801', name: '크리스티아누 호날두', enhancement: 1, price: '1260000000' }); expect(result.rows[1].price).not.toBe(result.rows[0].price); expect(result.pagination).toEqual({ page: 1, nextPageVerified: false }); });
  it.each(['<h1>Security Verification</h1>', '<p>CAPTCHA</p>', '<p>서비스 점검 중</p>', '<html><body></body></html>', '<p>일시적인 오류</p>'])('rejects security/maintenance/empty HTML', value => expect(() => parsePlayerList(value, query)).toThrow(CollectionError));
  it('rejects missing prices, identifiers, enhancement and changed class', () => { expect(() => parsePlayerList(html.replaceAll('title=', 'removed='), query)).toThrow('MISSING_PRICE'); expect(() => parsePlayerList(html.replaceAll('area_playerunit_', 'changed_'), query)).toThrow('EMPTY_OR_CHANGED'); expect(() => parsePlayerList(html, { ...query, selectedEnhancement: 8 })).toThrow('ENHANCEMENT'); expect(() => parsePlayerList(html, { ...query, seasonId: 866 })).toThrow('SEASON'); });
  it('rejects duplicate players', () => expect(() => parsePlayerList(html + html, query)).toThrow('DUPLICATE'));
  it('retains 30 digit prices without Number conversion', () => expect(parseBP('123,456,789,012,345,678,901,234,567,890 BP')).toBe('123456789012345678901234567890'));
  it.each(['0', '-1', '1,23', '1.25', 'NaN', '1e20', '9999999999999999999999999999999'])('rejects invalid price %s', value => expect(() => parseBP(value)).toThrow());
});
describe('conservative official request client', () => {
  const config = crawlerConfigSchema.parse({ REQUEST_DELAY_MS: 1000, RETRY_BACKOFF_MS: 1000 });
  it('uses only observed public POST filters and no guessed pagination', () => { const p = new URLSearchParams(requestBody(query)); expect(p.get('strSeason')).toBe(',877,'); expect(p.get('strOrderby')).toBe(' n8playergrade1 descending'); expect(p.get('n1Strong')).toBe('1'); expect(p.get('n4PageNo')).toBe('1'); });
  it('retries 5xx with backoff and records every attempt', async () => { const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('error', { status: 503 })).mockResolvedValueOnce(new Response(html, { headers: { 'content-type': 'text/html' } })); const sleep = vi.fn(async () => {}), record = vi.fn(async () => {}); const result = await new DataCenterClient(config, fetcher, sleep).collect(query, record); expect(result.html).toBe(html); expect(fetcher).toHaveBeenCalledTimes(2); expect(record).toHaveBeenCalledTimes(2); expect(sleep).toHaveBeenCalledWith(2000); });
  it.each([401,403,429])('stops without bypass or retry for HTTP %s', async status => { const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status })); await expect(new DataCenterClient(config, fetcher, async () => {}).collect(query, async () => {})).rejects.toMatchObject({ blocked: true }); expect(fetcher).toHaveBeenCalledTimes(1); });
  it('bounds network failures and rejects non-HTML', async () => { const failed = vi.fn<typeof fetch>().mockRejectedValue(new Error('network')); await expect(new DataCenterClient(config, failed, async () => {}).collect(query, async () => {})).rejects.toThrow('NETWORK_OR_TIMEOUT'); expect(failed).toHaveBeenCalledTimes(3); const json = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: 'changed' })); await expect(new DataCenterClient(config, json, async () => {}).collect(query, async () => {})).rejects.toThrow('CONTENT_TYPE'); });
  it('honors robots and refuses unknown policy pages', async () => { for (const body of ['User-agent: *\nDisallow: /datacenter', '<h1>Security</h1>']) { const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body)); await expect(new DataCenterClient(config, fetcher).checkRobots()).rejects.toMatchObject({ blocked: true }); } });
  it('bounds concurrency while keeping conservative delay', () => { expect(() => crawlerConfigSchema.parse({ MAX_CONCURRENCY: 7 })).toThrow(); expect(() => crawlerConfigSchema.parse({ REQUEST_DELAY_MS: 0 })).toThrow(); });
});
describe('candidate completeness and rank publication gate', () => {
  const expected = Array.from({ length: 750 }, (_, i) => `player-${i}`);
  it('rejects 749 of 750 even if reference information is verified', () => { const coverage = candidateCoverage(expected, expected.slice(0,749)); expect(coverage.complete).toBe(false); expect(rankCollectionGate({ coverageComplete: coverage.complete, candidates: 750, priced: 749, referenceWindowVerified: true, conditionsVerified: true, coherentTime: true }).verified).toBe(false); });
  it('rejects duplicate or unexpected candidates', () => { expect(candidateCoverage(expected, [...expected, expected[0]]).complete).toBe(false); expect(candidateCoverage(expected, [...expected.slice(1), 'unknown']).complete).toBe(false); });
  it('complete observed coverage still cannot invent a reference window', () => expect(rankCollectionGate({ coverageComplete: true, candidates: 750, priced: 750, referenceWindowVerified: false, conditionsVerified: true, coherentTime: true }).verified).toBe(false));
  it('a complete verified 750-candidate test snapshot resolves TOP 95', () => {
    const condition: RankCondition = { poolId: 'SYNTHETIC', rawHash: hash('TEST ONLY'), seasonId: 999, enhancements: [8], minOvr: null, ovrBasis: 'NONE', excludeUnavailable: true, top: 95 };
    const gate = rankCollectionGate({ coverageComplete: candidateCoverage(expected, expected).complete, candidates: 750, priced: 750, referenceWindowVerified: true, conditionsVerified: true, coherentTime: true });
    expect(gate.verified).toBe(true);
    const result = resolvePriceRank(condition, '2026-09-19', { id: 'SYNTHETIC', poolId: condition.poolId, referenceDate: '2026-09-19', windowStart: '2026-09-18T15:00:00.000Z', windowEnd: '2026-09-18T16:00:00.000Z', conditionHash: conditionHash(condition), complete: true, candidateCount: 750, tiePolicy: 'NO_TIES', sourceUrl: 'https://fconline.nexon.com/datacenter', datasetVersion: 'SYNTHETIC_TEST_ONLY', verified: true, entries: expected.map((_, i) => ({ rank: i + 1, spid: String(999000001 + i), name: `TEST ${i}`, seasonId: 999, enhancement: 8, price: String(10000 - i), referenceAt: '2026-09-18T15:30:00.000Z', observedAt: '2026-09-18T15:45:00.000Z', available: true, ovr: null, verified: true })) });
    expect(result.status).toBe('RESOLVED'); expect(result.entries).toHaveLength(95); expect(result.entries[94].spid).toBe('999000095');
  });
  it('splits capped OVR filters into disjoint inclusive ranges', () => { expect(splitSegment(query).map(q => [q.ovrMin,q.ovrMax])).toEqual([[0,100],[101,200]]); expect(splitSegment({ ...query, ovrMin: 120, ovrMax: 120 })).toEqual([]); });
});

it('enforces the KST midnight window without replacing reference timestamps', () => { expect(inKstCollectionWindow(new Date('2026-09-20T14:59:59Z'))).toBe(false); expect(inKstCollectionWindow(new Date('2026-09-20T15:00:00Z'))).toBe(true); expect(inKstCollectionWindow(new Date('2026-09-20T16:00:00Z'))).toBe(false); });
