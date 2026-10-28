# PHASE 4.7S FULL MARKET DATABASE COMPLETION REPORT

## 1. Status

**PARTIAL — 실제 Full run 진행 중인 checkpoint 보고서.** 기준 시각 2026-10-05T06:06:46.936Z. 전체 완료로 선언하지 않는다. PID 존재와 신규 ledger/Current 증가를 확인한 시점만 실행 중이라고 기록한다.

## 2. Starting Coverage

Metadata88,359. Priced7,190 (8.14%), Current93,470, History110,635. 관측 선수7,191, unobserved81,168. 과거 Legacy DB를 새 DB에 복사하거나 fixture 가격을 주입하지 않았다.

## 3. Final Coverage

보고 시점의 중간 값: Metadata **88,359**, 글로벌 관측 **13,845**, 가격 보유 **13,715 (15.52%)**, 글로벌 미관측 **74,514**, Current **178,295**. 이 run에서 관측 8,093, 양수 가격 없음 129. 글로벌 누적 coverage와 현재 run coverage를 구분한다.

## 4. Full Crawl Execution

Run ID `cmuths4lq0000tyq2oq58xak6`. 시작 2026-10-04T07:21:06.820Z, 전체 finished 없음. 상태 RUNNING. 누적 wall elapsed 22.76시간에는 크레딧 중단·기기 정지·재개 대기가 포함된다. 작업 process 정보: `{'pid': 73561, 'supervisorPid': 73559, 'runId': 'cmuths4lq0000tyq2oq58xak6', 'stopAt': '2026-10-05T15:55:00+09:00'}`. Supervisor: `{'at': '2026-10-05T06:02:05.971499+00:00', 'pid': 73559, 'runId': 'cmuths4lq0000tyq2oq58xak6', 'iterations': 1, 'status': 'RUNNING', 'stopAt': '2026-10-05T15:55:00+09:00'}`. 같은 immutable run을 사용한다.

## 5. Actual HTTP

Total 155, POST 150, robots 5, recorded transport retries 0. 오류 ledger []. 이전 Phase 요청은 포함하지 않는다.

## 6. Actual Throughput

실제 실행 시간 합계 779.3초, active 11.93 HTTP/min. 현재 처리율의 remaining active ETA 2.27시간(향후 cap 추가 및 cron 대기 제외). 전체 wall time 기준 0.11 HTTP/min, 5.93 players/min, 75.81 variants/min. 중단 시간을 포함하므로 live pacing과 다르다. `.local/phase47s/progress.json`의 최근 batchSeconds·완료 segment 수로 active ETA를 계속 갱신한다. 새로운 cap 자식은 ETA를 늘릴 수 있다.

## 7. Pacing Configuration

이번 Full profile: workers2, 전역5,000ms,12/min,720/hour,5,000/rolling24h,51/execution. batch50, coordinator100 batches 상한. 기본 환경 설정을 무제한으로 바꾸지 않았다. 모든 실제 요청·retry·robots는 같은 ledger와 예산을 통과한다.

## 8. Pacing Validation

10초: Phase4.7R 실측. 5초: 최초13 HTTP/12 POST, 실패0, 최소시작간격5.004초; 현재 run 최소 간격 5003ms. 2초/1초는 실행하지 않았다. 5초에서 실제 구축을 진행하며 차단 한계를 찾는 테스트를 하지 않았다.

## 9. Safety

HTTP 오류: []. 403/429/security 시 신규 요청 중단,5xx/timeout bounded retry/circuit 유지. 성공 표본은 Nexon 허용률 증명이 아니다. Source lock은 각 batch 전체, scheduler lease는 coordinator 전체를 보호한다. 웹 요청은 DB만 읽는다.

## 10. Classes

이 Full run에서 complete 87/153, incomplete 66. blocked/failed class는 audit의 unresolvedSegments로 별도 식별한다. 과거 완료 class와 합친 known manifest class는 116개이며 현재 run 완료 수와 다르다.

## 11. Segments

