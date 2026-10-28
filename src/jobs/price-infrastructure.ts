import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {parseArgs} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {priceInfrastructure} from '@/application/price-infrastructure';
const {values}=parseArgs({options:{output:{type:'string'}}}),db=new PrismaClient();
try{const result=JSON.stringify(await priceInfrastructure(db),null,2);if(values.output)await writeFile(values.output,result+'\n');console.log(result);}finally{await db.$disconnect();}
