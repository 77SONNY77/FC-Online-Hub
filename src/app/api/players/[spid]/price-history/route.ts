import { playerService } from '@/application/players-instance';
import { playerQuery, playerResponse } from '@/infrastructure/db/player-http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ spid: string }> }) { return playerResponse(async () => playerService.history((await params).spid, playerQuery(request))); }
