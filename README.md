# FC LAB — FC Online Shop Simulator

Phase 4.7P: **선수 가격 Coverage + Freshness가 최우선**입니다. 관측 나이·클래스별 실제 비용·고정 표본·공정 배분·metadata 체크포인트 갱신을 추가했습니다. 전체 시장 SLO는 아직 검증되지 않아 **PARTIAL**이며 Rank/Pack Opening 확장을 보류합니다. [가격 인프라 보고서](docs/phase-4.7p-report.md).

Phase 4.7: **Reference-time Snapshot · Rank Reward 검증 · 기준일별 조회 화면**을 추가했습니다. 6개 Rank 표/1,195개 Rank 항목을 정리했고 Snapshot 불변성·완전성·시간·동점 검증을 구현했습니다. 실제 공식 VERIFIED Pool은 아직 없어 **PARTIAL**, Pack Opening은 미구현입니다. [22개 항목 완료 보고서](docs/phase-4.7-report.md).

Phase 1~3의 공식 상품 1종·아이템 13종·확률 항목 1,208개와 개발용 상품 3종을 유지합니다. 로그인 없이 FC 0에서 시작해 무료 충전 → 가상 구매 → 인벤토리 → 초기화를 체험합니다. 개봉과 랜덤 추첨은 구현하지 않았습니다.

## Requirements

- Node.js 20.19 이상 (검증 환경: 20.20.2), npm
- PostgreSQL 18 또는 Docker Compose
- 버전은 `package.json`과 `package-lock.json`에 고정되어 있습니다.

## Install & environment

```sh
npm ci
cp .env.example .env
npm run db:generate
```

`.env`의 `DATABASE_URL`을 본인의 개발 DB에 맞게 설정하세요. `NEXON_API_KEY`는 현재 사용하지 않습니다. HTTPS 프록시 배포에서는 `APP_ORIGIN=https://서비스도메인`을 설정하세요(끝 슬래시 없이). 로컬에서는 생략합니다. 비밀값을 `NEXT_PUBLIC_` 환경변수나 저장소에 넣지 마세요. `.env*`, `.local/`은 Git에서 제외됩니다.

## Database setup

Docker가 이미 실행 중이라면 다음 예시는 로컬 포트 `55432`에 DB를 구성합니다. Compose 예시 비밀번호는 개발 전용이며 운영에 사용하지 마세요.

```sh
POSTGRES_PASSWORD=fco_local_dev docker compose up -d db
npm run db:migrate
npm run db:seed
```

`.env.example`은 위 Compose 설정과 연결됩니다. 기존 PostgreSQL을 사용하는 경우 별도 개발 데이터베이스를 만들고 `DATABASE_URL`을 바꾸면 됩니다. 애플리케이션이 DB를 자동 생성하거나 Mock 데이터로 실패를 숨기지 않습니다.

이 작업 환경에서는 기존 PostgreSQL 실행 파일로 프로젝트 `.local/postgres`에 격리된 클러스터를 만들었습니다. 시스템 서비스나 Docker 설정은 바꾸지 않았습니다. 재시작/중지는 다음과 같습니다.

```sh
pg_ctl -D .local/postgres -l .local/postgres.log -o '-p 55432 -h 127.0.0.1 -k /tmp' start
pg_ctl -D .local/postgres stop
```

이 클러스터는 이 컴퓨터에만 있으며 저장소에 포함되지 않습니다. 다른 개발자는 Compose 또는 자신의 PostgreSQL을 사용하세요. Compose와 로컬 클러스터를 같은 포트에서 동시에 실행하지 마세요.

Seed는 검증 후 하나의 트랜잭션으로 입력하며, 기존 데이터셋 버전은 덮어쓰지 않습니다. 다시 실행해도 상품이 중복 생성되지 않습니다. 변경할 때는 새 버전의 데이터셋·아이템·상품 ID를 사용합니다. 전체 seed는 개발용 카탈로그 → 공식 단위 기반 FC 옵션 → 검증된 공식 상품/보상 정의 순서로 실행됩니다. 각 단계는 독립 트랜잭션입니다. 공식 데이터셋은 원문 해시와 전체 보상 그래프를 검증하고, 같은 버전의 내용이 바뀌면 덮어쓰지 않고 거절합니다.

## Development / production build

```sh
npm run dev
# http://127.0.0.1:3000
npm run build
npm run start
```

