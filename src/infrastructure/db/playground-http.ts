import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getDb } from './client';
import { createPlaygroundService } from '@/application/playground';
import { LIFETIME_SECONDS, PlaygroundError, fail } from '@/domain/playground/rules';

const COOKIE = 'fclab_play';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export function playground() { return createPlaygroundService(getDb()); }
export function privateJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
}
export async function requestBody(request: Request) {
  // Next may normalize request.url to its internal hostname. Browser Origin
  // must match the public Host instead; deployments behind a proxy pin APP_ORIGIN.
  const url = new URL(request.url);
  const origin = process.env.APP_ORIGIN ?? `${url.protocol}//${request.headers.get('host') ?? url.host}`;
  if (request.headers.get('origin') !== origin) fail('INVALID_ORIGIN', '이 페이지에서 다시 시도해 주세요.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail('INVALID_INPUT', '요청 형식을 확인해 주세요.', 400);
  const text = await request.text();
  if (text.length > 4096) fail('INVALID_INPUT', '요청이 너무 큽니다.', 413);
  try { return JSON.parse(text) as unknown; } catch { fail('INVALID_INPUT', '요청 형식을 확인해 주세요.', 400); }
}
export async function browserId() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) fail('STATE_EXPIRED', '저장된 상태를 다시 불러와 주세요.', 419);
  const browser = await getDb().browserState.findUnique({ where: { tokenHash: hash(token) } });
  if (!browser || browser.expiresAt <= new Date()) fail('STATE_EXPIRED', '저장된 상태를 다시 불러와 주세요.', 419);
  return browser.id;
}
export async function initialize(request: Request) {
  z.object({}).strict().parse(await requestBody(request));
  try { return privateJson(await playground().state(await browserId())); }
  catch (e) { if (!(e instanceof PlaygroundError) || e.code !== 'STATE_EXPIRED') throw e; }
  const token = randomBytes(32).toString('hex');
  const browser = await getDb().browserState.create({ data: { tokenHash: hash(token), expiresAt: new Date(Date.now() + LIFETIME_SECONDS * 1000), wallets: { create: { dataType: 'MOCK', currency: 'FC', balance: 0n } } } });
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: LIFETIME_SECONDS, secure: (process.env.APP_ORIGIN ?? request.url).startsWith('https:') });
  return privateJson({ ...await playground().state(browser.id), fresh: true });
}
export async function mutate(request: Request, kind: 'CHARGE' | 'PURCHASE' | 'RESET') {
  const body = await requestBody(request);
  const id = await browserId();
  return privateJson(await playground().execute(id, kind, request.headers.get('idempotency-key'), body));
}
export function playgroundError(error: unknown) {
  if (error instanceof z.ZodError) return privateJson({ error: { code: 'INVALID_INPUT', message: '요청 값을 확인해 주세요.' } }, 400);
  if (error instanceof PlaygroundError) return privateJson({ error: { code: error.code, message: error.message } }, error.status);
  // Never forward SQL, tokens, credentials, or raw engine errors.
  console.error('[playground] request failed');
  return privateJson({ error: { code: 'DATA_UNAVAILABLE', message: '처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.' } }, 503);
}
