import { z } from 'zod';

export const idSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const sourceSchema = z.enum(['OFFICIAL_API', 'OFFICIAL_WEB', 'REFERENCE', 'MOCK']);
export const verificationSchema = z.enum(['VERIFIED', 'NEEDS_VERIFICATION', 'REJECTED']);
export const dataTypeSchema = z.enum(['OFFICIAL', 'REFERENCE', 'MOCK']);
const httpsUrl = z.string().url().refine(v => new URL(v).protocol === 'https:', 'HTTPS source required');
export const metadataSchema = z.object({
  datasetId: idSchema,
  datasetVersion: z.number().int().positive(),
  source: sourceSchema,
  sourceName: z.string().min(1),
  sourceUrl: httpsUrl.nullable(),
  sourceNotes: z.string().min(1),
  verificationStatus: verificationSchema,
  verified: z.boolean(),
  verifiedAt: z.string().datetime().nullable(),
  lastUpdatedAt: z.string().datetime(),
  dataType: dataTypeSchema,
}).superRefine((m, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if ((m.source === 'MOCK') !== (m.dataType === 'MOCK')) issue('Mock provenance mismatch');
  if ((m.source === 'REFERENCE') !== (m.dataType === 'REFERENCE')) issue('Reference provenance mismatch');
  if (m.verified !== (m.verificationStatus === 'VERIFIED')) issue('Verification flag mismatch');
  if (m.verified && (!m.verifiedAt || !m.sourceUrl || !m.source.startsWith('OFFICIAL_'))) issue('Official evidence required for verified data');
  if (!m.verified && m.verifiedAt !== null) issue('Unverified data cannot carry verifiedAt');
});
export type Metadata = z.infer<typeof metadataSchema>;
export const itemKindSchema = z.enum(['PLAYER_PACK', 'BOX', 'BP_CARD', 'EVENT_ITEM']);
export const compositionSchema = z.enum(['DOCUMENTED', 'UNKNOWN']);
export const rewardBehaviorSchema = z.enum(['UNKNOWN', 'FIXED', 'ALL', 'WEIGHTED_RANDOM', 'PLAYER_POOL']);
export const evidenceSchema = z.object({ id: idSchema, sourceUrl: httpsUrl, fetchedAt: z.string().datetime(), verifiedAt: z.string().datetime(), contentHash: z.string(), acquisition: z.string(), retrievalNote: z.string() });
export const fieldVerificationSchema = z.object({ name: verificationSchema, price: verificationSchema, currency: verificationSchema, salePeriod: verificationSchema, purchaseLimit: verificationSchema, components: verificationSchema });
export interface ComponentNode {
  id: string;
  name: string;
  kind: z.infer<typeof itemKindSchema>;
  description: string;
  quantity: number;
  compositionStatus: z.infer<typeof compositionSchema>;
  metadata: Metadata;
  children: ComponentNode[];
  rewardBehavior?: z.infer<typeof rewardBehaviorSchema>;
  conditionRaw?: string | null;
  probability?: { poolId: string; entryCount: number; verificationStatus: z.infer<typeof verificationSchema> } | null;
}
export const componentSchema: z.ZodType<ComponentNode> = z.lazy(() => z.object({
  id: idSchema, name: z.string().min(1), kind: itemKindSchema,
  description: z.string().min(1), quantity: z.number().int().min(1).max(100000),
  compositionStatus: compositionSchema, metadata: metadataSchema,
  children: z.array(componentSchema),
  rewardBehavior: rewardBehaviorSchema.optional(), conditionRaw: z.string().nullable().optional(),
  probability: z.object({ poolId: idSchema, entryCount: z.number().int().positive(), verificationStatus: verificationSchema }).nullable().optional(),
}));
export const productSchema = z.object({
  id: idSchema, versionId: idSchema, version: z.number().int().positive(),
  name: z.string().min(1), description: z.string().min(1),
  imagePath: z.string().refine(v => /^\/images\/[a-z0-9-]+\.svg$/.test(v) || /^https:\/\/fo4\.dn\.nexoncdn\.co\.kr\/live\/externalAssets\/shop\/items\/product\/\d+\.png$/.test(v), 'Unsupported image source').nullable(),
  price: z.string().regex(/^\d{1,30}$/).nullable(), currency: z.enum(['FC', 'KRW', 'UC', 'BP', 'VIRTUAL_FC']).nullable(),
  salePeriod: z.string().min(1).nullable(), purchaseLimit: z.string().min(1).nullable(),
  compositionStatus: compositionSchema,
  metadata: metadataSchema, components: z.array(componentSchema),
  simulationPolicy: z.object({ enabled: z.boolean(), maxPerReset: z.number().int().positive().nullable() }).optional(),
  fieldVerification: fieldVerificationSchema.optional(), evidence: evidenceSchema.optional(),
  saleStartsAt: z.string().datetime().nullable().optional(), saleEndsAt: z.string().datetime().nullable().optional(),
}).superRefine((p, ctx) => {
  if ((p.price === null) !== (p.currency === null)) ctx.addIssue({ code: 'custom', message: 'Price and currency must be supplied together' });
  const visit = (nodes: ComponentNode[], ancestors: Set<string>, depth: number) => {
    if (depth > 8) { ctx.addIssue({ code: 'custom', message: 'Composition exceeds supported depth' }); return; }
    for (const node of nodes) {
      if (node.metadata.dataType !== p.metadata.dataType) ctx.addIssue({ code: 'custom', message: 'Mixed data types in product' });
      if (ancestors.has(node.id)) { ctx.addIssue({ code: 'custom', message: 'Cyclic components' }); continue; }
      visit(node.children, new Set([...ancestors, node.id]), depth + 1);
    }
  };
  visit(p.components, new Set(), 1);
});
export type Product = z.infer<typeof productSchema>;
export const listResponseSchema = z.object({ data: z.array(productSchema), meta: z.object({ mode: dataTypeSchema, count: z.number().int().nonnegative() }) });
export const detailResponseSchema = z.object({ data: productSchema });
export const modeSchema = z.enum(['official', 'mock', 'reference']);
export type CatalogMode = z.infer<typeof modeSchema>;
export const modeToType = { official: 'OFFICIAL', mock: 'MOCK', reference: 'REFERENCE' } as const;
