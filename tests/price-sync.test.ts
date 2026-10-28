import {describe,it,expect} from 'vitest';
import {historyDecision,selectSyncWork,syncConfigSchema} from '@/domain/collection/sync';
describe('continuous sync policy',()=>{
 it('prioritizes reference, HOT, bootstrap and then reconciliation',()=>{
  const due={reference:true,hot:true,bootstrap:true,incremental:true,reconcile:true};
  expect(selectSyncWork(due)).toBe('REFERENCE_SNAPSHOT');due.reference=false;
  expect(selectSyncWork(due)).toBe('HOT_SYNC');due.hot=false;
  expect(selectSyncWork(due)).toBe('BOOTSTRAP');due.bootstrap=false;
  expect(selectSyncWork(due)).toBe('FULL_RECONCILIATION');due.reconcile=false;
  expect(selectSyncWork(due)).toBe('INCREMENTAL');due.incremental=false;
  expect(selectSyncWork(due)).toBe('IDLE');
 });
 it('preserves changes, suppresses duplicates, keeps heartbeat and reference observations',()=>{
  const at=new Date('2026-09-20T00:00:00Z'),old={price:'500000000000',historyAt:at};
  expect(historyDecision(null,old.price,at,24)).toEqual({classification:'NEW',reason:'INITIAL'});
  expect(historyDecision(old,'520000000000',at,24)).toEqual({classification:'CHANGED',reason:'PRICE_CHANGE'});
  expect(historyDecision(old,old.price,new Date(at.getTime()+7200000),24).reason).toBeNull();
  expect(historyDecision(old,old.price,new Date(at.getTime()+86400000),24).reason).toBe('HEARTBEAT');
  expect(historyDecision(old,old.price,at,24,true).reason).toBe('REFERENCE_SNAPSHOT');
 });
 it('validates operator schedules independently from source cadence',()=>{
  expect(syncConfigSchema.parse({}).PRICE_FULL_RECONCILIATION_DAYS).toBe(120);
  expect(syncConfigSchema.safeParse({PRICE_SYNC_INTERVAL_MINUTES:0}).success).toBe(false);
 });
});
