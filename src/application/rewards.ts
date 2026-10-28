import { z } from 'zod';
import { idSchema } from '@/contracts/catalog';
import { probabilityViewSchema } from '@/contracts/rewards';
import { CatalogError } from './catalog';
import type { RewardRepository } from '@/domain/rewards/repository';
export function createRewardService(repository: RewardRepository) {
  return { async probabilities(idInput: unknown, pageInput: unknown = '1') {
    const id = idSchema.safeParse(idInput);
    const page = z.coerce.number().int().min(1).max(100000).safeParse(pageInput);
    if (!id.success || !page.success) throw new CatalogError('INVALID_INPUT', 400);
    let result;
    try { const raw = await repository.probabilities(id.data, page.data); result = raw ? probabilityViewSchema.parse(raw) : null; }
    catch { throw new CatalogError('DATA_UNAVAILABLE', 503); }
    if (!result || result.pool.verificationStatus === 'REJECTED' || result.item.metadata.verificationStatus === 'REJECTED' || page.data > result.pagination.pages) throw new CatalogError('NOT_FOUND', 404);
    return result;
  } };
}
