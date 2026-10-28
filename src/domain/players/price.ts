import { z } from 'zod';
export const bpSchema = z.string().regex(/^[1-9]\d{0,29}$/);
export const spidSchema = z.string().regex(/^[1-9]\d{8}$/);
export const enhancementSchema = z.coerce.number().int().min(1).max(13);
export const priceCaptureSchema = z.object({
  sourceUrl: z.literal('https://fconline.nexon.com/datacenter'), observedAt: z.iso.datetime(),
  referenceAt: z.iso.datetime().nullable(), notes: z.string().min(1),
  rows: z.array(z.object({ spid: spidSchema, name: z.string().min(1), enhancement: enhancementSchema, price: bpSchema, ovr: z.number().int().min(1).max(250).nullable(), position: z.string().regex(/^[A-Z]{2,3}(\/[A-Z]{2,3})*$/).nullable() })).min(1).max(2600),
});
export function validatePrices(input: unknown) {
  const capture = priceCaptureSchema.parse(input);
  // Current Data Center does not supply an authoritative per-value reference timestamp.
  if (capture.referenceAt !== null) throw new Error('Data Center reference time is not verified');
  if (Date.parse(capture.observedAt) > Date.now() + 60000) throw new Error('Future observation');
  const keys = capture.rows.map(r => `${r.spid}-${r.enhancement}`);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate price variant');
  return capture;
}
export function priceFreshness(referenceAt: string | null, observedAt: string, now = Date.now()) {
  const observed = Date.parse(observedAt), reference = referenceAt ? Date.parse(referenceAt) : NaN;
  if (!Number.isFinite(reference) || !Number.isFinite(observed) || reference > observed || observed > now || reference > now) return 'UNKNOWN' as const;
  return now - reference <= 2 * 3600000 ? 'FRESH' as const : 'STALE' as const;
}
export const formatBP = (value: string) => `${BigInt(bpSchema.parse(value)).toLocaleString('ko-KR')} BP`;

export function observationFreshness(observedAt: string, now = Date.now(), freshHours = Number(process.env.PRICE_FRESH_HOURS ?? 24)) {
  const time = Date.parse(observedAt);
  if (!Number.isFinite(time) || time > now || !Number.isFinite(freshHours) || freshHours <= 0) return 'UNKNOWN' as const;
  return now - time <= freshHours * 3600000 ? 'FRESH' as const : 'STALE' as const;
}

export function observationStaleness(observedAt:string|null,now=Date.now(),freshHours=Number(process.env.PRICE_FRESH_HOURS??24),veryStaleHours=Number(process.env.PRICE_SYNC_VERY_STALE_HOURS??720)) {
 if(!observedAt||!Number.isFinite(Date.parse(observedAt))||Date.parse(observedAt)>now)return 'UNKNOWN' as const;
 const age=now-Date.parse(observedAt);
 return age<=freshHours*3600000?'FRESH' as const:age>Math.max(freshHours,veryStaleHours)*3600000?'VERY_STALE' as const:'STALE' as const;
}