DB가 없어도 build는 가능하지만, 실행 중 상품 API는 503과 사용자용 오류 상태를 반환합니다. 정적 Mock fallback은 없습니다.

## Tests

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit/API 테스트는 DB 없이 실행합니다. E2E는 마이그레이션·전체 seed·공식 선수/가격 import가 적용된 **개발 DB**에서 격리된 브라우저 상태를 생성하고 충전·구매 기록을 쓰며 `43181` 포트에서 production 서버를 실행합니다. desktop / tablet / mobile Chromium을 검사합니다. 원격 운영 DB를 테스트에 연결하지 마세요. 브라우저는 처음 한 번 설치해야 합니다.

E2E 범위: 기존 카탈로그 회귀 + FC 0 → 반복 충전 → 수량 구매 → 인벤토리 → 새로고침 → 초기화, 중복 클릭, 응답 유실 후 재시도, 쿠키 복원, 브라우저 간 격리, 탭 간 갱신, 요청 변조/출처 검사. 오류 테스트는 네트워크를 의도적으로 실패시킵니다.

PostgreSQL 통합 테스트에는 이름이 `_test`로 끝나는 별도 DB가 필요합니다. `.env.test`의 `TEST_DATABASE_URL`을 설정하세요. 해당 DB를 생성한 다음 동일 URL을 `DATABASE_URL`에 임시 지정해 migration/seed를 적용합니다. `.env`를 덮어쓰지 않습니다.

```sh
# 예: fco_phase2_test DB를 먼저 생성한 뒤
DATABASE_URL='postgresql://fco:fco_local_dev@127.0.0.1:55432/fco_phase2_test?schema=public' npm run db:migrate
DATABASE_URL='postgresql://fco:fco_local_dev@127.0.0.1:55432/fco_phase2_test?schema=public' npm run db:seed
# .env.test: TEST_DATABASE_URL="위 URL"
npm run test:integration
```

통합 테스트는 자신이 만든 데이터만 정리합니다. 개발/운영 DB를 초기화하는 테스트는 없습니다.

## Routes / APIs

- `/`: 최소 상점 링크
- `/shop` 또는 `/shop?mode=official`: 공식 상품 1종 (기본 화면)
- `/shop?mode=mock`: 개발용 상품 3종
- `/shop/product/[id]`: 직접 접근 가능한 상세 및 가상 구매
- `/shop/fc`: 무료 가상 FC 충전
- `/inventory`: 공식/개발용 보유 아이템·획득 경로·초기화
- `/items/[id]/probabilities?page=1`: 아이템 버전의 공식 확률표 (50개씩 조회)
- `GET /api/products?mode=mock|official|reference`: 출처 구분 목록
- `GET /api/products/[id]`: 상세·중첩 보상 트리·확률 요약·필드 검증·출처 metadata
- `GET /api/items/[id]/probabilities?page=1`: 아이템 버전별 확률 원문·정수 비율·조건·출처·페이지 정보
- `POST /api/playground`: 보이지 않는 브라우저 상태 준비 (최초 FC 0)
- `GET /api/wallet`: 현재 FC·초기화 세대·구매 수량
- `GET /api/fc/options`: 활성 충전 옵션과 출처
- `POST /api/fc/charges`: 옵션 ID로 충전
- `POST /api/purchases`: 상품 ID와 수량으로 구매
- `GET /api/inventory`: 현재 보유 구성품과 획득 경로
- `POST /api/playground/reset`: FC·보유품·현재 구매 수량 초기화

변경 API는 동일 출처 JSON 요청만 받습니다. 충전/구매/초기화에는 `Idempotency-Key` UUID와 현재 `epoch`가 필요합니다. 재시도는 같은 키·본문, 새로운 행동은 새 키를 사용합니다. 클라이언트 가격·금액·소유자 ID는 받지 않습니다. FC는 정밀도 손실 없는 10진 문자열입니다. API 세부 사항은 [Phase 2 구조](docs/phase-2-architecture.md)를 참고하세요.

API 오류: 400 입력 오류, 404 없는 상품, 503 DB 또는 데이터 검증 실패. 상품 API의 성공 응답은 `data`, 목록은 추가로 `meta.mode/count`를 반환합니다. 오류 응답은 `error.code/message`입니다. 공개되지 않은 버전과 반려 데이터는 노출하지 않습니다.

## Architecture

