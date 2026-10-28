# PHASE 4.7R LEGACY PRICE CRAWLER MIGRATION REPORT

측정: 2026-10-02, 추가 HOT 실행/최종 검증: 2026-10-04 (KST).

## 1. Status

**PARTIAL** — Legacy 분할 전략 이식, 동시 worker, 안전장치, CLI, 실제 bounded benchmark 및 회귀 검증 완료. 현재 전체 시장의 실제 완료 비용과 중요한 시장 전체의 2시간 갱신 가능성은 아직 검증되지 않았다. 작은 표본의 성공을 전체 시장 처리량으로 바꾸어 주장하지 않는다.

## 2. Legacy Project Analysis

실제 소스: `/Users/hanseoson/fconline-gg/backend/scripts/crawl_prices.py`, `backend/concurrency-and-resume.md`, `backend/logs/crawl_full_20260908.log`, `backend/logs/crawl_hot.log`, `README.md`.

POST `/datacenter/PlayerList`; payload는 `strSeason=,classId,`, `n1Strong=1`, `n4OvrMin`, `n4OvrMax`, `strOrderby=""`. 분할 시 `strPosition`, `n4HeightMin/Max` 추가. 한 선수 row의 `.span_bp1`~`.span_bp13`에서 강화 가격을 한꺼번에 읽는다. 선수×강화별 HTTP가 아니다.

## 3. Legacy Verified Evidence

Full 로그: **4,077 units, 88,210 players, 1,146,730 prices, failed=0**, workers=6. 4,077은 151 classes×27 OVR bands이며 하위 분할/재시도 포함 HTTP 수가 아니다. 가격/선수 카운터는 unit 내부 dedup 후 합계이고 전체 global distinct를 증명하지 않는다. terminal cap 경고 **3건**이 있었다.

HOT 성공 예: 1,043 units / 9,551 players / 124,163 prices, 1,057 units / 9,722 players / 126,386 prices. 최초 감사 시 완료 로그 209개 중 실패 포함 50개; 10월 4일 재확인 시 215개 중 51개로 파일이 계속 증가했다. DNS 실패 사례가 있으며 이를 차단이라고 해석하지 않는다.

README의 87,833/87,862=99.97%는 별도 과거 snapshot. 약 50분→6 workers 10–15분은 문서상 경험치이며 해당 Full 로그에 시간 기록이 없어 독립 검증한 elapsed가 아니다. cron은 HOT `--fresh --min-ovr 100 --workers 6`, Full `--fresh --workers 6`.

## 4. Legacy vs Current Collector

| Metric | Legacy | Current Before | Current Migrated |
|---|---|---|---|
| Full players / variants | 88,210 / 1,146,730 unit 합계 | Full 미완료 | Full 미완료; §26 현재 DB |
| Crawl units | 4,077 초기 bands | class→binary OVR | known partition + 5 OVR + position + height |
| Full HTTP / runtime | 로그로 정확히 모름 / 문서 10–15분 | 모델 약 1,246 HTTP | §14 계획 하한, 실제 전체 미측정 |
| Concurrency | default 5, 로그 6 | 1 | 1–6 지원, 실제 1·2 검증 |
| Delay | 각 worker 응답 후 0.6초 | 전역 10초 | 전역 10초 유지 |
| Failed / truncated | Full failed 0, terminal cap 3 | terminal cap 차단 | terminal cap 차단, §13 실제 오류 |
| Coverage | 과거 별도 99.97% | 미완료 | 현재 전체 완료 아님 |

## 5. Migrated Algorithm

OVR→Position→Height 분할, worker pool, Full/HOT 명령을 가져왔다. 현재 공식 UI 기본 payload 및 SPID+강화 연결을 유지한다. 무조건 append, run 시작 시각을 모든 관측 시각으로 사용, terminal cap 성공 처리, shared HOT/Full progress 삭제, 무조건 retry는 가져오지 않았다. 현재 범위는 OVR 0–200이며 Legacy 0–134보다 넓다.

