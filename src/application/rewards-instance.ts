import 'server-only';
import { createRewardService } from './rewards';
import { rewardRepository } from '@/infrastructure/db/reward-repository';
export const rewardService = createRewardService(rewardRepository);
