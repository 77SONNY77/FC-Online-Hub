import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { collectionPolicy } from '@/domain/collection/policy';
import { planIncremental } from '@/application/incremental-prices';
import { createCollectionRun } from '@/application/price-collection';
import { safeCollect } from '@/application/safe-price-collection';
import { fullMarketStatus } from '@/application/full-market';
const {values,positionals}=parseArgs({allowPositionals:true,options:{resume:{type:'string'},output:{type:'string'},'max-segments':{type:'string',default:'20'}}});
const db=new PrismaClient();
try{
 const action=positionals[0];if(!['plan','collect'].includes(action))throw new Error('Use plan or collect');
 const planned=values.resume?null:await planIncremental(db,collectionPolicy());let result:unknown;
 if(action==='plan')result=planned?.summary;
 else if(planned&&!planned.plan)result={status:'SKIP_FRESH',...planned.summary};
 else{const id=values.resume??(await createCollectionRun(db,planned!.plan!)).id;const run=await db.priceCollectionRun.findUniqueOrThrow({where:{id}});if(run.mode!=='INCREMENTAL')throw new Error('Requires INCREMENTAL run');const execution=await safeCollect(db,id,Number(values['max-segments']),'INCREMENTAL_REFRESH');result={execution,market:await fullMarketStatus(db,id)};}
 const text=JSON.stringify(result,null,2);if(values.output)await writeFile(values.output,text+'\n');console.log(text);
}finally{await db.$disconnect();}
