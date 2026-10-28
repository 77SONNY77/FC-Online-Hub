import { z } from 'zod';
const integer = (min: number, max: number, fallback: number) => z.coerce.number().int().min(min).max(max).default(fallback);
export const policySchema = z.object({
  PRICE_COLLECTION_ENABLED: z.enum(['true','false']).default('true'),
  PRICE_COLLECTION_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(6).default(1),
  PRICE_COLLECTION_REQUEST_DELAY_MS: integer(1000,60000,10000),
  PRICE_COLLECTION_MAX_REQUESTS_PER_MINUTE: integer(1,60,6),
  PRICE_COLLECTION_MAX_REQUESTS_PER_HOUR: integer(1,3600,60),
  PRICE_COLLECTION_MAX_REQUESTS_PER_DAY: integer(1,10000,120),
  PRICE_COLLECTION_MAX_REQUESTS_PER_RUN: integer(1,100,20),
  PRICE_COLLECTION_CIRCUIT_BREAKER_THRESHOLD: integer(1,5,3),
  PRICE_COLLECTION_CIRCUIT_COOLDOWN_HOURS: integer(1,168,24),
  PRICE_COLLECTION_HOT_HOURS: integer(2,168,6),
  PRICE_COLLECTION_WARM_CLASS_LIMIT: integer(0,10,2),
  PRICE_COLLECTION_WARM_HOURS: integer(24,720,48),
  PRICE_COLLECTION_COLD_HOURS: integer(168,8760,336),
});
export type CollectionPolicy = z.infer<typeof policySchema>;
export function collectionPolicy(env: NodeJS.ProcessEnv = process.env) { return policySchema.parse(env); }
export function budgetReason(count: { minute: number; hour: number; day: number; run: number }, policy: CollectionPolicy) {
  return count.run >= policy.PRICE_COLLECTION_MAX_REQUESTS_PER_RUN || count.minute >= policy.PRICE_COLLECTION_MAX_REQUESTS_PER_MINUTE || count.hour >= policy.PRICE_COLLECTION_MAX_REQUESTS_PER_HOUR || count.day >= policy.PRICE_COLLECTION_MAX_REQUESTS_PER_DAY ? 'REQUEST_BUDGET_EXHAUSTED' : null;
}
export const pauseCodes = ['SOURCE_PAUSED','REQUEST_BUDGET_EXHAUSTED','COLLECTION_DISABLED','CIRCUIT_OPEN','COLLECTION_WINDOW_CLOSED','REFERENCE_PRIORITY_WINDOW','SOURCE_MIN_REFRESH_INTERVAL'];
