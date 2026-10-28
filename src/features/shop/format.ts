import type { Metadata, Product } from '@/contracts/catalog';
export function priceLabel(product: Pick<Product, 'price' | 'currency'>) {
  if (product.price === null || product.currency === null) return '가격 확인 필요';
  const units = { VIRTUAL_FC: '가상 FC', FC: 'FC', KRW: '원', UC: 'UC', BP: 'BP' };
  return `${BigInt(product.price).toLocaleString('ko-KR')} ${units[product.currency]}`;
}
export function dateLabel(value: string | null) {
  return value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '확인 기록 없음';
}
export function sourceLabel(meta: Metadata) {
  return meta.dataType === 'MOCK' ? '개발용 데이터' : meta.dataType === 'REFERENCE' ? '참고 자료' : '공식 데이터';
}
export function verificationLabel(meta: Metadata) {
  return ({ VERIFIED: '검증 완료', NEEDS_VERIFICATION: '검증 필요', REJECTED: '검증 반려' })[meta.verificationStatus];
}

export function timestampLabel(value: string) { return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)); }
