# Phase 4.6B — 안전한 중앙 수집과 갱신 운영

## 감사와 공식 근거

기존40가격 요청은 클래스 검색→최대200명 cap→OVR 이분 구간을 처리해1,376명×13강화17,888가격을 확보했다.한 요청에 최대199명의 완전한 leaf를 입력하고, cap부모는 분할용이므로 실제 평균은34.4명/447.2가격이었다. 개별 상세 요청을 하지 않는다. 원문 HTML을 먼저 checkpoint하고 성공leaf를 재개 시 건너뛴다.

2026-09-21 공개 [Data Center](https://fconline.nexon.com/datacenter) 안내를 다시 읽었다. 사이트 집계는 약2시간 간격이며 반영 지연과 선수별 갱신 차이가 있다. 홈페이지 갱신·게임 가격 변화·우리 관측 주기는 별개다. 이번 root HTML은 Cache-Control private, ETag/Last-Modified/Age 없음, Date는 HTTP 응답 시각이었다. Date와 응답 해시를 시장 버전으로 쓰지 않는다. 신뢰할 전역 market-version/cheap change-check endpoint는 확인하지 못했으며 전체시장 SKIP_UNCHANGED를 구현했다고 주장하지 않는다.

[robots](https://fconline.nexon.com/robots.txt)는 실행마다 예산을 사용해 읽는다. 조사 때 해당 Data Center disallow는 없었다. [넥슨 약관](https://member.nexon.com/policy/stipulation.aspx)의 무단 복제/배포/영리 이용·서비스 방해 관련 제한은 그대로 유효한 검토 대상이다. 공개 Data Center별 자동 수집 허용량은 확인하지 못했다. **No explicit safe request rate confirmed.** 차단되지 않은 실측은 허가가 아니다. 다른 게임의 rate/운영 정책을 FC Online에 적용하지 않는다. 차단 임계값 스트레스 테스트는 하지 않았다.

## 중앙 보호 장치

모든 온라인 가격 CLI(기존 data:prices 포함)는 safeCollect→CollectorSafety→DataCenterClient를 이용한다. metadata API는 다른 데이터 원천이다. legacy data:prices --offline은 기존 capture를 로컬 import한다. 사용자의 Player UI/API는 PostgreSQL만 조회하며 cache miss도 외부 요청하지 않는다.

DB PriceCollectorState는 원천별 enabled/lease/circuit/failure state를, Execution은 runId/reason/start/end/stopReason을, Request는 HTTP 예약/종료/status/제한된 응답헤더를 저장한다. Header는 ETag, Last-Modified, Cache-Control, Age, Date, Retry-After만 기록하고 cookie/auth를 저장하지 않는다. Full manifest와 CLI execution을 구분하므로 같은 run을 예산 단위로 재개할 수 있다.

reservation은 DB advisory lock 안에서 분/시간/일/실행 횟수를 원자적으로 검사한다. **HTTP를 보내기 전에** quota를 차감하며 robots GET과 재시도도 포함한다. 예약 직후 crash는 보수적으로 예산을 소비한 것으로 남긴다. 재실행은 rolling global usage를 초기화하지 않는다. 이전에 저장된 가격 요청41회도 migration으로 backfill했다. 과거에 저장하지 않았던 robots·브라우저 연구 요청은 소급 추측하지 않는다.

한 원천에 하나의 실행만 lease를 얻는다. 이 lock은 robots 이전에 획득하며 기존 run lease도 유지한다. global delay는 마지막 DB 예약 시각을 기준으로 재실행 사이에도 적용한다. 기본10초/분6회/시간60회/일120회/실행20회/동시성1은 **자체 제한**이다. 공식 안전률이라는 주장이 아니다. config는 .env.example에 설명되어 있다.

401/403/429·보안/점검 화면은 첫 발견부터24시간 회로를 연다. 일반5xx/network/비정상 empty/parser 오류는 누적3회에 회로를 연다. 정상 파싱 구간에서 연속 실패 수를 초기화한다. client의 adaptive backoff도 유지한다.새 실행은 열린 circuit을 우회하지 못한다. cooldown 후에도 자동 스케줄이 없으므로 명시적 실행이 필요하다. enable 명령은 circuit을 지우지 않는다.

`PRICE_COLLECTION_ENABLED=false`는 매 요청 전에 환경 및 .env에서 다시 읽는다. 실행 중에도 `prices:control -- disable`로 DB kill switch를 바꿀 수 있다. 이미 전송된 HTTP는 timeout 범위에서 종료되고 다음 요청은 나가지 않는다. read 실패(ENOENT 제외)는 disabled로 처리한다. 이미 시작한 요청을 취소 완료했다고 주장하지 않는다. 강제 종료 후30분 lease 만료가 필요할 수 있다.

## 세 가지 목적

FULL_BUILD: initial build/recovery/reconciliation. 기존 run resume를 사용하며 성공 구간을 다시 요청하지 않는다. 배치당 max-segments와 별도로 HTTP20회 cap이 적용된다. 00~01KST에는 일반 실행을 시작/계속하지 않아 reference 작업을 우선한다.

INCREMENTAL_REFRESH: 실제 published product의 도달 가능한 여섯 팩 정의에서 클래스866/877을 HOT으로 선정한다. 공식 자격이 검증됐다는 의미는 아니다. 최근 source metadata만 사용한다. 관측된 Current projection의 최대 가격 상위2클래스를 WARM 후보로 하며 HOT이 우선한다. 그 외는 COLD다. 전역 인기, 사용자 조회, volatility를 가짜로 만들지 않는다. 현재 과거 관측 집합의 고가 신호이며 시장 전체 고가 순위가 아니다.

HOT6시간, WARM48시간, COLD336시간(14일)이 기본이다. 이미 클래스 전체를 덮는 성공leaf partition을 재사용하고 그 중 가장 오래된 관측 시각으로 stale 여부를 판단한다. HOT→WARM→COLD, 같은 tier에서는 오래된 데이터 먼저다. 아직 초기 수집이 끝나지 않은 비-HOT클래스는 FULL_BUILD로 넘겨 중복 initial crawl을 피한다. 이들의 향후 완전 갱신 비용은 모델에 포함하되 당장 due 요청으로 만들지 않는다. 실행 계획의 segment priority는 DB에 보존하고 분할 자식에게 상속한다.

각 알려진 leaf에서 연속2개의 비교 결과가 new=0, changed=0이면 비-HOT의 다음 간격을2배로 늘린다. 모든 leaf가 해당하는 경우 클래스 우선 갱신을 늦춘다. Full reconciliation은 이 규칙을 무시한다. 정책은 .env.example에 있으며 지연보다 더 빠른 source polling을 기본값으로 두지 않는다.

REFERENCE_SNAPSHOT: `prices:collect:reference`는 특정 실제 pack plan을 사용하며 00~01KST에만 요청한다. 일반 fresh-cache와 구분한다. SOURCE의 실제 reference 의미를 아직 확인하지 못했으므로 수집 결과 referenceAt은 null이며 관측값이다. Mode 명칭만으로 VERIFIED RankSnapshot을 생성하지 않는다.

## 캐시와 이력

INCREMENTAL planner는 fresh 완료 클래스에 요청을 만들지 않는다. MANUAL은 동일metadata·클래스·OVR·강화 범위의2시간 이내 성공 쿼리가 모두 있으면 FRESH_QUERY_CACHE로 PAUSED하여 새 HTTP/가격 행을 만들지 않는다. 이는 local query cache이며 시장 전체가 변하지 않았다는 선언이 아니다. FULL initial/reconciliation과 REFERENCE는 의도상 별도 정책이다.

각 수집 구간에는 이전 관측과 비교한 new/changed/unchanged 수를 저장한다. checkpoint 재실행 시 비교 결과를 재사용한다. 단순 full/heartbeat 실행의 다른 시각 동일 가격은 보존하며 unique(snapshot,variant)는 중복 import를 막는다. 정상적인 fresh skip으로 불필요한 repeated current refresh/history 입력을 먼저 피한다. 변경하지 않은 값의 더 오래된 관측은 heartbeat 증거로 남긴다. 향후 changed-only + lastSeen heartbeat + daily checkpoint 압축은 원문/시각 보존 조건을 검토한 별도 migration으로 진행한다. 이번에 이력을 삭제/공격적으로 압축하지 않았다.

Current materialized projection은 완료된 가격 배치 이후 refresh하고 일반 Player API의 indexed latest는 source of truth인 history를 읽는다. 같은 current 값이라도 관측 시간은 갱신될 수 있다. fresh skip에는 refresh가 없다. observationFreshness와 official reference freshness는 별개다.

## 명령

```sh
npm run prices:cost                         # DB 기반 전체/증분 비용·예산/coverage
npm run prices:plan:full                    # HTTP 없는 full dry run
npm run prices:collect:full -- --resume=<fullRunId> --max-segments=100
npm run prices:status:full -- --run=<fullRunId>
npm run prices:plan:incremental
npm run prices:collect:incremental
npm run prices:collect:incremental -- --resume=<incrementalRunId>
npm run prices:collect:reference -- --pack=official-pool-24987-v1
npm run prices:control -- status
npm run prices:control -- disable
npm run prices:control -- enable
```

max-segments100은100개의 HTTP를 허용하는 옵션이 아니다. 기본 per-execution20(robots 포함)에 먼저 멈춘다. 예산 소진은 REQUEST_BUDGET_EXHAUSTED로 pending을 유지한다. 미완료 클래스와 estimated remaining requests는 prices:cost에서 확인한다. 추정 비용은 완료 클래스 실측과 metadata 기반 분할 모델을 결합하며 전체 정확한 요청 수는 분할을 끝내기 전에는 알 수 없다.

자동 cron/무기한 수집은 설치하지 않았다. 초기 Full Build를 이어가되 일일 예산에서 HOT/reference 예약량을 남긴다. 구축 후 일반 운영은 incremental이며 full every2h는 사용하지 않는다. 14일 cold reconciliation도 모델 오차로 예산 안에 끝나지 않을 수 있으므로 backlog와 실제 changed/request 지표를 보고 주기를 늘린다.