## 6. Adaptive Subdivision

검증된 class partition은 재사용. 작은 metadata class는 broad query 한 번부터 시작하고 미확인 큰 class는 5단위 OVR bands로 시작한다. cap이면 각 정수 OVR, 이어서 Legacy의 15 position bucket(0–27 코드 포함), 이어서 height `[0,169],[170,174],[175,179],[180,184],[185,260]`으로 분할한다. 현재 UI 기본 height는 140–250이며 이식한 height subdivision은 Legacy 실제 코드 범위다. 임의 endpoint나 우회 pagination을 추가하지 않았다. Position은 선수 중복을 반환할 수 있어 global variant key로 구분한다.

## 7. 200 Cap Handling

200 rows는 성공 완료가 아니다. 부모 SPLIT → 자식 수집. 마지막 height에서도 200이면 **UNRESOLVED_TRUNCATION / BLOCKED**. 해당 응답을 Current로 부분 반영하지 않는다. 관측한 cap 부모 수와 미해결 terminal cap 수를 별도로 기록한다.

## 8. Concurrency Architecture

1–6 async worker가 DB advisory lock 아래 PENDING segment를 원자적으로 claim한다. source lock은 모든 작업이 끝날 때까지 유지한다. 요청 예약 FIFO와 영속 전역 ledger가 worker 전체의 시작 간격/예산을 제한한다. segment 단위 검증·transaction·checkpoint를 사용한다. 늦은 관측은 최신 Current를 덮어쓰지 않는다. 같은 millisecond에 서로 다른 segment 응답이 도착할 수 있어 source capture의 unique key에 `captureKey`를 추가했다. 기존 GENERAL capture 충돌 검증은 유지한다.

## 9. Benchmark — Concurrency 1

최종 표본 classes 111(small), 100(medium), 300 OVR65–69(dense/capped). **13 HTTP = 12 POST + robots 1**, 548 unique players, 7,358 variant observations / **7,124 unique variants**, **122.671초**. 실패/재시도/403/429/security 모두 0. cap 부모 3, terminal cap 0; 요청 상한으로 PAUSED이며 전체 범위 완료가 아니다.

## 10. Benchmark — Concurrency 2

최종 표본 classes 113, 101, 319 OVR65–69. **9 HTTP = 8 POST + robots 1**, 614 players, **7,982 unique variants**, **82.319초**. 실패/재시도/403/429/security 모두 0. cap 부모 1, terminal cap 0; 이 제한된 계획은 COMPLETE. 전체 class319 또는 전체 시장 완료를 의미하지 않는다.

## 11. Benchmark — Concurrency 4

실제 사이트 실행 생략. fixture에서 4 slots 동시 실행/결과 유실/unique checkpoint/same-ms capture 검증. 현재 HTTP 시작 간격 10초, 정상 응답 약 1초이므로 worker 추가만으로 전송량 증가를 기대할 근거가 부족했다.

## 12. Benchmark — Concurrency 6

실제 사이트 실행 생략. fixture에서 6 slots 검증. Legacy 6 workers 성공 이력은 공식 허용 rate나 현재 안전성 보장이 아니다. 차단 한계 실험을 하지 않았다.

## 13. Throughput Comparison

| Round / workers | HTTP / POST | Players | Raw / unique variants | Seconds | Players/sec | Unique variants/sec | Errors |
|---|---:|---:|---:|---:|---:|---:|---|
| 1 / 1 | 13 / 12 | 463 | 6,019 / 6,019 | 122.528 | 3.78 | 49.12 | parser 1, HTTP 0 |
| 1 / 2 | 12 / 11 | 492 | 7,410 / 6,396 | 111.913 | 4.40 | 57.15 | 0 |
| 2 / 1 | 13 / 12 | 548 | 7,358 / 7,124 | 122.671 | 4.47 | 58.07 | 0 |
| 2 / 2 | 9 / 8 | 614 | 7,982 / 7,982 | 82.319 | 7.46 | 96.96 | 0 |

