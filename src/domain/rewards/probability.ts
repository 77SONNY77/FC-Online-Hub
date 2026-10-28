// Percent values use a fixed 18-place integer scale. No Number arithmetic on probabilities.
export const PERCENT_SCALE = 10n ** 18n;
export const DENOMINATOR = 100n * PERCENT_SCALE;
export type Behavior = 'FIXED' | 'ALL' | 'WEIGHTED_RANDOM' | 'PLAYER_POOL';
export function parseProbability(raw: string) {
  const match = /^(0|[1-9]\d{0,2})(?:\.(\d{1,18}))?%$/.exec(raw);
  if (!match) throw new Error('Unsupported probability format');
  const fraction = match[2] ?? '';
  const numerator = BigInt(match[1]) * PERCENT_SCALE + BigInt(fraction.padEnd(18, '0') || '0');
  if (numerator > DENOMINATOR) throw new Error('Invalid probability range');
  const displayedQuantum = 10n ** BigInt(18 - fraction.length);
  // Official tables pad to 16 places while some values carry 15 significant digits.
  // This is a validation tolerance, never an alteration of the published value.
  const digits = numerator.toString().length;
  const significantQuantum = 10n ** BigInt(Math.max(0, digits - 15));
  return { numerator, quantum: displayedQuantum > significantQuantum ? displayedQuantum : significantQuantum };
}
export function validateProbabilitySum(raw: string[], behavior: Behavior) {
  if (!raw.length) throw new Error('Missing rewards');
  const parsed = raw.map(parseProbability);
  const sum = parsed.reduce((s, p) => s + p.numerator, 0n);
  const quantum = parsed.reduce((s, p) => s + p.quantum, 0n);
  // At most 0.05 percentage points; coarse tables outside this cap require review.
  const tolerance = (quantum + 1n) / 2n < PERCENT_SCALE / 20n ? (quantum + 1n) / 2n : PERCENT_SCALE / 20n;
  if (behavior === 'ALL' || behavior === 'FIXED') {
    if (parsed.some(p => p.numerator !== DENOMINATOR) || (behavior === 'FIXED' && raw.length !== 1)) throw new Error('Invalid fixed/all probability');
  } else if ((sum > DENOMINATOR ? sum - DENOMINATOR : DENOMINATOR - sum) > tolerance) throw new Error('Probability sum outside rounding tolerance');
  return { sum, tolerance, denominator: DENOMINATOR };
}
