import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {createObservationStudy,observationStatistics} from '@/application/price-observation';
const db=new PrismaClient();
try{const command=process.argv[2]??'status';if(!['create','status','stop'].includes(command))throw Error('create | status | stop');
 const result=command==='create'?await createObservationStudy(db):command==='stop'?await db.priceObservationStudy.updateMany({where:{active:true},data:{active:false}}):await observationStatistics(db);
 console.log(JSON.stringify(result,null,2));
}finally{await db.$disconnect();}