서로 다른 표본이므로 2-worker speedup ratio로 해석할 수 없다. 요청당 선수 밀도 및 cap 탐색 비용이 다르다. raw 중복 1,014 / 234는 position overlap이고 DB Current 중복 row가 아니다. elapsed 기반 분당 수는 6.36/6.56처럼 나오지만 첫 요청 즉시 시작 효과가 있으며 최종 두 실행의 실제 최소 시작 간격은 각각10.005초, 최대 rolling60초 요청은 각각6건이었다.

첫 실행에서 이강인 SPID879243780의 공식 가격 표시 `0`을 발견했다. 이를 유효 BP로 저장하지 않고 MISSING으로 분류하도록 수정하고 보존 HTML로 추가 HTTP 없이 재검증했다. 원래 실패 기록은 숨기지 않았다. 이번 Phase 실제 요청은 **52 HTTP**: 4회 benchmark47 + 공식 페이지/robots 연구2 + 추가 HOT3. 10월4일 재개 후에는 HOT3만 요청했다.

요청별 시작/헤더 도착/상태/slot/query 및 segment transport 완료 이벤트: [benchmarks.json](evidence/phase-4.7r/benchmarks.json). ledger finishedAt은 헤더 도착이며 body 완료는 segment request.finishedAt이다. Round 1은 slot 연결 추가 전 기록, Round 2는 segmentId/slot 기록 포함.

## 14. Current Full Market Plan

Metadata **88,359 / 153 classes**. 현재 Legacy-derived 초기 query **1,721**; 미확인 dense class **38**. 20 HTTP/execution 중 robots 1을 가정하면 **최소 1,812 HTTP**(1,721+ceil(1,721/19)). cap 자식/재시도/실행 분할로 증가한다. 이는 exact total estimate가 아닌 현재 root-plan 하한이다.

10초 간격만 적용한 active time 하한 약 **302분**; 시간 60/day120 예산까지 적용하면 요청 용량 기준 **30.2 시간 슬롯 / 15.1 일분의 예산**이 필요하다. 실제 wall-clock에는 pause/공유 작업/재시도가 더해진다. legacy 10–15분을 현재 runtime으로 가져올 수 없다.

기존 binary planner의 known completed classes 34, reconciliation 모델 1,248 HTTP는 다른 알고리즘의 모델이다. 새 planner 하한과 혼용하지 않는다. 완전한 position/height partition 재사용 및 미확인 dense class 탐색 비용은 추가 검증 대상이다. Confidence LOW; 완성된 전체 시장 trace는 아직 없다. [전체 query manifest](evidence/phase-4.7r/full-plan.json)는 선수 목록을 생략한 감사용 파일이며 실행용 계획은 CLI dry-run으로 재생성한다.

## 15. Legacy Full vs New Full

Legacy full unit counter 4,077, 실제 HTTP unknown. New full root queries 1,721, 실제 final HTTP unknown. 작은 class의 불필요한 빈 bands를 줄였지만 새 범위가 더 넓고 cap을 엄격히 처리한다. 감소율이나 88k 수집 속도를 확정할 수 없다.

## 16. Hot Market Definition

Legacy OVR≥100 약 9,551–9,722 players. 현재 전체 filter-matched 인원은 **UNKNOWN**. 저장 응답의 selected +1 primary display OVR 분포는 아래 증거 JSON에 있다. 표시 OVR를 순수 OVR/필터 OVR/Rank 조건으로 동일시하지 않는다.

| Display threshold | 관측 선수 | 양수 표시 variants | 현재 초기 query |
|---|---:|---:|---:|
| ≥90 | 2,982 | 38,753 | 1,002 |
| ≥95 | 1,918 | 24,921 | 962 |
| ≥100 | 1,129 | 14,677 | 924 |
| ≥105 | 899 | 11,687 | 875 |
| ≥110 | 841 | 10,933 | 837 |
| ≥115 | 728 | 9,464 | 799 |
| ≥120 | 562 | 7,306 | 761 |