`app` → `application` → `domain/catalog` repository contract → `infrastructure/db` (Prisma).

목록 UI는 실제 내부 API를 호출합니다. 서버 상세 페이지는 같은 유스케이스를 직접 사용합니다. Seed 입력과 API 출력은 Zod로 검증합니다. 타입스크립트 타입만으로 데이터 입력을 신뢰하지 않습니다. DB 쿼리는 구성품별 N+1 대신 데이터셋 단위로 조회합니다.

관계: DataSource → DatasetVersion → ProductVersion / ItemVersion. Product → ProductVersion → ProductComponent → ItemVersion. ItemComponent는 중첩 아이템 관계를 나타냅니다. Phase 3의 ItemVersion → RewardPoolVersion → ProbabilityEntry가 ALL/무작위/선수풀/고정 보상 정의를 구분하고 SourceSnapshot으로 원문을 연결합니다. 정의를 실행하는 추첨 엔진은 없습니다.

## Current limitations

- 공식 상품 1종의 확인일은 2026-09-20입니다. 표시된 기간은 공식 판매 기간이며 가상 구매는 저장된 정의를 체험합니다. 현재 판매 상태의 자동 갱신은 없습니다.
- 개발용 상품의 판매 기간·구매 제한은 미확인으로 표시합니다. 가격 미확인 예시도 포함됩니다.
- 선수 이름/클래스 검색과 명시적으로 실행하는 metadata/가격 collector를 제공합니다. 자동 스케줄러와 전체 가격 수집은 없습니다. 확률 표는 페이지당 50개, 선수 목록은 24개입니다.
- 공식 상품 이미지는 공식 페이지에서 관찰하고 HTTPS 200을 확인한 단일 CDN 경로를 사용합니다. 실패 시 fallback이 표시됩니다. 개발용 상품/아이템 SVG는 자체 제작입니다.
- 구성은 데이터셋 내부 참조이며 최대 8단계입니다. 혼합 출처·순환·잘못된 수량은 차단합니다.
- 잘못된 카탈로그가 발견되면 부분 데이터나 가짜 값을 제공하지 않고 503을 반환합니다.
- 공식 수집 정책·이미지 이용 조건·배포 환경은 후속 검증 대상입니다.

근거와 결정: [데이터 조사](docs/data-verification.md), [구조 및 검증 정책](docs/architecture.md).

## Persistence

HttpOnly 쿠키와 PostgreSQL로 같은 브라우저에서 30일 동안 유지합니다. 쿠키 삭제·만료·다른 브라우저에서는 FC 0으로 시작합니다. 초기화는 기존 기록을 감사용으로 남기고 현재 보유 상태만 비웁니다. 계정 연결·기기 간 복구는 없습니다. 만료 데이터 정리 작업은 아직 없습니다.

지급되는 FC와 원장은 항상 가상 재화(MOCK)입니다. 구매/인벤토리의 dataType은 상품 출처에 따라 OFFICIAL 또는 MOCK으로 구분합니다. 공식 데이터 상품을 샀더라도 실제 게임 재화·아이템을 지급하지 않습니다. 파운데이션 패키지의 초기화 전 5개 한도는 **개발용 체험 규칙**이며 공식 구매 제한이 아닙니다.

[Phase 2 조사](docs/phase-2-references.md) · [Phase 2 구조/API](docs/phase-2-architecture.md) · [Phase 2 완료 보고](docs/phase-2-report.md)

## Official data import

```sh
npm run data:validate      # 원문 해시·매핑·확률 합계 검증, DB 쓰기 없음
npm run db:import:official # 검증 후 공식 데이터셋 트랜잭션 등록
```

확인 대상: `[쓸돌][확정 에디션] 'UC 8~11강팩' or '26TOTS 10~11강팩' 100% 패키지`, 14,900 FC. 직접 지급: 상자 1개 + UC Top Price 750 선수팩 3개 + 이벤트 코인 30개. 초기화 전 3개 체험 한도는 공식 웹 구매 한도를 참고한 시뮬레이터 정책입니다.

보존 원문: `src/data/official/product-44699/snapshots.json`. 직접 읽은 상품 DOM과 공개 웹 텍스트로 읽은 확률 문서를 구분합니다. 확률 사이트 직접 접속 시 보안 검사가 나타났으며 우회하지 않았습니다. 캐시된 공식 문서의 수집 시각과 실제 원문 갱신 시각은 다를 수 있습니다.

