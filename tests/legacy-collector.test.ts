import {it,expect} from 'vitest';
import {segmentQuerySchema,splitSegment,segmentKey} from '@/domain/players/collection-plan';
import {requestBody} from '@/infrastructure/fconline-data-center/client';
import {legacyScheduleCandidate} from '@/application/legacy-prices';
const query=segmentQuerySchema.parse({seasonId:300,enhancements:[1,13],selectedEnhancement:1,ovrMin:60,ovrMax:64,page:1,sort:'BASE_PRICE_DESC',subdivision:'LEGACY'});
it('subdivides capped bands to each OVR, every position code, then non-overlapping height intervals',()=>{
 const ovr=splitSegment(query);expect(ovr.map(q=>q.ovrMin)).toEqual([60,61,62,63,64]);expect(ovr.every(q=>q.ovrMin===q.ovrMax)).toBe(true);
 const positions=splitSegment(ovr[0]);expect(positions.flatMap(q=>q.position!).sort((a,b)=>a-b)).toEqual(Array.from({length:28},(_,i)=>i));
 const heights=splitSegment(positions[0]);expect(heights.map(q=>q.height)).toEqual([[0,169],[170,174],[175,179],[180,184],[185,260]]);
 expect(splitSegment(heights[0])).toEqual([]);expect(new Set(heights.map(segmentKey)).size).toBe(5);
 const payload=new URLSearchParams(requestBody(heights[0]));expect(payload.get('strPosition')).toBe(',0,');expect(payload.get('n4HeightMax')).toBe('169');
});
it('does not install cron and specifies KST plus overlap behavior',()=>{
 expect(legacyScheduleCandidate).toMatchObject({timezone:'Asia/Seoul',hot:'0 */2 * * *',full:'30 4 * * *',installed:false});
 expect(legacyScheduleCandidate.overlap).toContain('Single source lock');
});
