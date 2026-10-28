# Phase 4.6 — Full Market Database

Full Market은 현재 공식 Data Center에서 조회 가능한 선수의 표시된 강화별 가격이다. metadata88,359개가 전부 현재 등재된다고 가정하지 않는다. plan은153개 클래스 전부를 고정하며 아직 조회하지 않은 선수는 unchecked다. 완전하게 검색한 클래스에서 발견하지 못한 metadata 선수는 해당 run의 NOT_LISTED 집계에 포함한다. 이는 게임 삭제나 거래 불가를 단정하지 않는다.

## 재사용과 확장

Phase4.5 client/parser/collector/checkpoint/importer를 재사용했다. FULL mode와 plan/audit/status job을 추가했다. 기존 targeted 명령과 안전한 엄격 파싱은 유지한다. FULL은 확인된 빈 결과 마크업을 인식하고, 실제 가격 칸의 '-'는 NOT_AVAILABLE로 기록한다. selector 누락은 PARSER_FAILURE 계열 segment 오류이고 네트워크 오류는 REQUEST_FAILURE 계열이다. 둘 다 가격 없음으로 바꾸지 않는다. 가격으로 검증한 조합만 PlayerVariant를 생성한다. 0강은 공식 UI에 있으나 fixture상 '-'이며 price model에는 양수 가격이 검증된1~13강만 입력한다. 향후0강 실제 양수 값이 발견되면 현재 입력은 실패하며 공식 의미 및 제약을 검토해야 한다.

DB에 Segment.result JSON(playerIds, missing reason)을 추가했다. 원문/hash/시각/상태는 이전 모델에 남는다. run은 전체 Market Snapshot manifest 역할도 한다. 상태 조회는 DB 가격 행·요청 행·구간 결과로 집계한다. 전체 완료가 아닐 때 collectionCompletedAt은 null이다. 시작 시각은 resume해도 덮어쓰지 않는다. 각 가격의 observedAt을 유지하므로 전체를 같은 순간 가격이라고 표현하지 않는다.

HTTP 성공이어도 parser 실패할 수 있다. successfulRequests는 HTTP 성공 수이고 failedSegments는 파싱/저장 실패를 포함한다. checkedPlayers는 성공한 leaf에서 식별·파싱한 선수다. metadataPriceCoverage는 전체metadata 대비 가격 확보 선수 비율이며 현재 등재 시장의 분모와 다르다. total valid variants는 미완료 시 알 수 없고 validPricedVariants는 관측된 양수 가격 조합만 센다. 0강 포함 checked variants와 가격 미표시 수도 별도로 제공한다.

## 분할·중복·복구

200명 이상 결과를 완료 처리하지 않는다. 부모는 SPLIT이며 가격은 입력하지 않는다. OVR 정수 구간을 겹치지 않게 이분한다. 구간별 조회 결과와 알려진 예상 수를 기록한다. leaf 반환이 겹치면 run 중복을 탐지해 전체 완료를 막는다. 단일OVR200명은 UNSPLITTABLE_RESULT_CAP이다. 페이지2/임의 가격/포지션 필터는 검증 전 사용하지 않는다.

FULL에서 일반 구간 실패는 기록하고 다음 pending 구간을 처리한다. 401/403/429·보안 화면은 전체 중단한다. resume은 성공 구간을 건너뛰고 FAILED/RUNNING만 pending으로 돌린다. 저장된 HTML이 있으면 원래 관측 시각으로 재검증하므로 checkpoint interruption이 새 역사 관측값을 만들지 않는다. 신규 run의 다른 시각에 동일 가격이 나오는 것은 새로운 이력이다. 재시도 시 구조 변경 오류가 반복되면 parser/자료 검토가 필요하며 자동으로 정상 가격을 만들지 않는다.

## Current Price와 인덱스

History가 source of truth다. 기존 Player UI/API는 variantId+observedAt 인덱스 기반 최신1행 쿼리로 즉시 반영한다. 별도 `PlayerPriceCurrent` materialized view는 전역/단일·다중 클래스 순위 분석용이다. variantId unique, enhancement+price, seasonId+enhancement+price 인덱스를 추가했다. view에는 variant당 최신 official/non-rejected 관측값1행만 있다. `currentMarketRanking`은 Decimal을 문자열로 반환하고 verifiedRewardRank=false다. OVR 추정 필터는 제공하지 않는다.

FULL 수집 배치 종료 때 view를 refresh한다. 다른 importer로만 데이터를 추가했다면 refresh 전 view는 이전 분석 시점이고 Player API는 최신이다. 이는 materialized projection이며 독립 가격 원장이 아니다. 필요시 `REFRESH MATERIALIZED VIEW "PlayerPriceCurrent"`로 갱신한다. 과거 자료를 입력할 때도 최신 observedAt이 우선이다. bulk createMany로 가격/variant 입력을 줄였고 snapshot 하나는 한 transaction으로 입력한다.

API의 기존 freshness는 공식 reference 시각 검증 기준을 유지한다. 추가 observationFreshness는 PRICE_FRESH_HOURS(기본24)로 수집 시점의 최신성을 계산한다. 관측 FRESH가 공식 기준 시각 VERIFIED라는 의미는 아니다. 기존 UI는 마지막 확인 시각과 미확인 기준 시각을 계속 표시한다.

## CLI와 운영

```sh
npm run db:migrate
npm run prices:plan:full -- --output=.local/full-plan.json
npm run prices:collect:full -- --max-segments=20 --output=.local/full-batch.json
npm run prices:collect:full -- --resume=<runId> --max-segments=20
npm run prices:status:full -- --run=<runId> --output=.local/full-status.json
```

plan은 DB만 읽는 dry run이다. 모든 클래스/강화/전체 OVR 범위/중복을 검사한다. 이미 최근 관측된 조합을 계산하지만 완전한 run snapshot을 위해 freshness로 임의 skip하지 않는다. valid variant는 추정 생성하지 않는다. 구간 예산은0~100, 기본20이다. retry는 별도 요청이라 실제 요청 수는 더 클 수 있다. run이 PAUSED면 이어서 실행할 수 있다. 실패/미처리 구간이 있는 run은 COMPLETE가 아니다. lease는30분이며 강제 종료 후 만료를 기다려 재개한다.

동시성1, 최소3초 기본간격, timeout30초, retry2, backoff5초다. network/5xx가 발생하면 지연 배수를 최대8까지 늘리고 성공 시 점진적으로 줄인다.429는 재시도 없이 중단하여 rate limit을 존중한다. REQUEST_DELAY_MS/MAX_RETRIES/RETRY_BACKOFF_MS 등 기존 설정을 유지한다. stdout에는 run ID와 결과, DB에는 각 요청/구간 상태를 남긴다.

전체 수집은 여러 시간대의 관측 묶음이며 별도 targeted `--window-only` reference 연구와 구분한다. 자동 스케줄은 설치하지 않았다. 전체 비용/성공률이 검증되기 전 매일 무제한 반복하지 않는다. raw HTML·가격 history를 이번 Phase에서 삭제하지 않는다. 향후 raw 보존 기간, 일별 집계, 오래된 관측 압축은 증거 보존 요건과 함께 별도 결정한다.