확률은 문자열 원문 + BigInt/DB Decimal 정수 비율로 저장합니다. 기준가 순위는 PRICE_RANK로 남겨 두며 임의의 선수 이름을 만들지 않습니다. 이벤트 코인 교환도 실행하지 않습니다.

[Phase 3 조사](docs/phase-3-research.md) · [보상 정의/검증](docs/phase-3-architecture.md) · [선수·시세 조사](docs/player-price-research.md) · [Phase 3 완료 보고](docs/phase-3-report.md)


## Player metadata / price observations (Phase 4)

```sh
npm run db:migrate
npm run data:players                 # 공개 API JSON 수집 → 전체 검증 → DB 저장
npm run data:prices                  # 데이터센터 첫 페이지의 UC 최대 5명 가격 표본
npm run data:resolution -- 2026-09-20 # 지정 KST 날짜의 실제 보상 연결 범위
# 이미 성공적으로 수집한 로컬 capture를 다시 검증/등록할 때:
npm run data:players -- --offline
npm run data:prices -- --offline
# .env.test의 격리 DB migration:
npx tsx prisma/migrate-test.ts
```

`data:prices`에는 Playwright Chromium이 필요합니다. 수집기는 사용자 페이지 요청과 분리되어 있으며, `/players`는 PostgreSQL만 조회합니다. API 키는 공개 static metadata에 필요하지 않아 사용하지 않습니다. 원문 JSON은 PlayerDataset에, 추출 가격은 PriceSourceSnapshot에 출처·해시와 함께 보관합니다. 로컬 재실행 capture는 `.local/player-metadata/`, `.local/player-prices/`에 있습니다. 전체 seed는 외부 네트워크에 접속하지 않으며 선수/가격 collector는 별도 실행합니다.

- `/players?q=호나우지뉴&season=877&enhancement=1`: 선수 검색, 클래스 필터, 강화 선택, 24명 페이지.
- `/players/877028130?enhancement=8`: 실제 관측 가격이 있는 UC 선수 예시.
- `GET /api/players?q=...&season=...&page=1&enhancement=1`
- `GET /api/players/[spid]?enhancement=1`
- `GET /api/players/[spid]/price?enhancement=1`
- `GET /api/players/[spid]/price-history?enhancement=1&page=1` (50건 페이지)

가격은 Decimal(30,0) / 10진 문자열 / BigInt로 보존합니다. 확인 시각(observedAt)과 공식 기준 시각(referenceAt)은 별개입니다. Phase 4 표본 65건과 Phase 4.5의 791건 모두 referenceAt은 null이며 최신성 UNKNOWN, 검증 상태 NEEDS_VERIFICATION입니다. 가격이 없으면 null 및 “가격 정보 없음”으로 표시합니다. 과거 그래프 값을 시간대가 검증된 순위 가격으로 변환하지 않습니다.

선수 E2E는 위 collector 실행 후 개발 DB에 UC 호나우지뉴(877028130)의 가격 표본이 있는 상태를 전제로 합니다. 공식 사이트의 표본 노출이나 메타데이터가 바뀌면 자료를 검토한 뒤 테스트 기대값도 함께 갱신해야 합니다. 테스트를 통과시키기 위해 가짜 공식 가격을 입력하지 마세요.

[Phase 4 조사](docs/phase-4-research.md) · [선수·가격·순위 설계](docs/phase-4-architecture.md) · [Phase 4 완료 보고서](docs/phase-4-report.md)


## Data Center price collector (Phase 4.5)

```sh
npm run prices:plan
npm run prices:collect -- --pack=official-pool-24987-v1
npm run prices:status
npm run prices:collect -- --resume=<runId>
npm run prices:plan -- --seasons=877,866
npm run prices:collect -- --window-only
```

새 collector는 브라우저 없이 공식 목록 HTML 요청을 사용합니다. `data:prices`는 이전 Phase의 5명 표본 도구로 남겨 두었습니다. 기본 동시성1·간격3초·timeout30초·재시도2회입니다. `--max-segments=0`은 요청 없이 계획을 저장하고, 기본20구간 예산이 끝나면 재개할 수 있습니다. 200명 제한은 OVR 분할로 처리하며 누락/미검증 조건으로 VERIFIED 순위를 만들지 않습니다. 수집된 가격은 기존 `/players`와 history API에 자동 반영됩니다.