이 표는 10월4일 최종 관측 sample이며 전체 시장 분포가 아니다. 실제 query 필터 결과 전체 인원은 여전히 UNKNOWN. `--active-pack`은 실제 활성 상품 class를 추가한다. 최종 감사 시 활성 상품 class는 0: 만료된 상품을 현재 판매 중으로 가정하지 않는다. Current top-value는 현재 확보된 선수 집합 내 순위일 뿐이다.

## 17. Hot Refresh Cost

**실측 제한 표본**: classes864/867 OVR100–200, 3 HTTP(2 POST+robots), 148 players, 1,924 variants, **23.157초**, COMPLETE, 실패0. NEW1,924 / CHANGED0 / UNCHANGED0이며 신규 발견이지 변화율 측정이 아니다. [hot-sample.json](evidence/phase-4.7r/hot-sample.json).

전체 HOT 초기 계획 924 POST, 최소 robots49 → **973 HTTP**, active delay 하한162.17분. 아직 cap discovery 전이며 전체 HOT actual은 미측정. 작은 sample 완료와 전체 HOT 2시간 가능성을 구분한다.

## 18. Full Refresh Cost

현재 initial Full root-plan 하한1,812 HTTP / active302분; exact HTTP, minutes, discoverable players, valid variants 모두 전체 완료까지 UNKNOWN. metadata×13=1,148,667은 유효 가격 수를 보장하지 않는 상한이다. 완료 partition을 재사용한 향후 refresh는 discovery 비용이 감소할 수 있다.

## 19. Two-Hour Strategy

