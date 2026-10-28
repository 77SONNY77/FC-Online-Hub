import { z } from 'zod';
import { idSchema, itemKindSchema, metadataSchema, evidenceSchema, rewardBehaviorSchema, verificationSchema } from './catalog';
const resolutionSchema = z.object({ status: z.enum(['RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED', 'NEEDS_VERIFICATION']), reason: z.string(), player: z.object({ seasonName: z.string().optional(), spid: z.string(), name: z.string(), enhancement: z.number().int(), price: z.string(), referenceAt: z.iso.datetime(), observedAt: z.iso.datetime(), sourceUrl: z.string().url(), snapshotId: z.string() }).nullable() });
const integer = z.string().regex(/^\d+$/);
export const probabilityViewSchema = z.object({
  item: z.object({ id: idSchema, name: z.string().min(1), kind: itemKindSchema, metadata: metadataSchema }),
  pool: z.object({ id: idSchema, version: z.number().int().positive(), behavior: rewardBehaviorSchema, conditionRaw: z.string(), effectivePeriod: z.string().min(1), verificationStatus: verificationSchema, denominator: integer, sumNumerator: integer, toleranceNumerator: integer, evidence: evidenceSchema, resolutionStatus: z.enum(['RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED', 'NEEDS_VERIFICATION']).optional(), resolutionDate: z.string().optional() }),
  entries: z.array(z.object({ id: idSchema, rewardLabel: z.string().min(1), quantity: z.number().int().positive(), probabilityRaw: z.string().min(1), numerator: integer, conditionRaw: z.string(), targetType: z.enum(['PRICE_RANK', 'NESTED_ITEM', 'BP_AMOUNT']), rank: z.number().int().positive().nullable(), bpAmount: integer.nullable(), targetItemVersionId: idSchema.nullable(), resolution: resolutionSchema.optional() })),
  pagination: z.object({ page: z.number().int().positive(), pageSize: z.literal(50), total: z.number().int().positive(), pages: z.number().int().positive() }),
});
export type ProbabilityView = z.infer<typeof probabilityViewSchema>;
