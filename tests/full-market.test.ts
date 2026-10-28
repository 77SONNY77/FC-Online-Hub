import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auditFullPlan } from '@/application/full-market';
import { collectionPlanSchema } from '@/domain/players/collection-plan';
import { observationFreshness } from '@/domain/players/price';
import { parsePlayerList } from '@/infrastructure/fconline-data-center/parser';
const enhancements = Array.from({length:14},(_,i)=>i);
const classes = Array.from({length:153},(_,i)=>100+i);
const plan = collectionPlanSchema.parse({version:1,mode:'FULL',targetPoolId:null,targetName:'TEST',top:null,metadataDatasetId:'TEST',expectedPlayers:[],enhancements,unsupportedConditions:[],createdAt:new Date().toISOString(),segments:classes.map(seasonId=>({key:String(seasonId),expectedCount:0,query:{seasonId,enhancements,selectedEnhancement:1,ovrMin:0,ovrMax:200,page:1,sort:'BASE_PRICE_DESC'}}))});
describe('full market planning and observations',()=>{
  it('covers all 153 supplied official class IDs, rejecting missing/duplicate coverage',()=>{
    expect(auditFullPlan(plan,classes).classes).toBe(153);
    const missing=structuredClone(plan);missing.segments.pop();expect(()=>auditFullPlan(missing,classes)).toThrow();
    const duplicate=structuredClone(plan);duplicate.segments[1]=duplicate.segments[0];expect(()=>auditFullPlan(duplicate,classes)).toThrow();
  });
  it('rejects missing enhancement or range coverage',()=>{const p=structuredClone(plan);p.segments[0].query.enhancements=[1];expect(()=>auditFullPlan(p,classes)).toThrow();});
  it('recognizes only verified empty response markup in market mode',()=>{
    const html=readFileSync('tests/fixtures/datacenter/empty.html','utf8');const q=plan.segments[0].query;
    expect(parsePlayerList(html,q,true).retrievedCount).toBe(0);
    expect(()=>parsePlayerList('<div>검색 결과가 없습니다.</div>',q,true)).toThrow();
  });
  it('records displayed dash as unavailable, never a zero-priced variant',()=>{
    const html=readFileSync('tests/fixtures/datacenter/uc-two-players.html','utf8');
    const result=parsePlayerList(html,{seasonId:877,enhancements,selectedEnhancement:1},true);
    expect(result.rows.length).toBe(26);expect(result.missing).toHaveLength(2);expect(result.missing.every(m=>m.enhancement===0&&m.reason==='NOT_AVAILABLE')).toBe(true);
    expect(()=>parsePlayerList(html.replace('title="1,260,000,000"','title="0"'),{seasonId:877,enhancements,selectedEnhancement:1},true)).toThrow();
  });
  it('observation freshness is configurable and independent of reference time',()=>{const now=Date.parse('2026-09-21T01:00:00Z');expect(observationFreshness('2026-09-20T23:00:00Z',now,24)).toBe('FRESH');expect(observationFreshness('2026-09-20T23:00:00Z',now,1)).toBe('STALE');expect(observationFreshness('bad',now)).toBe('UNKNOWN');});
});
