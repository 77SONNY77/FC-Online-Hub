import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {parseArgs} from 'node:util';
import {setTimeout} from 'node:timers/promises';
import {runPriceSync} from '@/application/price-sync';
import {syncConfig} from '@/domain/collection/sync';
const {values}=parseArgs({options:{ticks:{type:'string',default:'48'}}});
const ticks=Number(values.ticks);if(!Number.isInteger(ticks)||ticks<1||ticks>48)throw Error('ticks must be 1–48');
const db=new PrismaClient(),stop=new AbortController();
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>stop.abort());
try{
 for(let tick=0;tick<ticks&&!stop.signal.aborted;tick++){
  // Independent central job: no page traffic, no separate budget, no bypass.
  const result=await runPriceSync(db,{intent:'bounded-worker'});
  console.log(JSON.stringify({at:new Date().toISOString(),tick:tick+1,ticks,result}));
  if('status' in result&&['COLLECTION_DISABLED','CIRCUIT_OPEN'].includes(String(result.status)))break;
  const study=await db.priceObservationStudy.findFirst({where:{active:true,nextEligibleAt:{gt:new Date()}},orderBy:{nextEligibleAt:'asc'},select:{nextEligibleAt:true}});
  const delay=Math.max(1000,Math.min(syncConfig().PRICE_SYNC_INTERVAL_MINUTES*60000,(study?.nextEligibleAt.getTime()??Infinity)-Date.now()));
  if(tick+1<ticks)try{await setTimeout(delay,undefined,{signal:stop.signal});}catch{break;}
 }
}finally{await db.$disconnect();}
