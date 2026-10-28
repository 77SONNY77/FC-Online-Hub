import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {parseArgs} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {rankInventory,referencePlan,scheduleReference,finalizeReference,referenceStatus} from '@/application/reference-snapshots';
const {values,positionals}=parseArgs({allowPositionals:true,options:{pack:{type:'string',default:'official-pool-24987-v1'},date:{type:'string'},snapshot:{type:'string'},output:{type:'string'}}});
const db=new PrismaClient();
try{
 const action=positionals[0]??'status',date=values.date??new Date(Date.now()+9*3600000).toISOString().slice(0,10);
 let result:unknown;
 if(action==='inventory')result=await rankInventory(db);
 else if(action==='plan')result=await referencePlan(db,values.pack,date);
 else if(action==='schedule')result=await scheduleReference(db,values.pack,date);
 else if(action==='finalize'&&values.snapshot)result=await finalizeReference(db,values.snapshot);
 else if(action==='status')result=await referenceStatus(db,values.pack,values.date);
 else throw new Error('Use inventory, plan, schedule, status, finalize --snapshot; collection runs through prices:sync');
 const text=JSON.stringify(result,null,2);if(values.output)await writeFile(values.output,text+'\n');console.log(text);
}finally{await db.$disconnect();}
