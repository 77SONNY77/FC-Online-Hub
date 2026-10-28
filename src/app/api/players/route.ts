import { playerService } from '@/application/players-instance';
import { playerQuery, playerResponse } from '@/infrastructure/db/player-http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return playerResponse(() => playerService.list(playerQuery(request))); }
