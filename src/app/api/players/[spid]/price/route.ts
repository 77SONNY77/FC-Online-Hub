import { playerService } from '@/application/players-instance';
import { playerQuery, playerResponse } from '@/infrastructure/db/player-http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ spid: string }> }) { return playerResponse(async () => { const data = await playerService.detail((await params).spid, playerQuery(request)); return { spid: data.spid, enhancement: data.selectedEnhancement, status: data.price ? 'AVAILABLE' : 'UNAVAILABLE', price: data.price }; }); }
