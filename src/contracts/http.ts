import { CatalogError } from '@/application/catalog';
export function errorResponse(error: unknown) {
  const known = error instanceof CatalogError ? error : new CatalogError('DATA_UNAVAILABLE', 503);
  const messages = { INVALID_INPUT: '요청 형식을 확인해 주세요.', NOT_FOUND: '상품을 찾을 수 없습니다.', DATA_UNAVAILABLE: '상품 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  return Response.json({ error: { code: known.code, message: messages[known.code] } }, { status: known.status, headers: { 'Cache-Control': 'no-store' } });
}
