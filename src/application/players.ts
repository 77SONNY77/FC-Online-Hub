import { playerDetailSchema, playerHistorySchema, playerListSchema, playerQuerySchema } from '@/contracts/players';
import { spidSchema } from '@/domain/players/price';
import { CatalogError } from './catalog';
export interface PlayerRepository { list(query: { q: string; season?: number; page: number; enhancement: number }): Promise<unknown>; detail(spid: string, enhancement: number): Promise<unknown>; history(spid: string, enhancement: number, page: number): Promise<unknown> }
export function createPlayerService(repository: PlayerRepository) {
  const query = (input: unknown) => { const result = playerQuerySchema.safeParse(input); if (!result.success) throw new CatalogError('INVALID_INPUT', 400); return result.data; };
  const id = (input: unknown) => { const result = spidSchema.safeParse(input); if (!result.success) throw new CatalogError('INVALID_INPUT', 400); return result.data; };
  async function read<T>(fn: () => Promise<T>) { try { return await fn(); } catch (e) { if (e instanceof CatalogError) throw e; throw new CatalogError('DATA_UNAVAILABLE', 503); } }
  return {
    async list(input: unknown) { const q = query(input); return read(async () => playerListSchema.parse(await repository.list(q))); },
    async detail(spid: unknown, input: unknown = {}) { const s = id(spid), q = query(input); return read(async () => { const result = await repository.detail(s, q.enhancement); if (!result) throw new CatalogError('NOT_FOUND', 404); return playerDetailSchema.parse(result); }); },
    async history(spid: unknown, input: unknown = {}) { const s = id(spid), q = query(input); return read(async () => { const result = await repository.history(s, q.enhancement, q.page); if (!result) throw new CatalogError('NOT_FOUND', 404); return playerHistorySchema.parse(result); }); },
  };
}
