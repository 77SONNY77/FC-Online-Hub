import { idSchema, modeSchema, modeToType, listResponseSchema, detailResponseSchema } from '@/contracts/catalog';
import type { CatalogRepository } from '@/domain/catalog/repository';
export class CatalogError extends Error {
  constructor(public code: 'INVALID_INPUT' | 'NOT_FOUND' | 'DATA_UNAVAILABLE', public status: number) { super(code); }
}
export function createCatalogService(repository: CatalogRepository) {
  return {
    async list(input: unknown) {
      const result = modeSchema.safeParse(input ?? 'mock');
      if (!result.success) throw new CatalogError('INVALID_INPUT', 400);
      try {
        const data = await repository.list(modeToType[result.data]);
        const response = listResponseSchema.parse({ data, meta: { mode: modeToType[result.data], count: data.length } });
        if (response.data.some(p => p.metadata.dataType !== response.meta.mode || p.metadata.verificationStatus === 'REJECTED')) throw new Error('Dataset isolation failure');
        return response;
      } catch { throw new CatalogError('DATA_UNAVAILABLE', 503); }
    },
    async find(input: unknown) {
      const id = idSchema.safeParse(input);
      if (!id.success) throw new CatalogError('INVALID_INPUT', 400);
      let result;
      try {
        const row = await repository.find(id.data);
        result = row ? detailResponseSchema.parse({ data: row }) : null;
        if (result?.data.metadata.verificationStatus === 'REJECTED') result = null;
      } catch { throw new CatalogError('DATA_UNAVAILABLE', 503); }
      if (!result) throw new CatalogError('NOT_FOUND', 404);
      return result;
    },
  };
}
