import { CatalogError } from '@/application/catalog';
export function playerQuery(request: Request) { return Object.fromEntries(new URL(request.url).searchParams); }
export async function playerResponse(action: () => Promise<unknown>) {
  try { return Response.json(await action(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { const e = error instanceof CatalogError ? error : new CatalogError('DATA_UNAVAILABLE', 503); return Response.json({ error: { code: e.code, message: '선수 정보를 확인할 수 없습니다.' } }, { status: e.status }); }
}
