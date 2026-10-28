import { z } from 'zod';
import { idSchema, itemKindSchema, metadataSchema } from './catalog';
const epoch = z.number().int().nonnegative();
const base = { epoch };
export const chargeInput = z.object({ ...base, chargeOptionId: idSchema }).strict();
export const purchaseInput = z.object({ ...base, productId: idSchema, quantity: z.number().int().min(1).max(100) }).strict();
export const resetInput = z.object(base).strict();
export const requestKey = z.string().uuid();
const money = z.string().regex(/^\d+$/);
export const stateSchema = z.object({
  balance: money, epoch, revision: epoch, dataType: z.literal('MOCK'),
  purchased: z.record(z.string(), z.number().int().nonnegative()),
});
export type PlaygroundState = z.infer<typeof stateSchema>;
export const receiptSchema = z.object({ kind: z.enum(['CHARGE', 'PURCHASE', 'RESET']), amount: money, quantity: z.number().int().optional() });
export const mutationResponse = z.object({ state: stateSchema, receipt: receiptSchema, replayed: z.boolean() });
export const chargeOptionSchema = z.object({ id: idSchema, fcAmount: money, bonusFc: money, totalFc: money, metadata: metadataSchema });
export const chargeOptionsResponse = z.object({ data: z.array(chargeOptionSchema) });
export type ChargeOption = z.infer<typeof chargeOptionSchema>;
export const inventorySchema = z.object({
  state: stateSchema,
  items: z.array(z.object({ id: z.string(), itemVersionId: idSchema, name: z.string(), kind: itemKindSchema, quantity: z.number().int().positive(), dataType: z.enum(['MOCK', 'OFFICIAL']), acquiredAt: z.string().datetime(), productName: z.string(), productId: idSchema })),
});
export type Inventory = z.infer<typeof inventorySchema>;
