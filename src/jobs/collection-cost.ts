import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {collectionCost} from '@/application/collection-cost';
const {values,positionals}=parseArgs({allowPositionals:true,options:{output:{type:'string'}}});
const db=new PrismaClient();
try{const text=JSON.stringify(await collectionCost(db),null,2);const output=values.output??positionals[0];if(output)await writeFile(output,text+'\n');console.log(text);}finally{await db.$disconnect();}
