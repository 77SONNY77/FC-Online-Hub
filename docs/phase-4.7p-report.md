# PHASE 4.7P PRICE INFRASTRUCTURE REPORT

측정 기준: **2026-09-30 15:09:28 KST**. 아래 수치는 그 시점의 PostgreSQL/요청 원장이다. 이후 실행되는 bounded worker의 결과를 소급해 포함하지 않는다.

## 1. Status

**PARTIAL — CONSTRAINT IDENTIFIED.** 측정·관측·공정 배분·metadata 계획 갱신을 구현하고 실제 Bootstrap을 추가 수행했다. 전체 발견은 미완료이고 고정 표본은 T0만 확보했다. 다중 주기 통계와 운영 Freshness SLO는 아직 검증되지 않았다. Pack Opening으로 진행하지 않는다.

근거: [측정 JSON](phase-4.7p-metrics.json), [153개 클래스 비용](phase-4.7p-class-costs.json). 전체 로컬 감사 기록은 `.local/phase47p-research/final.json`이며 비밀값을 포함하지 않는다.

## 2. Price Infrastructure Priority

추가한 기능:

- PostgreSQL 기준 전체/클래스/강화별 관측 나이 백분위수 및 Coverage·backlog CLI.
- 기존 segment 결과에 compact 관측 집계: 비교 가능 개수, 변화율, 변화 크기, 큰 변화, 관측 간격별 통계, 강화별 변화율, stale→fresh 수.
- 고정 117-variant 표본과 최대 4-cycle 실험. 중앙 Scheduler만 실행한다.
- 실제 발견된 partition의 효율·노후도·변화율을 반영하는 설명 가능한 우선순위.
- 연속 Bootstrap/Refresh 배치 제한과 최소 재요청 간격.
- metadata 변경 시 새 불변 Full plan, 변경 클래스 우선순위, 변경 없는 체크포인트 전승.
- 독립적인 bounded worker. Pack/Rank/Special Shop/Chart 기능은 확장하지 않았다.

## 3. Current Market Coverage

| 항목 | Phase 시작 | 측정 시점 |
|---|---:|---:|
| 최신 metadata 선수 | 88,359 | 88,359 |
| 가격 있는 선수, 모든 run 합계 | 2,977 | **3,732** |
| Current variants | 38,701 | **48,516** |
| History rows | 42,127 | **57,896** |
| Full Bootstrap 완료 클래스 | 17/153 | **21/153** |
| Full Bootstrap 가격 확보율 | 3.06% | **3.91%** |

Full run 자체는 3,458명/44,954 variants. 다른 run까지 합친 전체 DB Coverage는 **4.22%**다. 분모가 metadata라는 점과 run/전체 DB 수치를 구분한다.

현재 발견된 선수 3,732, 가격 없는 metadata 선수 84,627, 아직 응답에서 관측하지 못한 선수 84,627. 전체 Discoverable Players와 확정 Unavailable Players는 **UNKNOWN**이다. metadata 등재가 거래 가능·검색 가능·유효 강화 13개를 보장하지 않는다. 미관측 선수를 unavailable로 바꾸지 않았다.

## 4. Full Market Crawl Cost

- 현재 initial-build 모델: **1,223 price POST + 약 65 robots GET = 1,288 HTTP**.
- 실제 Full run 누적: **97 price POST**. 전체 수집 실측값이 아니다.
- 21개 완료 클래스의 실제 요청 수를 모델에 반영했다. 클래스마다 metadataPlayers/plannedSegments/predictedRequests/actualRequests/difference/completed/error/truncated를 저장된 자료에서 계산한다.
- 완료된 큰 클래스 7개의 실제/예측 비율은 **2.5862**. 예: 216은 예상 3 → 실제 11, 201은 3 → 11. 기존 모델이 낙관적일 가능성이 크다.
- 이 7개 비율을 미완료 큰 클래스에 적용한 민감도 분석은 **약 3,036 initial HTTP**다. 비무작위 표본이므로 통계적 신뢰구간이나 새 확정값으로 사용하지 않는다.
- Initial 모델의 최소 active time 3.58h, 120/day만 적용한 최소 10.73일. 재시도·Reference·Refresh·휴지시간을 배분하면 더 길어진다.
- 이미 발견한 leaf partition을 재사용하는 Full refresh 모델은 **1,248 HTTP**, 최소 active time **3.47h**, 120/day만 적용해도 **10.4일**이다. 아직 미발견 클래스의 비용은 모델이다.

