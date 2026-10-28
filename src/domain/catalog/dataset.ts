import { z } from 'zod';
import { idSchema, itemKindSchema, compositionSchema, metadataSchema, productSchema } from '@/contracts/catalog';

const edge = z.object({ itemVersionId: idSchema, quantity: z.number().int().min(1).max(100000) });
export const datasetSchema = z.object({
  sourceId: idSchema,
  metadata: metadataSchema,
  items: z.array(z.object({
    id: idSchema, itemId: idSchema, version: z.number().int().positive(), name: z.string().min(1),
    kind: itemKindSchema, description: z.string().min(1), compositionStatus: compositionSchema,
    children: z.array(edge),
  })),
  products: z.array(z.object({ ...productSchema.shape, metadata: z.undefined().optional(), components: z.array(edge) }).omit({ metadata: true })),
});
export type CatalogDataset = z.infer<typeof datasetSchema>;

/** Validate before any database write, including graph references and cycles. */
export function validateDataset(input: unknown): CatalogDataset {
  const data = datasetSchema.parse(input);
  const items = new Map(data.items.map(i => [i.id, i]));
  if (items.size !== data.items.length || new Set(data.products.map(p => p.id)).size !== data.products.length) throw new Error('Duplicate catalog identifiers');
  const visit = (id: string, path: string[], depth: number) => {
    if (depth > 8) throw new Error('Component depth limit exceeded');
    if (path.includes(id)) throw new Error('Cyclic item composition');
    const item = items.get(id);
    if (!item) throw new Error('Unknown item reference');
    for (const child of item.children) visit(child.itemVersionId, [...path, id], depth + 1);
  };
  for (const item of data.items) visit(item.id, [], 1);
  for (const product of data.products) {
    if ((product.price === null) !== (product.currency === null)) throw new Error('Price and currency must be supplied together');
    for (const component of product.components) visit(component.itemVersionId, [], 1);
  }
  return data;
}
