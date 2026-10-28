import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {parseArgs} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {runPriceSync,priceSyncStatus} from '@/application/price-sync';
const {values,positionals}=parseArgs({allowPositionals:true,options:{'dry-run':{type:'boolean'},'max-segments':{type:'string',default:'20'},output:{type:'string'}}});
const db=new PrismaClient();
try{const result=positionals[0]==='status'?await priceSyncStatus(db):await runPriceSync(db,{intent:positionals[0]??'sync',dryRun:values['dry-run'],maxSegments:Number(values['max-segments'])});const text=JSON.stringify(result,null,2);if(values.output)await writeFile(values.output,text+'\n');console.log(text);}finally{await db.$disconnect();}
