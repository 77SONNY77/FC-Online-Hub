# PHASE 4.7 COMPLETION REPORT

2026-09-26 KST. [실제 DB 감사](phase-4.7-audit.json) · [전체 Rank Reward 원문/정규화 목록](phase-4.7-rank-inventory.json).

## 1. Status

**PARTIAL.** Reference 계획·수집 연결·엄격한 검증·불변 Snapshot·순위 연결·상태 UI를 구현하고 검증했다. 하지만 실제 공식 Pack의 **VERIFIED Snapshot / Actual Player Pool은 아직 0개**다. 생성 제한/제외 선수와 정확한 공식 기준가를 확인할 근거가 부족하고 다음 관측 창이 아직 도래하지 않았다. Current Price로 대신 Resolve하지 않았다.

## 2. Rank Reward Inventory

기존 12개 표 / 1,208개 확률 항목 중 **6개 PLAYER_POOL 표, 1,195개 Rank 항목**을 추출했다. 나머지 13개는 BP 또는 중첩 보상 정의다.

| 공식 표 | 클래스 | 강화 | 표기 OVR 하한 | Rank 항목 |
|---|---|---|---|---:|
| [24962](https://iteminfo.nexon.com/probability/fco?sn=24962) | 26TOTS / 866 | +11 | 120+ | 135 |
| [24963](https://iteminfo.nexon.com/probability/fco?sn=24963) | 26TOTS / 866 | +10 | 120+ | 105 |
| [24964](https://iteminfo.nexon.com/probability/fco?sn=24964) | UC / 877 | +8~9 | 118+ | 60 |
| [24965](https://iteminfo.nexon.com/probability/fco?sn=24965) | UC / 877 | +11 | 119+ | 80 |
| [24966](https://iteminfo.nexon.com/probability/fco?sn=24966) | UC / 877 | +10 | 119+ | 65 |
| [24987](https://iteminfo.nexon.com/probability/fco?sn=24987) | UC / 877 | +1~7 | 별도 표기 없음 | 750 |

각 항목의 RewardDefinition ID, source URL/hash, 원문, rank, 공식 확률 문자열과 정수 numerator를 보존했다. 정규화는 원문을 덮어쓰지 않으며 class/enhancement/OVR/rank, reference rule, 생성 제한·제외·시간대·tie의 확인 상태를 별도로 담는다.

## 3. Official Rule Analysis

Reference 원문은 **“개봉일 0~1시 사이 기준가”**다. 구매일·상품 판매일·확률 페이지 날짜를 개봉일로 바꾸지 않는다. 공식 설명은 강화 가격에 따른 순위와 생성 제한으로 구성이 달라질 수 있음을 안내한다. 첫 표는 2026-09-26 웹 조회로 다시 확인했다. [공식 대상 표](https://iteminfo.nexon.com/probability/fco?sn=24987)

클래스와 강화 범위, TOP 상한은 확인했다. 다른 5개 Pack의 OVR 수치는 기록하지만 그것이 1강/강화 OVR/라이브 퍼포먼스 어느 기준인지 해당 근거만으로 확정하지 않았다. 생성 제한 전체 명단, 제외 조건, 전체 후보 universe, 동점 규칙은 NEEDS_VERIFICATION. 일반 metadata 등재·시장 가격 존재는 생성 가능/Pack 포함 증명이 아니다.

## 4. First Target Pack

**UC Top Price 750 (1~7강), `official-pool-24987-v1`.**

실제 상품 44699에 연결되어 있고 UC 단일 클래스, 강화 범위, rank 원문이 명확하다. 다른 표의 OVR 기준 문제를 먼저 풀 필요가 없으며 기존 UC 검색 partition을 재사용할 수 있다. 다만 OVR 표기가 없다는 사실이 모든 UC 선수가 생성 가능하다는 뜻은 아니다.

## 5. Reference Rule

구현 유형: `OPEN_DATE_WINDOW`. 공식 문구가 다른 FIXED / LATEST / OFFICIAL_SNAPSHOT 유형을 임의로 추가하지 않았다.

운영 관측 창은 **개봉 기준일 00:00 이상 ~ 01:00 미만, Asia/Seoul**이다. DB DateTime은 UTC로 저장한다. 다음 창은 **2026-09-27 00:00~01:00 KST = 2026-09-26 15:00~16:00 UTC**.

단, 해당 확률표 자체에 시간대와 실제 데이터 반영 시각이 명시적으로 증명되지는 않는다. `officialTimezoneVerified=false`, `referenceRuleVerified=false`를 유지했다. 이 시간대는 관측 준비 설정이며 공식 reference 인증이 아니다. [Data Center](https://fconline.nexon.com/datacenter)의 갱신/반영 지연과 선수별 시점 차이 때문에 그 시간 안에 HTTP 응답을 받는 것만으로 충분하지 않다.

## 6. Candidate Scope

- 클래스: **UC / 877**.
- 현재 metadata 선수: **113명**.
- 강화: +1, +2, +3, +4, +5, +6, +7.
- 관측 superset: **791 PlayerVariant 조합**.
- Source metadata는 기존 버전이다. 신규 선수/생성 제한 반영이 완전하다고 인증하지 않았다.
- `candidateScopeVerified=false`, `eligibilityVerified=false`. OVR 추가 필터나 추정 제외 선수 목록을 만들지 않았다.

Candidate ID 집합은 snapshot evidence에 고정한다. 저장된 조건 hash, 원문 source hash, metadata 버전, run의 frozen plan, 초기 query 및 split child 구조가 일치해야 publication gate를 통과한다.

## 7. Reference Collection Cost

| 항목 | 계획 |
|---|---:|
| 가격 POST | 1 |
| robots GET | 1 |
| 총 HTTP 추정 | **2** |
| 10초/request 지연 합계 | 20초 |
| timeout/retry 여유를 포함한 보수적 산정 | 200초 |
| 창 길이 | 3,600초 |
| 이번 Phase 실제 Reference HTTP | **0** |

기존 완료 UC partition을 재사용한다. 153개 클래스 전체를 요청하지 않는다. 현행 분 6 / 시간 60 / 일 120 / 실행 20 제한 안에 들어간다. 실행 직전에도 남은 시간·hour/day/run budget을 비교한다. 이후 cap/실패가 발생하면 split·중단 정책을 따르며, 속도 제한을 제거하지 않는다. 2회는 현재 113명과 알려진 partition에 따른 추정이며 미래 응답 크기의 보장은 아니다.

## 8. Snapshot

| 기준일 | 상태 | 후보 superset | 가격 관측 | Coverage |
|---|---|---:|---:|---:|
| 2026-09-26 | **MISSED** | 791 | 0 | 0% |
| 2026-09-27 | **PLANNED** | 791 | 0 | 0% |

두 snapshot 모두 NEEDS_VERIFICATION / UNRESOLVED. VERIFIED는 0이다. 오늘 지나간 시간대를 현재 데이터로 채우지 않았다. 내일 계획 run ID: `cmuhvq9bx0000tyy6mn8xtabo`.

Snapshot ID는 감사 JSON에 있으며 날짜·조건 hash·metadata 버전으로 구분한다. 같은 계획을 재등록하면 기존 snapshot을 반환한다. 상태는 PLANNED / COLLECTING / INCOMPLETE / MISSED / UNRESOLVED / VERIFIED. 수집 전체가 끝나도 공식 조건이 미확인이면 UNRESOLVED다.

## 9. Completeness

예정 계획: **1개 query**, 완료 0 / 실패 0 / 미처리 truncation 0. 미관측 조합 791개이며, 아직 실제 응답에서 Missing으로 발견된 791개라는 뜻은 아니다.

검증은 전체 후보 ID와 유효 가격 행의 일치, 중복 없음, 모든 root query 존재/일치, split child 완전성, 미처리 실패·cap 없음, 조건/source/dataset binding을 요구한다. 한 후보라도 빠지면 VERIFIED 금지. 여러 날짜의 최신 가격을 합치지 않는다. Raw response와 source observation 연결은 기존 Collector 증거를 사용한다.

## 10. Ranking

실제 Rank Entry: **0**. 실제 tie count / cutoff tie: **미측정**.

완전하고 검증된 후보에 대해서만 BP 정수값 내림차순으로 순위를 확정한다. `spid ASC` 등의 공식 근거 없는 tie-breaker는 쓰지 않는다. TOP cutoff tie뿐 아니라 표가 개별 rank에 확률을 부여하므로 다른 rank tie도 보수적으로 NEEDS_VERIFICATION 처리한다. 동일 reference instant가 없는 혼합 값도 거부한다.

## 11. Resolution

실제 Rank 항목 **Resolved 0 / Unresolved 1,195**. 기존 5개 고정 BP 항목의 resolution과 중첩 보상 상태는 유지한다.

기존 `resolutionCoverage`와 `PlayerPriceRankSnapshot / PlayerPriceRankEntry`를 재사용한다. VERIFIED + RESOLVED, 같은 pool/date/condition 버전의 유일한 snapshot만 연결한다. 충돌한 snapshot은 임의 최신 선택하지 않는다. 공식 확률은 그대로이고 rank가 `SPID + enhancement`에 연결된다.

## 12. Example Resolved Players

**실제 예시 없음.** 아직 공식 VERIFIED Pool이 없으므로 Current 순위나 합성 fixture 선수를 실제 보상 예시로 제시하지 않는다. 합성 Fixture는 전용 테스트 DB의 rollback-only transaction에서만 VERIFIED 경로를 검증했다.

## 13. Current vs Reference

Current Price / Price History는 기존 방식으로 유지한다. Reference publication은 해당 run의 성공 segment에 연결된 역사 관측만 조회한다. Current 테이블을 후보 가격으로 사용하지 않는다.

가격의 `referenceAt`이 null이거나 verification이 부족하면, `observedAt`이 창 안이어도 거부한다. 기존 Data Center adapter는 지금도 authoritative referenceAt을 만들어내지 않는다. 따라서 실제 공식 reference feed/evidence를 확보하기 전에는 이 collector의 관측만으로 publication이 불가능하다. 검증 강제 CLI는 제공하지 않는다.

Simulator 정책은 **사용자가 조회한 명시적 기준일의 VERIFIED snapshot만 사용**하는 것이다. 날짜 미지정 화면의 오늘 날짜는 조회 기본값이며 구매일/실제 개봉일의 공식 의미를 재정의하지 않는다. 다른 날의 최신 VERIFIED나 Current로 조용히 대체하지 않는다.

## 14. Snapshot Immutability

DB trigger가 VERIFIED snapshot의 UPDATE/DELETE와 연결 rank entry의 INSERT/UPDATE/DELETE를 거부한다. Publication은 후보 검증 → rank entries 작성 → VERIFIED 전환을 하나의 transaction으로 수행한다. 기존 price history의 observation ID에 연결하며 Current를 갱신해도 재정렬되지 않는다.

통합 검증: 완전한 합성 snapshot 생성, 정확한 variant/source link, Current 가격 변경 후 기존 rank 유지, 부모/entry 수정 거부 PASS. 합성 기록은 테스트 종료 시 transaction rollback으로 사라지며 개발 DB에는 넣지 않았다.

## 15. Scheduler Integration

중앙 `prices:sync`가 명시적으로 예약한 due Reference를 가장 먼저 선택한다. 일반 sync cooldown은 Reference를 막지 않는다. 다음 순서는 HOT → Bootstrap → Reconciliation → WARM/COLD로 유지한다. source lock·persistent ledger·circuit·kill switch·pause는 공유한다.

Reference run은 저장된 날짜의 window 시작/종료를 매 요청 전 검사한다. window를 넘겨 다른 날 재개하지 않는다. tick에서 지난 계획을 MISSED/INCOMPLETE로 마무리한다. 시간 또는 예산이 부족하면 수집하지 않는다. 진행 중 batch는 기존 시간대 검사에서 경계에 중단되며 새로운 collector를 병렬 실행하지 않는다.

```sh
npm run prices:reference -- inventory
npm run prices:reference -- plan --date 2026-09-27
npm run prices:reference -- schedule --date 2026-09-27
npm run prices:reference -- status --date 2026-09-27
# 해당 창에서 중앙 job 실행; 강제 날짜 조작/현재 가격 복원 없음
npm run prices:sync
npm run prices:reference -- finalize --snapshot <snapshot-id>
```

OS cron은 설치하지 않았다. 등록은 DB 계획이며 자동 실행 프로세스가 생긴 것이 아니다. `PRICE_SYNC_REFERENCE_ENABLED=true`는 기본 pack의 당일 계획 자동 생성을 위한 설정이다. 명시적으로 schedule한 계획은 별도로 due queue에 들어간다. 수집 전체 중지는 기존 `prices:control disable` 또는 `PRICE_COLLECTION_ENABLED=false`를 사용한다.

## 16. Existing Price Operations

Bootstrap **3.06%, 17/153 classes**, 전체 priced players **2,977명**, Current **38,701행**, History **42,127행** 유지. 이번 Phase에서 전체 시장 확대 요청은 하지 않았다.

`prices:sync`, `prices:bootstrap`, `prices:reconcile` 및 저요청 운영 전략은 유지한다. 실제 DB planner는 창 밖에서 HOT_SYNC를 다음 작업으로 선택한다. 현재 관측은 오래되어 감사 시 fresh 0 / stale 38,701이다. 자동 worker를 설치하지 않은 상태이므로 DB에 job 구현이 있다는 사실만으로 상시 최신화를 주장하지 않는다. 사용 중인 cron/worker 또는 수동 CLI가 실행해야 갱신된다.

## 17. Probability Integration

12개 표 / 1,208개 항목의 공식 문자열·numerator·rank·수량을 변경하지 않았다. 전후 전체 ProbabilityEntry 직렬화 SHA-256이 같다:

`7540f6601d9e7024b0eea6ec5ecc07454624d06a0f1a1e7a056c56505e2f3725`

확률표의 TOP 링크가 날짜/rank를 전달한다. VERIFIED Pool이 있으면 동일 rank의 immutable PlayerVariant와 source observation을 표시한다. 확률 재정규화나 별도 enhancement 추첨은 없다.

## 18. UI

`/items/official-item-24987-v1/rank-pool?date=2026-09-26&rank=1`

표시: 기준일/시간대, 수집 시작·완료, 후보 수/가격 확인 수/Coverage, status/verification, 공식 원문, 출처, condition/dataset/snapshot 버전. VERIFIED가 없으면 “선수 구성 미확정”과 미수집 상태를 표시한다. 잘못된 날짜는 거부한다. 실제 선수는 VERIFIED에서만 링크하며 일반 목록은 상위 50개, 개별 TOP 링크는 해당 rank를 조회한다.

브라우저에서 실제 상품 → UC 750 구성품 → 확률표 → TOP 1 → 날짜별 Snapshot 상태까지 확인했다. 과거 날짜에 Current가 있어도 선수 Pool로 표시하지 않는다. 개봉·가격 차트·실시간 시세 표기는 추가하지 않았다.

## 19. Tests

- **Unit 124 PASS**: KST 날짜 경계/자정 00:00 표시, complete deterministic ranking, wrong time, mixed reference time, Current 대체 거부, failed/truncated/incomplete, tie/cutoff tie, eligibility/scope/partition, player+enhancement.
- **Integration 73 PASS**: Snapshot publication fixture, immutable DB guards, Current 변경 독립성, 미관측 창 MISSED, Reference 우선순위와 cooldown 예외, 확률 원문 보존.
- **기존 Price Sync Regression PASS**: Current/History, HOT/Incremental 계획, Bootstrap/Resume, shared budget, 403/429/security circuit, kill switch, 사용자 요청 격리.
- **E2E 72 PASS**: desktop/mobile/tablet의 기존 69개 + 실제 UC 750 Snapshot 조회 3개. 충전→구매→Inventory→Reward Tree/Probability→Players 회귀 포함.
- 기존 5xx retry 테스트는 실행 시간에 따라 999/1000ms로 달라지는 잔여 지연 대신 실제 adaptive backoff 2,000ms를 검증하도록 바로잡았다. Collector 속도 정책은 바꾸지 않았다.
- 실제 공식 VERIFIED end-to-end는 **미달성**. 합성 fixture 성공과 구분한다.

## 20. Build Verification

`npm run build`, `npm run typecheck`, `npm run lint`, `npm test` 모두 **PASS**. 추가 migration `202609260001_reference_snapshots`를 개발 DB와 전용 테스트 DB에 적용했다. 기존 Price/Probability 행은 보존했다. Snapshot rank 조회는 기존 `(snapshotId, rank)` unique index, due 조회는 `(windowStart, status)` index를 사용한다.

## 21. Remaining Unknowns

1. 공식 생성 제한/제외 명단과 해당 날짜의 완전한 Candidate universe.
2. 웹 관측값을 개봉일 기준가로 인증할 수 있는 authoritative timestamp / snapshot source. Source response Date는 사용할 수 없다.
3. 공식 시간대 명시, 선수별 갱신 차이·페이지 지연을 포함한 reference coherence.
4. 동점 처리와 각 rank의 정확한 대응. 생성 제한 때문에 표의 후보 수가 바뀌는 경우의 버전 갱신.
5. 다른 5개 pack의 OVR 기준. 기존 metadata의 최신성 및 새 선수 반영.
6. 내일 관측 창의 실제 실행과 응답 완전성. 수집에 성공하더라도 위 조건이 해결되지 않으면 UNRESOLVED를 유지한다.

안전한 다음 단계는 예약 창에서 중앙 job으로 관측을 확보하면서, 공식 eligibility/reference evidence를 별도로 확인하는 것이다. 그 근거를 얻을 수 없으면 검증을 완화하지 않는다.

## 22. Ready for Pack Opening?

**NO.** 실제 Rank-based Pack의 VERIFIED Reference Snapshot과 Actual PlayerVariant Pool이 아직 없다. 정확한 조건·공식 기준가·순위가 확보되기 전에는 RNG를 연결할 수 없다. Pack Opening은 구현하지 않았다.
