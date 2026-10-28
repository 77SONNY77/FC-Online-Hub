import {describe,it,expect,vi} from 'vitest';
import {budgetReason,policySchema} from '@/domain/collection/policy';
import {priorityPolicy} from '@/application/incremental-prices';
vi.mock('server-only',()=>({}));
import {createPlayerRepository} from '@/infrastructure/db/player-repository';
import type {PrismaClient} from '@prisma/client';
const policy=policySchema.parse({});
describe('budget, priority and request isolation',()=>{
 it('hard stops the 101st reservation with a 100 execution budget',()=>{const p={...policy,PRICE_COLLECTION_MAX_REQUESTS_PER_RUN:100};expect(budgetReason({minute:0,hour:0,day:0,run:99},p)).toBeNull();expect(budgetReason({minute:0,hour:0,day:0,run:100},p)).toBe('REQUEST_BUDGET_EXHAUSTED');});
 it('checks rolling minute, hour and day limits independently',()=>{for(const count of [{minute:6,hour:6,day:6,run:0},{minute:0,hour:60,day:60,run:0},{minute:0,hour:0,day:120,run:0}])expect(budgetReason(count,policy)).toBe('REQUEST_BUDGET_EXHAUSTED');});
 it('orders pack candidates before observed high-value and cold classes',()=>{const now=Date.now(), base={seasonId:877,lastObserved:null,unchanged:false};const hot=priorityPolicy({...base,pack:true,warm:false},policy,now),warm=priorityPolicy({...base,pack:false,warm:true},policy,now),cold=priorityPolicy({...base,pack:false,warm:false},policy,now);expect(hot.priority>warm.priority&&warm.priority>cold.priority).toBe(true);expect(hot.refreshHours).toBe(6);});
 it('freshness skips repeats and unchanged cold segments back off',()=>{const now=Date.now(),input={seasonId:100,pack:false,warm:false,lastObserved:now-340*3600000,unchanged:false};expect(priorityPolicy(input,policy,now).due).toBe(true);expect(priorityPolicy({...input,unchanged:true},policy,now).due).toBe(false);expect(priorityPolicy({...input,pack:true,lastObserved:now},policy,now).due).toBe(false);});
 it('player reads and cache misses only call the DB, never external fetch',async()=>{const network=vi.fn(()=>{throw Error('No network allowed');});vi.stubGlobal('fetch',network);try{const db={playerDataset:{findFirst:async()=>null},player:{count:async()=>0,findMany:async()=>[],findUnique:async()=>null},season:{findMany:async()=>[]}} as unknown as PrismaClient;const repository=createPlayerRepository(db);await repository.list({q:'',page:1,enhancement:1});await repository.detail('100000041',1);await repository.history('100000041',1,1);expect(network).not.toHaveBeenCalled();}finally{vi.unstubAllGlobals();}});
});
