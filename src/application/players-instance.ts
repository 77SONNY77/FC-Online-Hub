import 'server-only';
import { createPlayerService } from './players';
import { playerRepository } from '@/infrastructure/db/player-repository';
export const playerService = createPlayerService(playerRepository);