Phase 4.5 E2E는 이전 가격 표본과 새 UC 수집 run이 모두 있는 개발 DB를 전제로 합니다. KST00~01시 실행 제한은 `--window-only`로 제공하며 스케줄러를 자동 설치하지 않습니다. 그 시간에 관측해도 공식 기준 시각을 확인하기 전에는 referenceAt을 채우지 않습니다.

[Data Center 조사](docs/phase-4.5-research.md) · [수집 구조·설정·재개·운영](docs/phase-4.5-architecture.md) · [Phase 4.5 완료 보고서](docs/phase-4.5-report.md)


## Full Market Collector (Phase 4.6)

```sh
npm run prices:plan:full
npm run prices:collect:full -- --max-segments=20
npm run prices:status:full
npm run prices:collect:full -- --resume=<runId> --max-segments=20
# 현재 검증 run:
npm run prices:status:full -- --run=cmualiypa0000tyfh10nnw2ax
```

plan은 HTTP 없는 dry run이며153클래스·표시 단계0~13·OVR 전체 범위를 검증합니다.0은 현재 확인한 공식 화면에서 가격 없는 `-` 상태이고 실제 가격은1~13강입니다. 없는 조합을 미리 생성하지 않습니다. FULL은 실패 구간을 기록하고 다른 구간을 계속 처리하며200명 cap을 OVR 분할합니다. 현재 run은9클래스 완료·1클래스 부분·143클래스 미착수입니다.

History는 원본이며 기존 Player API는 indexed latest를 조회합니다. 분석용 Current materialized view는 FULL 배치 종료 시 refresh합니다. `PRICE_FRESH_HOURS`(기본24)는 API의 observationFreshness와 dry-run 최근 관측 집계에 사용하며 공식 reference 시각 검증과 별개입니다. 전체 DB에는 가격 선수1,489명, distinct variants18,709개가 있습니다. 전체 가격을 확보했다고 간주하지 마세요.

E2E는 Phase4/4.5 UC 이력 및 Phase4.6 class100 가격이 입력된 개발 DB를 사용합니다. Phase 4.6 당시 미가격 사례는866020801이었으며 Phase 4.6B에서 가격을 수집했습니다. 현재 E2E 미가격 사례는868001109입니다. 이후 해당 클래스도 수집하면 missing-price 테스트의 실제 미수집 사례를 검토해 갱신해야 합니다. 테스트용 가짜 공식 데이터를 넣지 않습니다.

[전략 비교](docs/phase-4.6-benchmark.md) · [구조와 운영](docs/phase-4.6-architecture.md) · [전체 클래스 집계](docs/phase-4.6-coverage.json) · [Phase 4.6 보고서](docs/phase-4.6-report.md)


## Safe collection / incremental refresh (Phase 4.6B)

```sh
npm run prices:cost
npm run prices:plan:incremental
npm run prices:collect:incremental
npm run prices:collect:full -- --resume=cmualiypa0000tyfh10nnw2ax --max-segments=100
npm run prices:status:full -- --run=cmualiypa0000tyfh10nnw2ax
npm run prices:collect:reference -- --pack=official-pool-24987-v1
npm run prices:control -- status
npm run prices:control -- disable
npm run prices:control -- enable
```

모든 온라인 가격 CLI가 같은 중앙 보호 장치를 사용합니다. 기본 동시성1·간격10초·분6회·시간60회·일120회·실행20회이며 **robots와 재시도도 예산에 포함**합니다. `--max-segments=100`이어도HTTP20회 cap에서 멈춥니다. 실제비밀값을 바꾸지 않고 `.env.example`에 정책값과 설명을 추가했습니다. `PRICE_COLLECTION_ENABLED=false` 또는 disable명령으로 다음 요청을 막을 수 있으며 enable은 열린 circuit을 해제하지 않습니다.

공식 안전 요청률은 확인되지 않았습니다. 이 값은 자체 운영 제한입니다. 2시간마다Full Crawl하지 않습니다. Full은초기구축/복구/점검용이고 일반 갱신은HOT6시간·WARM48시간·COLD14일의stale/priority계획입니다.미완료 비-HOT클래스는Full Build로 넘겨 중복 초기수집을 줄입니다. 자동 스케줄러는 설치하지 않았습니다.

