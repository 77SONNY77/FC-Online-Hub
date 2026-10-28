import { z } from 'zod';
import { createHash } from 'node:crypto';
export const metadataUrl = 'https://open.api.nexon.com/static/fconline/meta/spid.json';
export const seasonsUrl = 'https://open.api.nexon.com/static/fconline/meta/seasonid.json';
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const seasonSchema = z.object({ seasonId: z.number().int().min(100).max(999), className: z.string().trim().min(1), seasonImg: z.string().url().refine(s => new URL(s).hostname === 'ssl.nexon.com' && new URL(s).protocol === 'https:') });
const playerSchema = z.object({ id: z.number().int().min(100000000).max(999999999), name: z.string().trim().min(1) });
export function validateMetadata(playersRaw: string, seasonsRaw: string) {
  const seasons = z.array(seasonSchema).min(1).parse(JSON.parse(seasonsRaw));
  const players = z.array(playerSchema).min(1).parse(JSON.parse(playersRaw));
  const seasonIds = new Set(seasons.map(s => s.seasonId));
  if (seasonIds.size !== seasons.length) throw new Error('Duplicate season');
  const ids = new Set<number>();
  const mapped = players.map(p => {
    if (ids.has(p.id)) throw new Error('Duplicate SPID'); ids.add(p.id);
    // Official metadata YAML explicitly defines 3-digit season + 6-digit pid.
    const spid = String(p.id), seasonId = Number(spid.slice(0, 3));
    if (!seasonIds.has(seasonId)) throw new Error('Invalid season mapping');
    return { spid, pid: spid.slice(3), name: p.name, seasonId, imageUrl: `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p${spid}.png` };
  });
  return { players: mapped, seasons, contentHash: hash(playersRaw + '\n' + seasonsRaw) };
}
