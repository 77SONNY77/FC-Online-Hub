import type { ProbabilityView } from '@/contracts/rewards';
export interface RewardRepository { probabilities(itemVersionId: string, page: number): Promise<ProbabilityView | null> }