같은 fresh증분 계획은HTTP0회로SKIP_FRESH합니다. 페이지/API는DB만조회하며 가격이없어도Data Center를 호출하지 않습니다. Reference명령은00~01KST만 허용하며 실제 공식기준시각이 확인되기 전에는referenceAt=null을 유지합니다. 개봉은없습니다.

[운영 구조·정책·캐시](docs/phase-4.6b-operations.md) · [실측/비용 근거](docs/phase-4.6b-audit.json) · [Phase 4.6B 보고서](docs/phase-4.6b-report.md)

## Initial bootstrap / continuous sync (Phase 4.6C)

```sh
npm run prices:sync -- --dry-run
npm run prices:sync -- --max-segments 20
npm run prices:bootstrap -- --max-segments 20
npm run prices:reconcile -- --max-segments 20
npm run prices:sync:status
npm run prices:cost -- --output .local/price-cost.json
```

세 실행 명령은 동일한 중앙 조정기를 호출합니다. 명령명으로 priority/cooldown을 강제 우회하지 않으며 실제 선택은 출력 `type`에 표시됩니다. Reference 관측 → HOT → 미완료 Bootstrap → 적격 Reconciliation → 일반 Incremental 순서입니다. 완료한 Bootstrap을 반복 생성하지 않습니다. 기존 full run은 ID를 따로 넣지 않아도 재개합니다.

향후 cron/worker에서 저장소를 cwd로 `npm run prices:sync`를 30분 간격 호출하세요. 기본 job은 요청 여부를 DB로 먼저 판단하며, 시간마다 무조건 Data Center에 요청하지 않습니다. cron은 설치하지 않았습니다. `.env.example`의 HOT/WARM/COLD 주기, scheduler cooldown, reconciliation 120일, heartbeat 24시간은 자체 운영 설정이며 공식 가격 기준 시각이 아닙니다.

Current 값이 바뀌면 History에 보존하고 동일 값은 최근 관측 시각만 갱신합니다. 참조 시각은 계속 미확인으로 표시합니다. 가격이 한 번 누락돼도 삭제하지 않습니다. 페이지/API는 PostgreSQL만 조회합니다. Kill switch는 `npm run prices:control -- disable`; 점검 대기는 `prices:control -- pause-until <future-ISO> <reason>`입니다.

[Phase 4.6C 보고서·운영 전략](docs/phase-4.6c-report.md) · [실측/비용/DB 감사](docs/phase-4.6c-audit.json)

## Reference-time snapshots (Phase 4.7)

```sh
npm run prices:reference -- inventory
npm run prices:reference -- plan --date 2026-09-27
npm run prices:reference -- schedule --date 2026-09-27
npm run prices:reference -- status --date 2026-09-27
npm run prices:sync
```

기본 대상은 실제 UC Top Price 750 (1~7강)입니다. `schedule`은 DB에 날짜별 계획만 등록하며 cron을 설치하거나 즉시 가격을 요청하지 않습니다. 해당 시간대에 중앙 `prices:sync` job이 호출되어야 실행됩니다. 지난 창은 MISSED로 남기고 Current Price로 채우지 않습니다. 위 날짜는 Phase 4.7 등록 예시이며 이후에는 실제 필요한 미래 기준일을 명시하세요.

공식 확률표에서 TOP 항목을 클릭하면 기준 시각 Snapshot 상태를 조회합니다. 관측 시간대에 수집됐다는 이유만으로 VERIFIED가 되지 않습니다. 공식 생성 제한·후보 범위·reference timestamp·tie가 미확인이면 실제 선수 Pool은 공개하지 않습니다. `PRICE_SYNC_REFERENCE_ENABLED`는 기본 pack 당일 계획의 자동 생성 설정이고, 명시적으로 등록한 계획도 중앙 due queue에서 처리합니다. 전체 수집 중지는 기존 kill switch를 사용합니다.

[Phase 4.7 보고서](docs/phase-4.7-report.md) · [Rank Reward 원문/조건 목록](docs/phase-4.7-rank-inventory.json) · [실제 계획/상태 감사](docs/phase-4.7-audit.json)


## Price infrastructure operations (Phase 4.7P)

```sh
npm run db:migrate
npm run prices:infrastructure -- --output .local/price-health.json
npm run prices:cost -- --output .local/price-cost.json
npm run prices:sync -- --dry-run
npm run prices:sync
# Bounded background-job loop; 5 ticks, shared global budget, default 30-minute eligibility checks.
npm run prices:worker -- --ticks 5
npm run prices:observe -- create
npm run prices:observe -- status
npm run prices:observe -- stop
```

