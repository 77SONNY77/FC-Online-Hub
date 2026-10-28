export const MAX_BALANCE = 1_000_000_000_000n;
export const LIFETIME_SECONDS = 30 * 24 * 60 * 60;
export class PlaygroundError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
export function fail(code: string, message: string, status = 409): never { throw new PlaygroundError(code, status, message); }
export function chargeBalance(balance: bigint, amount: bigint) {
  if (amount <= 0n) fail('OPTION_UNAVAILABLE', '충전 옵션을 확인해 주세요.');
  if (balance + amount > MAX_BALANCE) fail('BALANCE_LIMIT', '보유 가능한 가상 FC 한도에 도달했습니다.');
  return balance + amount;
}
export function purchaseCost(price: bigint, quantity: number, balance: bigint, bought: number, limit: number | null) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100 || price < 0n) fail('INVALID_INPUT', '구매 수량을 확인해 주세요.', 400);
  if (limit !== null && bought + quantity > limit) fail('PURCHASE_LIMIT', '이 상품의 체험 구매 한도를 초과했습니다.');
  const total = price * BigInt(quantity);
  if (total > balance) fail('INSUFFICIENT_FC', 'FC가 부족합니다. FC를 충전해 주세요.');
  return total;
}
