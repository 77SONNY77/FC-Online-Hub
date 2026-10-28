import {describe,it,expect} from 'vitest';
import {ageSummary,adaptiveScore,compareObservations,freshnessConfigSchema} from '@/domain/collection/freshness';
import {changedMetadataClasses} from '@/application/metadata-price-plan';
import {type CollectionPlan} from '@/domain/players/collection-plan';
import {selectSyncWork} from '@/domain/collection/sync';

describe('price infrastructure measurement and bounded fairness',()=>{
 it('counts unchanged/changed cycles without inventing source time',()=>{
  const start=new Date('2026-09-30T00:00:00Z'),previous=new Map([['p',{price:'500000000000',observedAt:start}]]);
  const outcomes=[];
  for(const [i,price] of ['500000000000','520000000000','520000000000','600000000000'].entries()){
   const at=new Date(start.getTime()+(i+1)*7200000),result=compareObservations([{id:'p',price,enhancement:8}],previous,at,2);
   outcomes.push(result.changed);expect(result.intervals['2'].checked).toBe(1);expect(result.freshened).toBe(1);
   expect(result.firstObservedChangedAt).toBe(result.changed?at.toISOString():null);
   previous.set('p',{price,observedAt:at});
  }
  expect(outcomes).toEqual([0,1,0,1]);
 });
 it('excludes new, missing and replayed values from the comparable denominator',()=>{
  const at=new Date(),old=new Map([['same',{price:'5',observedAt:at}],['missing',{price:'10',observedAt:at}]]);
  const result=compareObservations([{id:'new',price:'10',enhancement:1},{id:'same',price:'5',enhancement:1}],old,at,24);
  expect(result.comparable).toBe(0);expect(result.changeRate).toBeNull();expect(result.newPrices).toBe(1);expect(old.has('missing')).toBe(true);
 });
 it('measures magnitude without overflowing large BP values',()=>{
  const result=compareObservations([{id:'p',price:'520000000000000000000000000000',enhancement:13}],new Map([['p',{price:'500000000000000000000000000000',observedAt:new Date(0)}]]),new Date(7200000),24);
  expect(result.medianAbsoluteChangePercent).toBe(4);expect(result.largeChanges).toBe(0);
 });
 it('calculates age percentiles and disjoint freshness buckets',()=>{
  const result=ageSummary([0,1,2,3,4],2,4);expect(result.fresh).toBe(2);expect(result.stale).toBe(2);expect(result.veryStale).toBe(1);expect(result.medianHours).toBe(2);expect(result.p95Hours).toBe(3.8);
  expect(ageSummary([],2,4).medianHours).toBeNull();
 });
 it('ranks stale, frequently changing useful segments ahead of fresh low-change segments',()=>{
  const base={targetHours:6,variants:100,requests:1,importance:1};
  expect(adaptiveScore({...base,ageHours:12,changeRate:.8})).toBeGreaterThan(adaptiveScore({...base,ageHours:1,changeRate:0}));
  expect(adaptiveScore({...base,ageHours:12,changeRate:.8,requests:2})).toBe(180);
 });
 it('bounds bootstrap and refresh starvation while reference remains first',()=>{
  const due={reference:false,hot:true,bootstrap:true,incremental:true,reconcile:false};
  expect(selectSyncWork({...due,recentTypes:['HOT_SYNC','INCREMENTAL']})).toBe('BOOTSTRAP');
  expect(selectSyncWork({...due,hot:false,recentTypes:['BOOTSTRAP','BOOTSTRAP']})).toBe('INCREMENTAL');
  expect(selectSyncWork({...due,reference:true,recentTypes:['HOT_SYNC','HOT_SYNC']})).toBe('REFERENCE_SNAPSHOT');
  expect(selectSyncWork({reference:false,hot:false,bootstrap:false,incremental:false,reconcile:false})).toBe('IDLE');
 });
 it('detects new players and classes without treating retained history as deletion',()=>{
  const before={expectedPlayers:[{spid:'100000001',name:'A',seasonId:100}]} as CollectionPlan;
  const after={expectedPlayers:[...before.expectedPlayers,{spid:'100000002',name:'B',seasonId:100},{spid:'101000001',name:'C',seasonId:101}]} as CollectionPlan;
  expect(changedMetadataClasses(before,after)).toEqual([100,101]);
 });
 it('rejects refresh intervals shorter than the conservative source floor',()=>{
  expect(freshnessConfigSchema.safeParse({PRICE_MIN_REFRESH_INTERVAL_HOURS:1}).success).toBe(false);
  expect(freshnessConfigSchema.parse({}).PRICE_MIN_REFRESH_INTERVAL_HOURS).toBe(2);
 });
});
