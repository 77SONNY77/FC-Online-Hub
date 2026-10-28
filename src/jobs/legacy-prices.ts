import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {parseArgs} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {legacyPricePlan,legacyScheduleCandidate} from '@/application/legacy-prices';
import {createCollectionRun,collectionStatus} from '@/application/price-collection';
import {safeCollect} from '@/application/safe-price-collection';
import {executionEfficiency} from '@/application/collection-efficiency';
const {values,positionals}=parseArgs({allowPositionals:true,options:{'dry-run':{type:'boolean'},resume:{type:'string'},status:{type:'string'},classes:{type:'string'},'min-ovr':{type:'string'},'active-pack':{type:'boolean'},'max-segments':{type:'string',default:'20'},output:{type:'string'}}});
const db=new PrismaClient();
try{
 let result:unknown;
 if(values.status)result=await collectionStatus(db,values.status);
 else{
  const plan=values.resume?null:await legacyPricePlan(db,{minOvr:Number(values['min-ovr']??(positionals[0]==='hot'?100:0)),classes:values.classes?.split(',').map(Number),activePack:values['active-pack']});
  if(values['dry-run'])result={dryRun:true,resume:values.resume,plan,schedule:legacyScheduleCandidate,initialQueries:plan?.segments.length,exactHttpCost:false};
  else{const run=values.resume?await db.priceCollectionRun.findUniqueOrThrow({where:{id:values.resume}}):await createCollectionRun(db,plan!);
   const collected=await safeCollect(db,run.id,Number(values['max-segments']),run.mode==='INCREMENTAL'?'INCREMENTAL_REFRESH':'FULL_RECONCILIATION');
   result={...collected,...('executionId' in collected&&collected.executionId?{metrics:await executionEfficiency(db,collected.executionId)}:{})};
  }
 }
 const text=JSON.stringify(result,null,2);if(values.output)await writeFile(values.output,text+'\n');console.log(text);
}finally{await db.$disconnect();}
