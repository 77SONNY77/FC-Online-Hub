import type {PrismaClient} from '@prisma/client';
import {collectionPlanSchema,segmentQuerySchema,segmentKey,splitSegment,type SegmentQuery} from '@/domain/players/collection-plan';
export function verifiedLeaves(roots:SegmentQuery[],segments:{key:string;status:string;query:unknown}[]){
 const sorted=[...roots].sort((a,b)=>a.ovrMin-b.ovrMin);let edge=0;
 for(const q of sorted){if(q.position||q.height||q.ovrMin!==edge)return null;edge=q.ovrMax+1;}if(edge!==201)return null;
 const byKey=new Map(segments.map(s=>[s.key,s]));const leaves:SegmentQuery[]=[];
 function visit(q:SegmentQuery):boolean{const s=byKey.get(segmentKey(q));if(!s)return false;if(s.status==='SUCCEEDED'){leaves.push(segmentQuerySchema.parse(s.query));return true;}if(s.status!=='SPLIT')return false;const children=splitSegment(q);return children.length>0&&children.every(visit);}
 return roots.every(visit)?leaves:null;
}
export async function knownPartitions(db:PrismaClient){
 const dataset=await db.playerDataset.findFirstOrThrow({orderBy:{observedAt:'desc'}});
 const runs=await db.priceCollectionRun.findMany({where:{mode:{in:['FULL','RECONCILIATION']}},orderBy:{createdAt:'desc'},include:{segments:{select:{key:true,status:true,query:true}}}});
 const result=new Map<number,{runId:string;queries:SegmentQuery[]}>();
 for(const run of runs){const p=collectionPlanSchema.parse(run.plan);if(p.metadataDatasetId!==dataset.id)continue;for(const season of new Set(p.segments.map(s=>s.query.seasonId))){if(result.has(season))continue;const leaves=verifiedLeaves(p.segments.filter(s=>s.query.seasonId===season).map(s=>s.query),run.segments);if(leaves)result.set(season,{runId:run.id,queries:leaves});}}
 return result;
}