공식 안내는 Data Center 데이터 2시간 갱신, 선수별 시점 차이 및 홈페이지 반영 지연을 명시한다. 게임 기준가와 동일 시각·동일 값 보장이 아니다. [공식 Data Center](https://fconline.nexon.com/datacenter).

| Candidate | 계획 기반 HTTP/day | 판정 |
|---|---:|---|
| A: OVR≥100 2h + Daily Full | ≥973×12+1,812 = **13,488** | 현재 discovery plan·운영 설정에서는 불가 |
| B: A + active pack | 현재 active0으로 같은 하한 | 상품 활성화 시 재계산 |
| C: 기존 adaptive | 기존 모델 약 **100.9**, reference 별도 | 예산 내 후보이나 freshness 목표 미달 |
| D: high-value/OVR/pack + medium + daily | A에 medium 범위별 추가 비용, overlap 공제 전 | 전체 target set 미확정으로 exact unknown |
| Full every2h | ≥1,812×12 = **21,744** | 사용 안 함 |

A의 30일 하한404,640 HTTP. 이는 현재 초기 discovery manifest 기준이며 **known partition HOT steady-state 비용으로 주장하지 않는다**. 증거가 충분해지면 더 단순한 A/B를 우선 검토한다. 현재 2h important-market SLO는 PROVISIONAL/미달이고 완성된 운영 정책이라고 부르지 않는다.

## 20. Daily Strategy

Daily Full은 강한 운영 후보이나 현재 전체 실측·완전성이 미확보다. 전역10초만 고려하면 최소5.03시간, 현재 시간·일 예산으로 매일 완료할 수 없다. worker2만으로 개선되지 않는다. 다음 단계는 dense partition의 제한된 실행 비용을 확보하고 실제 필요한 허용 처리량을 검토하는 것. 120/day를 Nexon의 영구적 한계로 선언하지 않는다.

## 21. Proposed Cron

후보 timezone **Asia/Seoul**: HOT `0 */2 * * *`, FULL `30 4 * * *`. **OS cron 설치 안 함**. Full 소유 source lock이 있으면 Hot은 동시 실행하지 않고 다음 eligible로 연기. 최근 수집 범위는 minimum interval로 생략한다. 각 CLI는 bounded batch이며 cron 한 번이 전체 완료를 보장하지 않는다. 운영 coordinator가 같은 run ID를 resume해야 한다.

```sh
npm run prices:full -- --dry-run --output full-plan.json
npm run prices:full -- --max-segments 20
npm run prices:full -- --resume RUN_ID --max-segments 20
npm run prices:full -- --status RUN_ID
npm run prices:hot -- --dry-run --min-ovr 100 --active-pack
npm run prices:hot -- --classes 864,867 --min-ovr 100 --max-segments 4
npm run prices:control -- disable
npm run prices:control -- enable
npm run prices:control -- pause-until FUTURE_ISO_TIMESTAMP maintenance
```

정지는 shared DB kill switch. 이미 전송된 요청은 취소를 보장하지 않으며 다음 예약/구간에서 중단. `.env` 변경은 새 process에 적용; 실행 중 정지는 위 DB control 사용. resume는 성공 checkpoint를 재요청하지 않는다.

## 22. Current + History

NEW → Current+INITIAL. CHANGED → Current+PRICE_CHANGE. UNCHANGED → lastObservedAt 갱신, 변경 없는 History는 억제하되 configured heartbeat 유지. MISSING/0표시 → 기존 Current 유지, 삭제/0원 덮어쓰기 금지. Reference capture는 일반 compact refresh와 분리. Full도 compact policy를 적용한다.

## 23. DB Performance

최종 worker1 / worker2 각 실행의 성공 segment 누적 ms:

| 항목 | worker1 | worker2 |
|---|---:|---:|
| Parse | 1,166.02 | 931.96 |
| Write(대기 포함) | 4,238.31 | 4,341.42 |
| Transaction | 4,201.33 | 4,317.33 |
| Current upsert | 3,269.90 | 3,350.99 |
| History write | 563.18 | 582.26 |

DB write 내부에서는 per-row Current upsert가 가장 크다. 그러나 이 표본의 wall-clock 지배 요인은 전역10초 pacing이다. 이번 단계에서 88k 단일 transaction이나 근거 없는 대규모 batch rewrite는 하지 않았다. 더 높은 실제 처리량을 검증할 때 batch upsert를 재평가한다.

## 24. Resume

성공 segment 보존, 실패 worker checkpoint만 재실행, 완료 run의 0 HTTP, 저장 응답 재검증, budget resume를 integration으로 확인. fixture worker2/4/6에서 각 checkpoint를 정확히 한 번 claim했다. 실패가 기존 Current/History를 삭제하지 않는다.

## 25. Safety

SAFE_DEFAULT: concurrency1, global delay10,000ms, 6/min,60/hour,120/rolling24h,20/execution. 모두 자체 운영 설정이며 **No explicit safe request rate confirmed**. 실제 worker2 benchmark는 해당 process의 concurrency만2로 변경했다. Legacy observed6/worker sleep600ms와 구분한다.

403/429/security/unexpected access page는 circuit/중단 신호; 5xx/timeout bounded retry/backoff. 이미 진행 중인 최대 N−1 요청은 새로 발송한 폭주와 다르다. lock/lease/maintenance/pause/kill switch/영속 request ledger 유지. robots 확인도 예산에 포함한다. robots의 ETag는 시장 version이 아니다. 가격 응답에서 ETag/Last-Modified/global market version을 확인하지 못했다. cache-control private, HTTP Date로 시장 변경을 판단하지 않는다.

## 26. Current Coverage

최종 2026-10-04 16:00 KST: Metadata **88,359**, priced players **7,190 (8.14%)**, Current **93,470**, History **110,635**. 관측 발견 선수7,191, 미확인81,168, 관측했으나 양수 가격 없음1, 전체 unavailable 인원 UNKNOWN. 기존 Full manifest 완료 class34/153; 별도 benchmark·HOT에서 발견한 가격까지 합친 DB coverage와 같지 않다. 상세는 [market-audit.json](evidence/phase-4.7r/market-audit.json). 가격 확보와 특정 Bootstrap run의 완료율은 다른 지표이며 legacy99.97%를 가져오지 않는다. 확인되지 않은 선수는 unavailable로 확정하지 않는다. 부분 benchmark의 COMPLETE는 해당 계획만 의미한다.

## 27. Freshness Strategy

HOT 약2h / 전체 약24h는 후보 목표이며 검증된 SLO가 아니다. 10월4일 재개 시 91,546 rows가 모두24h 이상으로 확인되어 현재 정책의 freshness 부족이 명확했다. 새 HOT 표본만 갱신했다고 전체 freshness 성공으로 표시하지 않는다. Reference는 정확한 요구 시간대/조건 충족을 별도로 검증한다.

## 28. Multi-Cycle Observation

기존117-variant study 보존. 2cycles, 2h 비교1쌍117개/변경0. 2h도 sample 부족,4h/6h/24h 비교 없음: **INSUFFICIENT_DATA**. 며칠 후 observation을 2h 간격으로 위장하지 않았고 이번 benchmark를 동일 cohort 변화율로 합치지 않았다.

## 29. Tests

Unit **136 PASS**, integration **85 PASS**, E2E **72 PASS**. 분할/terminal cap,2·4·6 worker,동시 source capture, out-of-order,Current/History,worker failure resume,budget,circuit,lock,cron timezone,user HTTP isolation 및 기존 결제·구매·인벤토리·보상·가격·reference 회귀 포함.

초기 재검증에서 build의 Prisma generation과 integration을 겹쳐 실행해 native engine 로드 오류가 발생했다. generation 완료 후 재실행해 통과했다. 실패 worker fixture는 rollback transaction 내부의 advisory-lock 동작을 직렬 queue로 모사하도록 수정했다. E2E의 “가격 없음” fixture는 실제 가격이 새로 발견된 선수에서 공식0표시 선수로 교체했다.

## 30. Build Verification

`npm run build`, `npm run typecheck`, `npm run lint` PASS. Migration `202610020001_concurrent_source_capture` 적용 및 client 생성. 실제 secret 또는 Legacy price dump를 가져오지 않았다.

## 31. Remaining Constraints

현재 source 환경에서 Legacy 수준의 high coverage + 빠른 full runtime은 미검증. 200 cap terminal 문제는 명시적으로 중단하고 해결을 숨기지 않는다. 동일2h 가격 DB 및 매일Full 목표는 현재 설정으로 달성 불가. active pack은 시간에 따라 변하며 전체 OVR distribution도 미확보. legacy 자료는 실제 근거지만 최종 허용률 근거가 아니다. 낮은 요청 수만으로 준비 완료라고 부르지 않는다.

## 32. Recommended Production Price Architecture

중앙 scheduler → bounded Full/Hot plan → 공통 예산·source lock → concurrent safe collector → parse/validate → segment transaction → Current/compact History/metrics. 브라우저/API는 PostgreSQL만 읽는다.

먼저 Legacy-derived Full을 checkpoint 기반으로 진행해 dense class partition/HTTP를 확정한다. 중요한 시장은 OVR≥100 + 실제 active pack 후보로 분리해 known partition 비용을 측정한다. 다음 제한된 처리량 평가에서 pacing·시간·일 예산을 함께 재검토해야 하며 worker 수만 올리는 실험은 의미가 작다. 목표2h HOT + dailyFull을 만족하는 비용과 접근 근거가 확보되면 임시14일COLD 모델을 대체한다. 그 전에는 기존 adaptive를 fallback으로 유지하되 freshness 미달을 표시한다. Reference는 우선순위가 높은 별도 dataset/job이다.

## 33. Price Infrastructure Ready?

**NO** — 이식한 수집 기능과 bounded 검증은 준비됐지만 전체 coverage, exact full/hot 비용 및2h/24h 운영 SLO 검증이 남았다. 현재 최종 production policy로 승격하지 않는다.

## 34. Ready for Rank / Pack Opening?

**NO** — 가격 coverage/freshness가 부족하고 reference-time 완전성은 일반 Current로 대체할 수 없다. Pack Opening, Rank 확장, Special Shop, 가격 Chart를 구현하지 않았다.