SUCCEEDED 150, SPLIT 0, PENDING/RUNNING 1571, FAILED/BLOCKED 0. segment coverage와 metadata 가격 coverage는 별개다.

## 12. Result Cap

Cap parents 0; terminal unresolved 0. 마지막 height에서도200이면 그 segment만 BLOCKED, 다른 구간은 계속 수집한다. 해당 응답을 부분 성공으로 Current에 저장하지 않는다. 영향을 받는 class/query는 evidence audit에 남긴다.

## 13. Price Coverage

글로벌 priced 13,715; Current valid variants 178,295. 이 run의 valid variants 103,532, 양수 강화(+1~13) missing observation 1677. +0의 정상 미제공 표시를 +1~13 missing과 섞지 않는다.

## 14. Current + History

Current 178,295, History 213,717. 이 run observation counts: {'newPrices': 84825, 'changed': 15457, 'unchanged': 3250}, positive-level MISSING 1677. segment overlap이면 합계 observation 수는 unique 수와 다를 수 있다. NEW/PRICE_CHANGE/heartbeat 저장, UNCHANGED 관측시각 갱신, MISSING 기존 Current 유지. 0 BP 저장 금지, 오래된 응답의 역전 덮어쓰기 금지.

## 15. Dense Classes

Class→OVR→Position→Height 분할을 실제 run에서 사용한다. 현재 snapshot의 class별 requests/segments 및 미해결 query는 audit에 보존한다. 아직 완료되지 않은 dense class의 discovery 비용을 확정하지 않는다.

## 16. Discovery Full Cost

현재까지 155 HTTP. 전체 actual 비용·완료 시간은 아직 UNKNOWN. 기존 약1,721 root plan 이후 cap 하위 구간이 추가될 수 있다. 이번 Phase는 계획만 생성한 상태가 아니라 실제 영속 run을 실행 중이다.

## 17. Known-Partition Full Refresh Cost

검증된 subset **116 classes / 204 leaf POST**. 전체 market complete=False. 전체 refresh exact HTTP는 아직 UNKNOWN. [known-partitions.json](evidence/phase-4.7s/known-partitions.json)에 source run과 query를 저장한다. 완성된 tree의 leaf만 재사용하며 cap 부모를 재요청하지 않는다.

## 18. Full Refresh Improvement

Discovery 부모 요청을 제외한 leaf manifest를 생성한다. 전체 비용 절감률은 Full 완료 전 확정하지 않는다. 이전 partition과 이번 run의 완료 partition만 사용하고 incomplete tree는 재사용하지 않는다.

## 19. Actual HOT Universe

전체 Full 미완료이므로 전체 OVR≥100/Active Pack 선수·강화 수는 UNKNOWN. partial sample을 전체 시장 수치로 제시하지 않는다. Full DB 구축을 우선하며 HOT 최적화는 뒤로 둔다.

## 20. Actual HOT Refresh Cost

전체 HOT HTTP/runtime은 UNKNOWN. Phase4.7R의 두 class 표본 결과를 전체 HOT 비용으로 외삽하지 않는다.

## 21. Proposed 2h HOT Strategy

Full 완료 후 verified leaves에서 OVR threshold와 실제 활성 상품을 적용해 측정한다. 약2h는 후보 목표이며 아직 검증된 SLO가 아니다.

## 22. Proposed Daily Full Strategy

완료 manifest의 모든 leaf를 refresh. discovery와 steady-state 비용을 분리해 하루 내 완료를 검증한 후 운영값을 확정한다. 현재 자체120/day를 영구 제한으로 취급하지 않고 이번 실행은5,000/day 프로파일로 수행한다.

## 23. Proposed Cron

