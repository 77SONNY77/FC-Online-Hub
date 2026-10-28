import {it,expect} from 'vitest';
import {continueFullBatch} from '@/application/full-coordinator';
import {verifiedLeaves} from '@/application/known-partitions';
import {segmentQuerySchema,segmentKey,splitSegment} from '@/domain/players/collection-plan';
const state={pending:20,enabled:true,circuit:'CLOSED',error:null,hour:700,day:3000,failures:0};
it('continues bounded batches after execution budget and isolated failure, stops on safety signals',()=>{
 expect(continueFullBatch(state)).toBeNull();expect(continueFullBatch({...state,error:'REQUEST_BUDGET_EXHAUSTED'})).toBeNull();
 expect(continueFullBatch({...state,error:'VALIDATION_OR_STORAGE_FAILURE',failures:1})).toBeNull();
 for(const error of ['HTTP_403','HTTP_429','SECURITY_PAGE','SOURCE_PAUSED'])expect(continueFullBatch({...state,error})).toBe(error);
 expect(continueFullBatch({...state,hour:0})).toBe('REQUEST_BUDGET_EXHAUSTED');expect(continueFullBatch({...state,pending:0})).toBe('PLAN_PROCESSED');
 expect(continueFullBatch({...state,failures:3})).toBe('REPEATED_FAILURE');
});
it('reuses only complete known leaf trees and rejects truncated or absent children',()=>{
 const root=segmentQuerySchema.parse({seasonId:300,subdivision:'LEGACY',ovrMin:0,ovrMax:200,selectedEnhancement:1,enhancements:[1,13],page:1,sort:'BASE_PRICE_DESC'});
 const children=splitSegment(root),rows=[{key:segmentKey(root),query:root,status:'SPLIT'},...children.map(query=>({key:segmentKey(query),query,status:'SUCCEEDED'}))];
 expect(verifiedLeaves([root],rows)).toEqual(children);
 expect(verifiedLeaves([root],rows.slice(0,-1))).toBeNull();rows[1].status='BLOCKED';expect(verifiedLeaves([root],rows)).toBeNull();
});
