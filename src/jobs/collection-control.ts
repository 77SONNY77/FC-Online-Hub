import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {collectionPolicy} from '@/domain/collection/policy';
import {dataCenterSource,safetyStatus} from '@/infrastructure/fconline-data-center/safety';
const db=new PrismaClient();
try{
 const action=process.argv[2]??'status';
 if(['disable','enable'].includes(action))await db.priceCollectorState.upsert({where:{id:dataCenterSource},create:{id:dataCenterSource,enabled:action==='enable'},update:{enabled:action==='enable'}});
 else if(action==='pause-until'){
  const pausedUntil=new Date(process.argv[3]),pauseReason=process.argv[4];
  if(!Number.isFinite(pausedUntil.getTime())||pausedUntil<=new Date()||!pauseReason)throw new Error('pause-until requires a future ISO timestamp and reason');
  await db.priceSyncState.upsert({where:{id:dataCenterSource},create:{id:dataCenterSource,pausedUntil,pauseReason},update:{pausedUntil,pauseReason}});
 }else if(action!=='status')throw new Error('Use status, disable, enable, pause-until <ISO> <reason>; enable never clears a circuit or maintenance pause');
 console.log(JSON.stringify({safety:await safetyStatus(db,collectionPolicy()),sync:await db.priceSyncState.findUnique({where:{id:dataCenterSource}})},null,2));
}finally{await db.$disconnect();}
