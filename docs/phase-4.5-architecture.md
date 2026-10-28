# Phase 4.5 — 수집 구조와 운영

`jobs/price-collection` → `application/price-collection` → domain plan/coverage gate → DataCenterClient/parser → 기존 importPrices → PostgreSQL → 기존 Player API/UI.

계획은 현재 PlayerDataset과 실제 Phase 3 팩 ID를 고정하고 해시를 저장한다. TARGETED는 여섯 실제 순위 팩을 지원하며 기본 대상은 UC 750(+1~+7)이다. GENERAL은 명시한 1~10개 클래스와 +1~+13을 수집하도록 계획한다. 전체 88,359명 자동 실행은 없다. OVR/생성 제한 등 검증되지 않은 팩 조건은 unsupportedConditions에 남긴다.

검색 결과가 200개면 부모 가격을 입력하지 않고 OVR [min, mid], [mid+1, max]로 나눈다. 구간별 예상 수는 클래스 전체 metadata에서 알 수 있는 최초 구간에만 기록하고, 분할 후에는 null이다. metadata에 강화별 OVR을 추정해 넣지 않는다. 최종 SPID×강화 집합에 대해 누락·예상 외·중복을 비교한다. metadata 전체 확보와 실제 팩 자격 검증은 별도다.

PriceCollectionRun은 불변 plan/hash, 상태, lease를 저장한다. Segment는 범위/페이지/예상·실제 개수/HTML/hash/시각/원본 snapshot 링크를, Request는 각 HTTP 시도의 코드·시간·오류를 보존한다. Parser 오류는 segment.lastError에 남으며 HTTP 실패 건수와 별개다. 기존 PriceSourceSnapshot→PlayerPriceSnapshot→PlayerVariant를 재사용한다. 값은 Decimal(30,0)/BigInt/문자열이며 float로 변환하지 않는다.

응답을 먼저 저장하고 immutable import를 수행한다. 입력 후 checkpoint 전에 중단돼도 같은 HTML·관측 시각·run/segment로 같은 snapshot ID가 재생성되어 중복이 생기지 않는다. 완료 구간은 재요청하지 않는다. 글로벌 advisory lock과 30분 lease로 여러 프로세스의 동시 가격 수집을 막는다. 구간 시작마다 갱신하며 강제 종료 후에는 lease 만료 뒤 resume한다. 완료 run은 가격 요청 없이 기존 결과를 반환한다. BLOCKED는 자동 resume하지 않는다. 접근 정책을 검토한 후 허용되는 경우에만 새 실행을 만든다.

## 명령

```sh
npm run db:migrate
npm run prices:plan
npm run prices:plan -- --pack=official-pool-24987-v1
npm run prices:plan -- --seasons=877,866
npm run prices:collect -- --pack=official-pool-24987-v1 --max-segments=20
npm run prices:collect -- --max-segments=0 # 계획을 DB에 저장하고 PAUSED
npm run prices:collect -- --resume=<runId>
npm run prices:status -- --run=<runId>
npm run prices:collect -- --pack=official-pool-24987-v1 --window-only
```

`max-segments`는 실행당 구간 처리 예산(기본20, 범위0~100)이다. 각 HTTP 재시도는 별도 요청이므로 요청 상한은 구간 예산×(MAX_RETRIES+1), robots GET은 별도다. 분할 부모도 예산을 소모한다. 미완료 구간이 남으면 PAUSED다. 상태의 missingPrices는 현재 고정 metadata와 비교한 잔여 가격 수다.

|환경 변수|기본값|제약|
|---|---:|---|
|MAX_CONCURRENCY|1|현재 1만 허용|
|REQUEST_DELAY_MS|3000|1000~60000|
|REQUEST_TIMEOUT_MS|30000|1000~60000|
|MAX_RETRIES|2|0~3|
|RETRY_BACKOFF_MS|5000|1000~60000, 시도 횟수에 비례|

네트워크/5xx는 제한적으로 재시도하고 401/403/429는 즉시 BLOCKED다. 응답 body 중단은 실패 기록 후 명시적 resume 대상이다. HTML selector 변경, ID/강화 누락, 이름/metadata 불일치, 잘못된 정수, 0가격은 저장하지 않는다. 빈 결과의 공식 마크업은 검증하지 못했으므로 빈 shell도 실패 처리한다. 단일 OVR에서 200명 제한이 계속되면 다른 검증된 분할 축이 필요하다.

## 시각과 향후 스케줄

`--window-only`는 Asia/Seoul 00:00 이상 01:00 미만에서만 시작하고 매 가격 요청 직전에도 확인한다. 경계를 넘으면 PAUSED로 남긴다. 진행 중 응답이 01:00 이후 도착할 수 있으며 실제 완료 시각으로 저장한다. 시간대에 실행했다는 사실만으로 referenceAt을 확정하지 않는다.

로컬 스케줄러는 위 CLI를 KST 00:10에 실행하도록 연결할 수 있다. UTC 기준 시스템에서는 전날 15:10이다. 예를 들어 Asia/Seoul로 설정된 호스트의 cron `10 0 * * *`에서 프로젝트 디렉터리로 이동해 절대 경로 npm으로 `prices:collect -- --window-only`를 실행한다. 환경/PATH/DB 상태와 실행 로그를 확인해야 한다. 스케줄 설치나 무기한 수집은 이번 작업에 포함하지 않았다.

현재 collector는 관측값만 발행한다. 공식 시각·자격·동률 처리·후보 전체성을 검증한 별도 입력 없이 RankSnapshot을 생성하지 않는다. 완전한 검증 입력에서 기존 resolver의 TOP N 계산은 테스트했지만 실제 순위 snapshot 발행은 미완료다. 외부 자료의 의미가 검증되면 그 정책을 먼저 추가해야 한다.
