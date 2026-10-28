import {withRequestContext} from './request-context';
import { z } from 'zod';
import type { SegmentQuery } from '@/domain/players/collection-plan';
import { CollectionError } from './parser';
import defaults from './request-defaults.json';
export const endpoint = 'https://fconline.nexon.com/datacenter/PlayerList';
export const crawlerConfigSchema = z.object({ MAX_CONCURRENCY: z.coerce.number().int().min(1).max(6).default(1), REQUEST_DELAY_MS: z.coerce.number().int().min(1000).max(60000).default(3000), REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(30000), MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(2), RETRY_BACKOFF_MS: z.coerce.number().int().min(1000).max(60000).default(5000) });
export type CrawlerConfig = z.infer<typeof crawlerConfigSchema>;
export type RequestEvent = { startedAt: Date; finishedAt: Date; statusCode: number | null; errorCode: string | null };
export function requestBody(q: SegmentQuery) {
  return new URLSearchParams({ ...defaults, ...(q.position?{strPosition:','+q.position.join(',')+','}:{}), ...(q.height?{n4HeightMin:String(q.height[0]),n4HeightMax:String(q.height[1])}:{}), strSeason: `,${q.seasonId},`, n1Strong: String(q.selectedEnhancement), n4OvrMin: String(q.ovrMin), n4OvrMax: String(q.ovrMax), strOrderby: ' n8playergrade1 descending', n4PageNo: '1' }).toString();
}
export class DataCenterClient {
  private nextAt = 0;
  private penalty = 1;
  constructor(private config: CrawlerConfig, private fetcher: typeof fetch = fetch, private sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)), private mayRequest: () => boolean = () => true) {}
  async checkRobots() {
    const response = await this.fetcher('https://fconline.nexon.com/robots.txt', { redirect: 'error', signal: AbortSignal.timeout(this.config.REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new CollectionError('ROBOTS_UNAVAILABLE', false, true);
    const text = await response.text();
    if (text.length > 100000 || !/user-agent:/i.test(text)) throw new CollectionError('ROBOTS_FORMAT_UNKNOWN', false, true);
    let applies = false, hasRules = false;
    for (const line of text.split(/\r?\n/)) {
      const [key, ...value] = line.split(':'); const v = value.join(':').split('#')[0].trim();
      if (key.trim().toLowerCase() === 'user-agent') { applies = (hasRules ? false : applies) || ['*', 'node'].includes(v.toLowerCase()); hasRules = false; }
      if (['allow','disallow'].includes(key.trim().toLowerCase())) hasRules = true;
      if (applies && key.trim().toLowerCase() === 'disallow' && v && '/datacenter/PlayerList'.toLowerCase().startsWith(v.replace(/\*.*$/, '').toLowerCase())) throw new CollectionError('ROBOTS_DISALLOW', false, true);
    }
    this.nextAt = Date.now() + this.config.REQUEST_DELAY_MS * this.penalty;
    return { url: 'https://fconline.nexon.com/robots.txt', checkedAt: new Date().toISOString(), requests: 1, note: 'No applicable Data Center disallow; not a license to redistribute.' };
  }
  async collect(query: SegmentQuery, record: (event: RequestEvent) => Promise<void>, context?:{segmentId:string;slot:number}) {
    for (let attempt = 0; attempt <= this.config.MAX_RETRIES; attempt++) {
      await this.sleep(Math.max(0, this.nextAt - Date.now()));
      if (!this.mayRequest()) throw new CollectionError('COLLECTION_WINDOW_CLOSED');
      const startedAt = new Date();
      this.nextAt = Date.now() + this.config.REQUEST_DELAY_MS * this.penalty;
      let response: Response;
      try { response = await this.fetcher(endpoint, withRequestContext({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' }, body: requestBody(query), redirect: 'error', signal: AbortSignal.timeout(this.config.REQUEST_TIMEOUT_MS) },context)); }
      catch (error) { if (error instanceof CollectionError) throw error; this.penalty = Math.min(8, this.penalty * 2); await record({ startedAt, finishedAt: new Date(), statusCode: null, errorCode: 'NETWORK_OR_TIMEOUT' }); if (attempt === this.config.MAX_RETRIES) throw new CollectionError('NETWORK_OR_TIMEOUT', true); await this.sleep(Math.max(this.config.RETRY_BACKOFF_MS * (attempt + 1), this.config.REQUEST_DELAY_MS * this.penalty)); continue; }
      if (!response.ok) {
        const code = `HTTP_${response.status}`;
        if (response.status >= 500 || response.status === 429) this.penalty = Math.min(8, this.penalty * 2);
        await record({ startedAt, finishedAt: new Date(), statusCode: response.status, errorCode: code });
        // Stop on access control and rate limiting. Resume is explicit, never a bypass.
        if ([401, 403, 429].includes(response.status)) throw new CollectionError(code, false, true);
        if (response.status < 500 || attempt === this.config.MAX_RETRIES) throw new CollectionError(code);
        await this.sleep(Math.max(this.config.RETRY_BACKOFF_MS * (attempt + 1), this.config.REQUEST_DELAY_MS * this.penalty)); continue;
      }
      if (!(response.headers.get('content-type') ?? '').includes('text/html')) { await record({ startedAt, finishedAt: new Date(), statusCode: response.status, errorCode: 'CONTENT_TYPE_CHANGED' }); throw new CollectionError('CONTENT_TYPE_CHANGED'); }
      let html: string;
      try { html = await response.text(); } catch (error) { if (error instanceof CollectionError) throw error; this.penalty = Math.min(8, this.penalty * 2); await record({ startedAt, finishedAt: new Date(), statusCode: response.status, errorCode: 'INCOMPLETE_BODY' }); throw new CollectionError('INCOMPLETE_BODY', true); }
      await record({ startedAt, finishedAt: new Date(), statusCode: response.status, errorCode: null });
      this.penalty = Math.max(1, this.penalty - 0.25);
      return { html, observedAt: new Date() };
    }
    throw new CollectionError('RETRY_EXHAUSTED');
  }
}