현재 새 OS cron 설치 없음. 장기 후보 HOT `0 */2 * * *`, Full `30 4 * * *`, Asia/Seoul. **기존 fconline-gg cron은 이미 활성화되어 있으며 변경 승인 응답이 없어 수정하지 않았다.** 실행 감독 프로세스가 HOT 전5분~후45분, 기존 daily Full04:25~05:30 및 Legacy process 실행 중에는 새 Full을 쉬게 한다. 요청 직전 deadline을 다시 검사하므로 기기가 잠든 뒤 깨어나도 지난 deadline으로 요청하지 않는다. 조용한 시간대에 같은 run을 자동 resume한다.

## 24. Freshness Target

HOT 약2h / Full 약24h는 PROVISIONAL. 이번 데이터는 여러 시각에 관측한 Current이며 Reference Snapshot이 아니다. 오래된 가격도 timestamp와 함께 보존한다.

## 25. DB Performance

성공 segment 누적 ms: {'parseMs': 9644.126415999926, 'writeMs': 57811.000331000025, 'currentUpsertMs': 45608.79029199997, 'historyWriteMs': 7202.886502000068}. 전체88k를 하나의 transaction으로 묶지 않는다. 대규모 status 계산은 저장된 variant keys를 재사용해 History 전체를 매번 메모리에 읽지 않도록 수정했다.

## 26. Resume Verification

실제12 segment validation→50 segment checkpoint→정상 종료→동일 run resume를 수행했다. 최초96개 성공 구간을 다시 시작하지 않았다. 최근 조회 구간이 전체를 멈추던 문제는 해당 구간을 deferUntil까지 보류하도록 수정했으며 다른 pending 구간을 계속 수집한다. 자동 continuation, terminal cap 격리, 실패 checkpoint 및 min-interval 보류/재개를 integration으로 검증한다.

## 27. Tests

Unit138 PASS. Integration90 PASS. E2E72 PASS. 동시성 fixture는 시간 sleep에 의존하던 테스트를 barrier 방식으로 바꿔 환경 부하와 무관하게2/4/6 slots를 검증한다. 기존 구매·FC충전·인벤토리·보상·가격·Reference 회귀 포함.

## 28. Build

Build / Typecheck / Lint PASS. 상세 로그 `.local/phase47s/`. 공식 사이트를 사용하는 테스트와 합성 fixture 테스트를 구분한다.

## 29. Remaining Unknown Players

이번 run classification: `{'PRICE_OBSERVED': 7964, 'NO_POSITIVE_PRICE_OBSERVED': 129, 'NOT_DISCOVERED': 0, 'UNRESOLVED_TRUNCATION': 0, 'FAILED': 0, 'PENDING': 80266}`. 전체 metadata88,359개 분류를 [player-classifications.csv](evidence/phase-4.7s/player-classifications.csv)에 저장한다. PENDING은 아직 처리하지 않은 사실을 그대로 표시한다. terminal/failed class의 미관측 선수 분류는 영향 가능성이 있는 class 범위이며 실제 개별 선수 unavailable 확정이 아니다.

## 30. Remaining Constraints

전체 수집 완료 전이다. 기존 독립 Legacy cron의 HTTP는 이 프로젝트 ledger를 공유하지 않으므로 겹치지 않는 시간대를 사용한다. 크레딧 중단 및 기기 sleep 동안 실행 지속을 보장하지 않는다. 이전 watchdog은 기기 재개 시 지난 pause 시각으로 실패했고, 이를 숨기지 않고 요청 직전 deadline 검증으로 교체했다. Supervisor 최대24시간/24회 재개이며 circuit·kill·budget·수동 pause는 자동 우회하지 않는다.

## 31. Is Full Player Price Database Populated?

**NO — 아직 실행 중.** 시작7,190명에서 실제 DB가 증가했지만 전체 planned segment가 처리되지 않았다. Full 완료 여부는 최종 audit과 unresolved 목록으로 판정한다.

## 32. Is Continuous Price Sync Ready?

**NO.** Full 구축과 known-partition 비용 검증이 끝나기 전2h/24h SLO를 확정하지 않는다.

## 33. Ready for Rank / Pack Opening?

**NO.** Pack Opening·Rank 확장·Special Shop·Chart는 구현하지 않았다. 가격 구축이 우선이다.