**Confidence: LOW / exact full cost UNKNOWN.** 88,359개의 개별 HTTP가 필요하다는 가정은 하지 않는다.

## 5. Official Update Behavior

[공식 Data Center](https://fconline.nexon.com/datacenter)의 안내를 9/30 예산 내 GET으로 재확인했다. 데이터 집계는 2시간 단위지만 홈페이지 반영에 지연이 있을 수 있고, 선수별 갱신 시점 차이 때문에 게임 내 기준가와 모두 일치하지 않을 수 있다는 설명이다.

확인되지 않은 사항: 모든 선수 동시 갱신, 거래 발생 선수만 변경, 강화별 동일한 갱신 시계, 정확한 고정 시각, 최대 지연 상한, 개별 게임 기준가 산정 주기. 따라서 Source 집계/게임 기준가/선수별 시점/웹 반영/우리 관측은 서로 다르게 취급한다.

9/30 root GET 및 price POST에서 ETag·Last-Modified·Age 없음, Cache-Control `private`, HTTP Date만 관측했다. Date는 시장 버전이 아니다. 신뢰 가능한 global market version을 찾지 못했으므로 가짜 version check나 304 지원을 구현하지 않았다.

정책: robots에 적용되는 Data Center disallow는 관측되지 않았으나 허가·안전 속도를 의미하지 않는다. **No explicit safe request rate confirmed.** [당일 공식 점검 공지](https://fconline.nexon.com/news/notice/view?n4ArticleSN=6285)의 11:15 조기 종료 이후 요청했다.

요청 효율 재검토:

- 공식 HTML의 클래스 checkbox와 기존 보관 공식 JS `SetCheckSearch`는 쉼표로 다중 클래스를 선택하고 form을 `/datacenter/PlayerList`에 POST하는 동작을 보여준다. 더 큰 무제한 응답을 제공한다는 근거는 없다.
- 104개 작은 클래스의 metadata 수만 묶으면 199명 이하 43묶음이라는 단순 packing 모델이 나온다. 잠재 절감은 61 POST 정도지만, 실제 다중 클래스 응답·분할 검증은 미완료여서 Collector에 적용하지 않았다.
- 현재 응답에서 선수당 +1~+13을 이미 한 번에 확보한다. +0은 실제 no-price 표시를 보존한다.
- 공식 UI 기반의 known-SPID bulk 갱신 API나 더 큰 page-size 기능은 확인되지 않았다. 파라미터를 추측하지 않았다.
- robots는 execution당 1회 유지한다. 20 HTTP 배치 중 1회인 비용을 숨기지 않으며 임의 TTL로 정책 확인을 생략하지 않았다.

## 6. Multi-Cycle Observation

고정 study `price-cycle-v1`: 클래스 **215/866/877**, 각 클래스의 기존 +1 가격 low/median/high 선수 3명씩, 그 선수들의 관측된 +1~+13. 총 **9명/117 variants**. 866/877은 기존 문서화된 Pack 클래스이며 215는 비-Pack 클래스다. 현재 판매 여부·사용자 인기도는 추정하지 않았다.

T0: **14:20:43~14:21:17 KST**, cohort 117/117, missing 0. 전체 batch는 3 price POST+robots 1로 458명/5,954 variants를 갱신했다. 다음 eligible은 **16:21:17 KST**다. Scheduler/worker가 실행되고 예산이 남아 있을 때 수행하며 실제 실행 시각은 보장하지 않는다.

| 관측 간격 | 고정 cohort 비교 pair | 변화율 |
|---|---:|---|
| 2h | 0 | INSUFFICIENT_DATA |
| 4h | 0 | INSUFFICIENT_DATA |
| 6h | 0 | INSUFFICIENT_DATA |
| 24h | 0 | INSUFFICIENT_DATA |

T0 batch의 과거 DB 대비 변경은 **4,090/5,954 = 68.69%**지만 약 8일 이상 간격의 값이다. Phase 4.6C의 2,570/3,562=72.15% 역시 2시간 표본으로 사용하지 않는다. 현재 active-sale HOT 클래스가 0이므로 이번 결과를 HOT Sync 실적으로 표기하지 않는다.

일반 집계와 별도로 고정 cohort의 모든 cycle pair를 2/4/6/24h±15분으로 비교한다. 최소 2개 qualifying pair 전에는 `INSUFFICIENT_DATA`; 그 이후에도 `OBSERVED_SAMPLE_ONLY`다. 기본 4-cycle/약 6h 실험은 24h 통계를 만들 수 없다. 별도 장기 관측이 필요하다. endpoint 값이 같아도 중간 변동이 없었다는 뜻이 아니다.

`firstObservedChangedAt`만 기록한다. 실제 Source 변경 시각과 정확한 update lag는 알 수 없다. 이전 관측과 첫 변경 관측 사이의 구간만 알 수 있다.

## 7. Price Freshness

측정 기준 15:09:28 KST. 아래는 공식 가격 정확도가 아니라 **우리 관측 나이**다.

| 항목 | 값 |
|---|---:|
| Total | 48,516 |
| Fresh, <24h | 15,769 |
| Stale, 24h~720h | 32,747 |
| Very stale, ≥720h | 0 |
| Median | 약 222.67h |
| P90 | 약 229.18h |
| P95 | 약 229.18h |
| P99 | 약 229.18h |
| Oldest | 약 229.18h |

정확한 값·클래스별 coverage/median/P95/마지막 성공 관측·강화별 count/fresh/median/변화율은 측정 JSON과 `prices:infrastructure`에 있다. 720h 분류는 기존 설정이며 “9일 된 가격이 적절하다”는 판정이 아니다. 개별 클래스 `lastSuccessfulSync`는 최신 성공 variant 관측이고 클래스 전체가 같은 시각에 갱신됐다는 뜻이 아니다.

## 8. Request Efficiency

이번 실측의 분모는 robots를 포함한 **모든 HTTP**다.

| Batch | HTTP | Players/HTTP | Variants/HTTP | Changed/HTTP | Stale→Fresh/HTTP |
|---|---:|---:|---:|---:|---:|
| 표본 T0 | 4 | 114.50 | 1,488.50 | 1,022.50 | 1,488.50 |
| 추가 Bootstrap | 20 | 37.75 | 490.75 | 0 | 0 |

Bootstrap의 9,815개 NEW는 신규 Coverage 이득이며 stale→fresh에는 중복 계산하지 않았다. 전체 Full run의 price-POST 기준은 35.65 players/POST, 463.44 variants/POST다. Discovery용 truncated parent 요청도 분모에 포함한다.

## 9. Bootstrap Backlog

남은 클래스 **132**, pending segment **132**, 모델상 남은 price POST **1,126**. 아직 분할되지 않은 root를 포함하므로 pending segment 수가 최종 HTTP 수는 아니다. 기존 예산·Checkpoint·Resume를 유지한다.

## 10. Refresh Backlog

기존 provisional HOT/WARM/COLD 정책 기준 due segment **1**, 예상 price POST **1**. Reference due snapshot 0. 그러나 전역 24h 지표에서는 32,747 variants가 stale이다. “due 1”은 기존 COLD 14일 정책이 느슨하기 때문이며 좋은 Freshness를 뜻하지 않는다.

## 11. Strategy Comparison

| Strategy | 모델 HTTP/day | active h/day 최소 | Median/P95 | Coverage | 위험/판정 |
|---|---:|---:|---|---|---|
| Full every 2h | 14,976 | 41.60 | 달성 불가 | 미확정 | 실행하지 않음 |
| Full every 4h | 7,488 | 20.80 | 미검증 | 미확정 | 예산 초과 |
| Full daily | 1,248 | 3.47 | 미검증 | 미확정 | 예산의 10.4배 |
| 기존 HOT/WARM/COLD | 90.50 | 0.25 | 미검증 | 발견 완료 가정 | COLD 14~28일 노후화 허용 |
| Adaptive, 예산 제한 | ≤120, 평균 미측정 | 최대 지연합 0.33 | 미검증 | 점진 증가 | 순위 개선, SLO 보장 아님 |
| Hybrid, 기존 주기+120일 reconciliation | 100.90 | 0.28 | 미검증 | 발견 완료 가정 | PROVISIONAL |

2h full의 30일 비용 **449,280 HTTP**. full daily는 **37,440/30일**. 기존 tiers는 약 **2,715/30일**, hybrid 약 **3,027/30일**. 이 steady-state 모델에는 초기 Bootstrap과 한시적 표본 실험이 포함되지 않는다. 120일 reconciliation도 운영 임시값이며 실측으로 최적임을 검증하지 못했다.

## 12. Request Budget Analysis

자체 정책: **6/minute, 60/hour, rolling 24h 120, execution 20, concurrency 1, delay 10s**. Nexon 공식 제한이 아니다. 이번 Phase에서 상향하지 않았다.

추가 SLO 모델:

- HOT<2h/WARM<12h/COLD<72h: 현재 클래스 분류에서 **398.33 price POST/day**. 최적으로 19 POST마다 robots를 분산해도 평균 약 **419.30 HTTP/day 이상**이며 실제 작은 execution은 더 든다.
- HOT<2h/전체<24h: 현재 HOT 0이므로 **1,185 POST + 63 GET = 1,248 HTTP/day**.
- HOT 클래스가 다시 생기면 그 부분의 비용을 `prices:cost`로 재계산해야 한다.

전체 2h 정책은 120/day와 시간당 60 제한뿐 아니라 10초 직렬 간격만으로도 불가능하다. 120/day 전부를 시장 순회에 써도 1,248 HTTP 모델의 한 순회는 최소 10.4일이다. 이 자체 정책 안에서 전체 24h 또는 2h SLO를 약속할 수 없다.

## 13. Proposed Price Freshness SLO

**PROVISIONAL / NOT VERIFIED**. HOT 2/4/6h 후보는 고정 표본 및 요청 비용 비교 후 결정해야 한다. 이번 변경은 HOT을 자동으로 2h로 바꾸지 않았다. 기존 실행 eligibility는 HOT 6h, WARM 48h, COLD 336h이며 non-HOT 연속 무변화는 2배 backoff다.

이 시간은 best-effort 요청 우선순위이고 보장 SLO가 아니다. Whole-market Median/P95 목표는 **미승인·미설정**이다. 시장 전체의 현재가 정확도 손실을 퍼센트로 산출할 자료가 없다. 68.69%/72.15%를 전체 시장 부정확률로 대입하지 않는다.

## 14. Two-Hour Update Strategy

FC Online Data Center는 약 2시간 단위로 데이터를 갱신한다. 우리 시스템은 **중앙 tick → Source pause/circuit/budget 확인 → Reference/표본/Refresh/Bootstrap 공정 배분 → 발견된 partition 갱신 → DB Current/History 비교 → Freshness/변화율 재측정**으로 따라간다.

동일 segment의 일반 최소 재요청 간격은 **설정값 2h**다. 정확한 Source 변경 시계와 동일하다는 뜻은 아니다. 평균 HTTP/day는 **아직 미측정**이고 현재 cap 120, 기존 steady-state tier 모델 90.50, hybrid 모델 100.90이다. Median/P95 Price Age 목표는 **PROVISIONAL·미확정**이다. Full Market Reconciliation은 **기존 120일 eligibility를 유지**하되 최적 주기로 승인하지 않는다.

선택 이유: 전체 2h/24h 갱신은 확인된 비용과 현재 정책에서 불가능하며, 실제 비교 표본이 부족하다. 이미 발견한 partition과 실제 usefulness를 우선 사용하면서 Coverage를 늘리고, 공식적으로 허용되는 더 높은 처리량 또는 다른 Source 없이는 전체 시장 최신성 목표를 충족할 수 없다는 제약을 드러낸다.

## 15. Adaptive Planner

`score = min(age / tierTarget, 100) × observedVariants × importance × (1 + observedChangeRate) / estimatedRequests`.

importance는 HOT 3/WARM 2/COLD 1. 변화율 자료가 없으면 추가 가중치는 0이며 0%라고 통계에 표시하지 않는다. 점수는 PostgreSQL integer 범위 안으로 제한한다. 실제 query partition은 유지하고 due 클래스 내 segment 순서를 결정한다. 현재 구현은 클래스 단위 due 판정·partition 재사용이므로 최적화 solver나 모든 segment의 최적해는 아니다.

Reference는 최우선. 그 외 productive refresh 2회 후 pending Bootstrap에 차례를 주고, Bootstrap 2회 후 due refresh에 차례를 준다. Reconciliation도 연속 배치 후 due incremental에 차례를 준다. 설정으로 횟수를 바꿀 수 있다. 공급 예산 자체가 부족하거나 Reference가 계속 차지하면 시간상 SLO까지 보장할 수 없다.

## 16. Scheduler

기본 30분 tick은 eligibility 검사다. fresh/쿨다운/예산/회로 상태면 **0 HTTP**. 한시적 표본의 다음 시점이 더 빠르면 bounded worker는 그 시점에 검사하도록 대기를 줄인다. 수집은 여전히 동일 글로벌 원장을 사용한다.

일반 Collector 진입점에도 최소 간격 검사를 추가해 겹치는 최근 query의 price POST를 차단한다. Reference는 별도 정확한 시간대 규칙을 따른다. Planner 밖 직접 호출은 robots 1회 후 price 요청 없이 중단될 수 있다.

```sh
npm run prices:infrastructure -- --output .local/price-health.json
npm run prices:cost -- --output .local/price-cost.json
npm run prices:sync -- --dry-run
npm run prices:worker -- --ticks 5
npm run prices:observe -- status
npm run prices:observe -- stop
```

이번 세션에서 최대 **5 ticks** worker를 시작했다. 첫 tick 15:07:37 KST는 cooldown으로 0 HTTP였다. 최종 코드 검증 후 대기 중 worker를 정상 재시작했고, 이미 완료한 1회와 남은 최대 4회를 합쳐 총 5회 범위를 유지한다. 보고서 시점에는 후속 tick이 대기 중이다. 이는 OS 로그인/재부팅 후 자동 재시작되는 daemon이 아니다. 상시 운영은 아래 cron처럼 동일 중앙 job 하나를 호출해야 한다. 이 보고서는 cron을 설치했다고 주장하지 않는다.

```cron
*/30 * * * * cd /Users/hanseoson/Desktop/FC-Online-Hub && /absolute/path/to/npm run prices:sync >> .local/price-sync.log 2>&1
```

cron에서는 실제 npm/Node PATH를 설정하고 worker와 중복 실행하지 않는다. 실수로 겹쳐도 DB lease/공유 budget이 중복 수집을 막는다.

## 17. Current + History

NEW는 Current+INITIAL, CHANGED는 Current+PRICE_CHANGE, UNCHANGED는 price value를 재기록하지 않고 lastObservedAt를 갱신하며 heartbeat 정책으로 History를 억제한다. 한 번의 MISSING은 삭제하지 않는다. Reference는 별도 dataset이며 현재 가격으로 과거 가격을 만들지 않는다.

모든 raw response/source capture와 segment compact 집계는 재현 근거다. unchanged 가격 백만 개를 분석용 History로 복제하지 않는다. 고정 cohort만 최대 117×4=468개의 작은 표본 값을 별도 cycle JSON에 보존한다. Current/UI는 계속 PostgreSQL만 조회하고 관측 시각을 표시한다.

## 18. Metadata Refresh

`npm run data:players`로 metadata를 갱신하면 다음 중앙 tick이 새 dataset을 감지한다. 기존 Full plan을 수정하지 않고 새 plan으로 넘어가며, 신규 SPID/Class 또는 이름/구성 변경 클래스는 우선순위 10,000으로 다시 발견한다. 변경 없는 클래스의 checkpoint와 원래 observedAt를 전승한다. 전승 근거 segment ID를 기록한다.

삭제되거나 검색되지 않는 선수의 History는 보존한다. metadata 갱신을 가격 사용자 API에서 수행하지 않는다. CDN metadata 갱신 주기는 아직 별도 운영 작업이며 이번 Phase에서 임의로 매 tick 다운로드하지 않았다.

## 19. Database Growth

Current **48,516**, History **57,896**. 이번 표본 T0는 이전 관측이 하루 이상 오래되어 unchanged도 정당한 heartbeat가 되었으므로 5,954 History가 추가됐다. Bootstrap은 INITIAL 9,815개를 추가했다.

30일/1년 예상은 **INSUFFICIENT_DATA**. 신규 발견량, 실제 변화율, 반복 관측 간격이 안정되지 않았다. 현재 rows×12×365 같은 허위 예측을 제공하지 않는다. Compact metrics도 배치마다 늘어나고 raw HTML/source capture는 유지되므로 History 압축만으로 전체 저장 공간이 고정되지는 않는다.

## 20. Safety

원장 기준 실제 HTTP **26**: robots 3, root 안내 1, PlayerList 22. 전부 HTTP 200, 관측된 실패/403/429 없음. 이것을 속도 허가나 차단 임계값으로 해석하지 않는다.

추가 Bootstrap 20회에서 `REQUEST_BUDGET_EXHAUSTED`로 멈추고 pending을 보존했다. status: circuit CLOSED, collector idle, rolling-day 사용 26/120. 현재 실행의 run remaining=0은 완료된 20-request 배치 기준이며 다음 배치의 한도가 사라졌다는 뜻이 아니다.

Source lock, scheduler lease, exponential backoff, 403/429/security circuit, pause, `.env` kill switch를 유지했다. Ban threshold 실험이나 제한 우회는 하지 않았다. Source pause/kill은 다음 요청 예약 시 다시 확인한다.

## 21. Tests

- Unit: **132 PASS** — 변화/무변화 cycle, 큰 BP 변화율, age quantile, adaptive score, 양방향 fairness, metadata 신규 클래스.
- Integration: **76 PASS** — Current/History, budget/resume, lock/circuit, metadata checkpoint, fresh zero-HTTP tick, source minimum interval, Reference 불변성.
- E2E: **72 PASS**, desktop/mobile/tablet. 구매/충전/인벤토리/확률/선수/기준일 Snapshot 및 사용자 요청의 Data Center 격리.
- 실측과 fixture를 혼동하지 않는다. fixture의 여러 cycle PASS가 실제 2h 시장 변화율을 검증한 것은 아니다.

## 22. Build Verification

`npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:e2e`를 실행했다. 최종 결과: **Build PASS, Typecheck PASS, Lint PASS, Unit 132 PASS, Integration 76 PASS, E2E 72 PASS**. 실제 source 요청은 테스트가 아니라 별도 원장으로 구분했다.

## 23. Constraints

**원하는 전체 시장 2h/24h Freshness를 현재 Data Center Collector와 자체 budget으로 달성할 수 없음.** 공식적으로 허용되는 rate는 미확인이다. 전체시장 갱신 비용도 아직 모델이며 완료 큰 클래스들은 기존 예측보다 더 많은 요청을 요구했다.

HOT/WARM/COLD가 실제 정확도를 얼마나 희생하는지는 아직 수치화할 수 없다. 관측 나이와 endpoint change rate만 직접 측정 가능하며 정확한 현재 게임 가격 대비 오차는 별도 ground truth가 없다.

추가 위험: metadata/상품 수명 변경, 발견 안 된 선수 및 result cap, 고정 표본의 선택 편향, Source 지연, 예산 부족, Reference 조건 미검증, 장기 worker 운영·알림·OS 재시작 미설치. 최적화만으로 120→14,976 격차가 해결된다고 주장하지 않는다.

## 24. Recommended Production Price Strategy

1. 당장은 한 중앙 worker/cron만 운영하고 기존 cap을 유지한다. Reference 우선, bounded 표본, adaptive eligible refresh와 Bootstrap을 공정 배분한다.
2. 고정 cohort 실험을 완료하고 2/4/6h 차이를 비교한다. 24h는 별도 장기 실험이 필요하다. 부족한 구간은 계속 INSUFFICIENT_DATA로 출력한다.
3. 매일 `prices:infrastructure`의 Coverage·median/P95·stale 수·backlog·HTTP 효율을 저장한다. 관측 나이가 목표보다 오래되면 “safe”만으로 정상 처리하지 않는다.
4. 완료 클래스 비용으로 discovery 모델을 보정한다. UI가 지원하는 다중 클래스 묶음은 정상 응답과 cap 처리를 검증한 후 별도 최적화한다.
5. Full reconciliation은 기존 120일 eligibility를 임시 유지하되 다음 운영 검토에서 비용·누락·Freshness로 재결정한다. 초기 Bootstrap을 무한 재시작하지 않는다.
6. 전체 24h 이하가 제품 필수 조건이면 공식 API의 제공 범위, 공식 허가/제휴 또는 허용된 대체 제공 방식을 우선 확인한다. 임의 rate 상향으로 해결하지 않는다.

## 25. Price Infrastructure Ready?

**NO — production freshness SLO 관점.** 안전한 수집·측정·실험·resume 기반은 있으나 4.22% DB Coverage, 약 223h median age, 미완료 multi-cycle 검증으로 전체 가격 최신성을 보장할 수 없다.

## 26. Ready to Resume Rank / Pack Opening Work?

**NO.** 가격 Coverage/Freshness 제약과 관측 주기 검증을 먼저 해결해야 한다. 기존 Reference/Rank 코드는 유지하고 실제 VERIFIED Snapshot 없이 기존 Rank 상태를 RESOLVED로 바꾸지 않았다. Pack Opening, Special Shop, Price Chart는 구현하지 않았다.