`prices:observe create` freezes one DB-only 9-player/117-variant study when those classes are available. The central worker performs at most four cycles, no earlier than the source-aware minimum interval. Actual cohort size depends on available prices; the CLI records the selected IDs and value strata. Immediate repeated calls do not create duplicate studies. `stop` disables the study, not other price jobs.

`PRICE_COLLECTION_ENABLED=false` stops future collector reservations; `prices:control pause-until` supports a maintenance pause. No web page/API schedules crawling. The worker is bounded and is not installed as an OS service. For continuous operation use one external cron/worker entry invoking `prices:sync`; leases and budgets persist in PostgreSQL across restarts. Do not run separate independent crawlers.

Current 120/day is our provisional policy, not Nexon's documented safe rate. Price age measures our last observation, not exact game-market accuracy. Missing multi-cycle statistics are `INSUFFICIENT_DATA`; current-price data never substitutes for an historical reference snapshot. See the report for measured costs and the still-unmet whole-market freshness requirement.

### Phase 4.7R — Legacy price collector

Legacy OVR → position → height subdivision and a configurable 1–6 worker pool now use the existing shared budget, source lock, circuit breaker and checkpoint store. Production defaults remain provisional. Live worker 1/2 benchmarks and worker 2/4/6 fixtures are documented in [the Phase 4.7R report](docs/phase-4.7r-report.md).

```sh
npm run prices:full -- --dry-run --output full-plan.json
npm run prices:full -- --max-segments 20
npm run prices:full -- --resume RUN_ID --max-segments 20
npm run prices:full -- --status RUN_ID
npm run prices:hot -- --dry-run --min-ovr 100 --active-pack
npm run prices:control -- disable
```

Each invocation is a bounded batch. Reuse the returned run ID to resume. No OS cron is installed; the Asia/Seoul two-hour HOT / 04:30 Full schedule is a candidate, not a verified production SLO. Current prices never substitute for reference-time snapshots.

### Phase 4.7S — Running the full database build

`prices:full:run` automatically continues bounded batches on one immutable run. It retains the central scheduler lease, acquires the shared source lock for each batch, and pauses on safety/budget/metadata changes. Terminal truncation is recorded per segment and does not stop unrelated classes. No cron is installed.

```sh
# Explicit execution profile, validated at 5 seconds; NOT an official safe rate.
PRICE_COLLECTION_REQUEST_DELAY_MS=5000 \
PRICE_COLLECTION_MAX_CONCURRENCY=2 \
PRICE_COLLECTION_MAX_REQUESTS_PER_MINUTE=12 \
PRICE_COLLECTION_MAX_REQUESTS_PER_HOUR=720 \
PRICE_COLLECTION_MAX_REQUESTS_PER_DAY=5000 \
PRICE_COLLECTION_MAX_REQUESTS_PER_RUN=51 \
npm run prices:full:run -- --resume RUN_ID --batch-size 50 --batches 100

npm run prices:full:audit -- --run RUN_ID
npm run prices:control -- disable
```

Omit `--resume` only for the first creation. `.local/phase47s/run-id.txt` retains the run ID. Audit writes per-player classifications, explicit unresolved segments and the verified leaf manifest. A partial manifest is not a complete-market refresh plan. Live execution and remaining work are recorded in [the Phase 4.7S report](docs/phase-4.7s-report.md).

The current machine also has independent `fconline-gg` cron jobs. The Phase 4.7S execution supervisor leaves those jobs unchanged and pauses this collector around their observed KST schedule, checks for a running legacy Python crawler, then resumes the same run. It does not resume through circuit, budget, kill-switch or manual pauses.

```sh
# Requires the existing .local/phase47s/run-id.txt and operating-profile.json.
# Runs at most 24 hours / 24 coordinator invocations; no cron installation.
npm run prices:full:supervise
```

Request-time `PRICE_FULL_STOP_AT` checks protect the pause boundary even after machine sleep. `.local/phase47s/supervisor-status.json` shows RUNNING versus waiting; `.local/phase47s/process.json` identifies the worker. A status file alone is not proof that a process is alive. Audit snapshots and per-player classifications are regenerated when each coordinator invocation finishes.
