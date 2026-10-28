import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {afterAll,describe,it,expect,vi} from 'vitest';
import {CollectorSafety,safetyStatus} from '@/infrastructure/fconline-data-center/safety';
import {policySchema} from '@/domain/collection/policy';
const url=process.env.TEST_DATABASE_URL;if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('Dedicated test DB required');
const db=new PrismaClient({datasources:{db:{url}}}),ids:string[]=[],executions:string[]=[];
const policy=policySchema.parse({});
async function guard(p=policy){const id='TEST-'+randomUUID();ids.push(id);const g=new CollectorSafety(db,p,id,()=>true,async()=>{});await g.acquire('test-run','MANUAL');executions.push(g.executionId);return {g,id};}
afterAll(async()=>{await db.priceCollectorRequest.deleteMany({where:{sourceId:{in:ids}}});await db.priceCollectorExecution.deleteMany({where:{id:{in:executions}}});await db.priceCollectorState.deleteMany({where:{id:{in:ids}}});await db.$disconnect();});
describe('durable global collector controls',()=>{
 it('allows reservation 100 and prevents request 101 before network I/O',async()=>{const {g,id}=await guard({...policy,PRICE_COLLECTION_MAX_REQUESTS_PER_RUN:100});await db.priceCollectorRequest.createMany({data:Array.from({length:99},()=>({id:randomUUID(),sourceId:id,executionId:g.executionId,url:'TEST',requestedAt:new Date(Date.now()-2*3600000)}))});const network=vi.fn(async()=>new Response('ok'));const fetcher=g.fetcher(network);await fetcher('https://fconline.nexon.com/robots.txt');await expect(fetcher('https://fconline.nexon.com/robots.txt')).rejects.toThrow('REQUEST_BUDGET_EXHAUSTED');expect(network).toHaveBeenCalledTimes(1);await g.release();});
 it('persists hourly usage across separate executions and rejects a second active collector',async()=>{const p={...policy,PRICE_COLLECTION_MAX_REQUESTS_PER_HOUR:1};const {g,id}=await guard(p);const second=new CollectorSafety(db,p,id,()=>true,async()=>{});await expect(second.acquire('second','FULL_BUILD')).rejects.toThrow('COLLECTOR_ALREADY_ACTIVE');await g.fetcher(async()=>new Response('ok'))('https://fconline.nexon.com/robots.txt');await g.release();await second.acquire('second','FULL_BUILD');executions.push(second.executionId);const network=vi.fn(async()=>new Response('ok'));await expect(second.fetcher(network)('https://fconline.nexon.com/robots.txt')).rejects.toThrow('REQUEST_BUDGET_EXHAUSTED');expect(network).not.toHaveBeenCalled();await second.release();});
 it.each([403,429])('opens a persistent circuit immediately on HTTP %s',async status=>{const {g,id}=await guard();const network=vi.fn(async()=>new Response('blocked',{status}));const fetcher=g.fetcher(network);await fetcher('https://fconline.nexon.com/robots.txt');await expect(fetcher('https://fconline.nexon.com/robots.txt')).rejects.toThrow('CIRCUIT_OPEN');expect(network).toHaveBeenCalledTimes(1);await g.release();const other=new CollectorSafety(db,policy,id,()=>true,async()=>{});await expect(other.acquire('again','MANUAL')).rejects.toThrow('CIRCUIT_OPEN');});
 it('security HTML and repeated unexpected shells trip the breaker',async()=>{const a=await guard();await a.g.parsedFailure('SECURITY_PAGE');expect((await safetyStatus(db,policy,a.id)).circuit).toBe('OPEN');await a.g.release();const b=await guard();for(let i=0;i<3;i++)await b.g.parsedFailure('EMPTY_OR_CHANGED_RESPONSE');await expect(b.g.reserve('TEST')).rejects.toThrow('CIRCUIT_OPEN');await b.g.release();});
 it('repeated server errors stop at the configured threshold',async()=>{const {g}=await guard();const network=vi.fn(async()=>new Response('error',{status:503}));const f=g.fetcher(network);for(let i=0;i<3;i++)await f('https://fconline.nexon.com/robots.txt');await expect(f('https://fconline.nexon.com/robots.txt')).rejects.toThrow('CIRCUIT_OPEN');expect(network).toHaveBeenCalledTimes(3);await g.release();});
 it('persistent kill switch stops the next reservation',async()=>{const {g,id}=await guard();await db.priceCollectorState.update({where:{id},data:{enabled:false}});const network=vi.fn(async()=>new Response('ok'));await expect(g.fetcher(network)('https://fconline.nexon.com/robots.txt')).rejects.toThrow('COLLECTION_DISABLED');expect(network).not.toHaveBeenCalled();await g.release();});
});
it('enforces the operational five-second global interval across concurrent reservations',async()=>{
 const id='TEST-'+randomUUID();ids.push(id);
 const p=policySchema.parse({PRICE_COLLECTION_REQUEST_DELAY_MS:5000,PRICE_COLLECTION_MAX_CONCURRENCY:2,PRICE_COLLECTION_MAX_REQUESTS_PER_MINUTE:12,PRICE_COLLECTION_MAX_REQUESTS_PER_HOUR:720,PRICE_COLLECTION_MAX_REQUESTS_PER_DAY:5000,PRICE_COLLECTION_MAX_REQUESTS_PER_RUN:51});
 const g=new CollectorSafety(db,p,id,()=>true);await g.acquire('pacing-test','FULL_BUILD');executions.push(g.executionId);
 const starts:number[]=[];const fetcher=g.fetcher(async()=>{starts.push(Date.now());return new Response('ok');});
 await Promise.all([fetcher('https://fconline.nexon.com/robots.txt'),fetcher('https://fconline.nexon.com/robots.txt')]);
 expect(starts).toHaveLength(2);expect(starts[1]-starts[0]).toBeGreaterThanOrEqual(4980);await g.release();
},20000);
