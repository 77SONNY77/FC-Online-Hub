import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {parseArgs} from 'node:util';
import {writeFile,mkdir} from 'node:fs/promises';
import {coordinateFull} from '@/application/full-coordinator';
import {legacyPricePlan} from '@/application/legacy-prices';
import {createCollectionRun} from '@/application/price-collection';
const {values}=parseArgs({options:{resume:{type:'string'},batches:{type:'string',default:'1'},'batch-size':{type:'string',default:'20'},output:{type:'string',default:'.local/phase47s'}}});
const db=new PrismaClient();let stopped=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;});
try{
 await mkdir(values.output!,{recursive:true});
 const run=values.resume?await db.priceCollectionRun.findUniqueOrThrow({where:{id:values.resume}}):await createCollectionRun(db,await legacyPricePlan(db));
 await writeFile(`${values.output}/run-id.txt`,run.id+'\n');console.log(JSON.stringify({event:'START',runId:run.id,pid:process.pid,at:new Date()}));
 const result=await coordinateFull(db,run.id,{batches:Number(values.batches),batchSize:Number(values['batch-size']),stop:()=>stopped,onProgress:async value=>{await writeFile(`${values.output}/progress.json`,JSON.stringify(value,null,2));const v=value as {batch:number;elapsedSeconds:number;etaSeconds:number;progress:{playersWithPrice:number;pendingSegments:number;completedSegments:number;failedSegments:number}};console.log(JSON.stringify({event:'BATCH',batch:v.batch,elapsedSeconds:v.elapsedSeconds,etaSeconds:v.etaSeconds,players:v.progress.playersWithPrice,complete:v.progress.completedSegments,pending:v.progress.pendingSegments,failed:v.progress.failedSegments}));}});
 await writeFile(`${values.output}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({event:'STOP',runId:run.id,stopReason:result.stopReason}));
 await promisify(execFile)(process.execPath,['--import','tsx','src/jobs/full-market-audit.ts','--run',run.id,'--output',values.output!],{timeout:120000,maxBuffer:1048576});
}catch(e){console.error(e);process.exitCode=1;}finally{await db.$disconnect();}
