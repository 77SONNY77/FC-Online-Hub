# PHASE 2 COMPLETION REPORT

검증일: 2026-09-19 KST

## Status

**DONE** — Phase 2 범위 구현 및 품질 게이트 통과. 로그인·실제 결제·Pack Opening 없음. Phase 3은 시작하지 않았습니다.

## FC Online Reference Analysis

[공식 Web Shop](https://shop.fconline.nexon.com/)의 FC 구매 탭을 실제 브라우저에서 다시 확인했습니다. 일반 FC/멤버십 구분, 기본 FC + 추가 FC + 총 수량 카드, 상단 재화와 구매 진입 구조를 참고했습니다. 일반 FC 단위 7종을 확인해 출처와 확인일을 저장했습니다. CASH 가격과 멤버십 정책은 구현하지 않았습니다. 외부 그림·소스는 복사하지 않았습니다. [조사 기록](phase-2-references.md)

## FC Detox Reference Analysis

[FC Detox](https://fcdetox.com/)와 [공개 상세](https://fcdetox.com/open/44699)를 다시 확인했습니다. 로그인 없는 진입, 상품 선택 후 즉시 행동, 수량과 사용 FC를 행동 버튼 가까이에 배치하는 흐름을 참고했습니다. 계정/프로필 화면 없이 충전·구매·인벤토리로 이동합니다.

## FC Charge

`/shop/fc`에 7개 옵션을 표시합니다. 최초 FC는 0, 버튼을 누르면 옵션 ID를 서버로 보내고 서버가 기본+추가 수량을 지급합니다. 공통 잔액과 토스트가 즉시 갱신됩니다. 정상 반복 클릭은 누적, 빠른 중복 클릭과 동일 키 재시도는 중복 지급하지 않습니다. 응답을 놓친 요청은 탭 전환/새로고침 후에도 같은 키로 확인할 수 있습니다.

## Anonymous Persistence

30일 HttpOnly/SameSite 쿠키와 PostgreSQL 상태를 사용합니다. DB에는 무작위 토큰의 해시만 저장합니다. 사용자에게 로그인, Guest, Session ID를 표시하지 않습니다. 쿠키가 있으면 새로고침/브라우저 재실행 후 유지되고, 다른 브라우저는 별도 FC 0에서 시작합니다.

## Wallet / Ledger

BIGINT 잔액과 CHARGE/PURCHASE/RESET 원장을 같은 트랜잭션에서 기록합니다. 통화·데이터 유형별 지갑 키를 두되 UI에는 FC만 표시합니다. 원장에 금액·처리 후 잔액·사유·충전 옵션/구매 출처·생성 시각이 남습니다.

## Purchase

서버가 현재 상품 버전·가격·구성·개발용 구매 정책을 조회합니다. 잔액 검사 → 차감 → 구매 → 원장 → 직접 구성품 지급 → 멱등성 기록을 원자적으로 처리합니다. 브라우저별 행 잠금으로 잔액과 누적 구매 한도를 보호합니다. 구성품 지급 실패 시 전체 롤백합니다. 파운데이션 상품의 초기화 전 5개 제한은 별도 개발용 체험 규칙이며 공식 구매 제한으로 표시하지 않습니다.

## Inventory

`/inventory`에서 자체 제작 아이콘, 이름, 유형, 합산 수량, 구매별 획득 경로를 표시합니다. 상자는 상자 수량만 지급하며 내부 선수팩/BP 카드는 지급하지 않습니다. 초기화 확인 창에서 취소하거나 진행할 수 있습니다. 진행 시 FC 0, 현재 인벤토리 빈 목록, 구매 횟수 0이 됩니다. 이전 기록은 감사용으로 남고 과거 요청은 새 상태에 적용되지 않습니다.

## Database Changes

기존 카탈로그 유지. `BrowserState`, `WalletBalance`, `WalletEntry`, `FCChargeOption`, `PurchasePolicy`, `Purchase`, `InventoryEntry`, `IdempotencyRecord` 추가. 음수 잔액/잘못된 수량/원장 방향 제약과 유일 키·인덱스·외래 키를 적용했습니다. 마이그레이션 `202609190001_playground`는 개발 DB와 새 테스트 DB 양쪽에서 적용했습니다.

## APIs

- POST `/api/playground`: 상태 준비
- GET `/api/wallet`: 잔액과 구매 상태
- GET `/api/fc/options`: 등록 옵션과 출처
- POST `/api/fc/charges`: 옵션 ID로 충전
- POST `/api/purchases`: 상품 ID·수량으로 구매
- GET `/api/inventory`: 현재 보유품과 획득 경로
- POST `/api/playground/reset`: 초기화

기존 상품 API 유지. 변경 요청은 동일 출처 JSON만 허용하고, 충전/구매/초기화에 UUID 키와 현재 epoch를 요구합니다. 가격·충전 금액·소유자 변조 필드는 거절합니다. [상세 계약](phase-2-architecture.md)

## UI Changes

공통 헤더에 상점/FC 구매/인벤토리, 보유 FC와 충전 링크를 배치했습니다. 충전 카드와 보너스 표시, 상세 수량·총 비용·부족 안내·구매 완료 링크, 인벤토리·초기화 확인 창을 추가했습니다. 데스크톱/태블릿/모바일 레이아웃을 검증했습니다. 계정 화면이나 미구현 메뉴는 없습니다.

## Tests

| 검증 | 결과 |
|---|---|
| FC 0 시작, 반복 충전, 새로고침/쿠키 복원 | PASS |
| 충전 중복 요청 8개 동시 실행 | 실제 원장 1건, PASS |
| 빠른 두 클릭/의도적인 재클릭 | 1회/추가 1회 지급, PASS |
| 응답 유실 → focus/새로고침 → 같은 요청 재확인 | 중복 지급 없음, PASS |
| 수량 2 구매·서버 가격·잔액 차감 | 2,400 FC 차감, PASS |
| 잔액 부족/구매 한도/구매 멱등성 | PASS |
| 서로 다른 동시 구매 8개 | 잔액·한도 초과 없음, PASS |
| 구성품 지급/중첩 상자 | 직접 구성만 지급, PASS |
| 지급 단계 실패 | 차감·구매·원장 전체 롤백, PASS |
| 초기화/초기화 경쟁/과거 요청 재시도 | 상태 부활 없음, PASS |
| 다른 브라우저 격리/탭 간 갱신 | PASS |
| 금액·가격 변조/외부 Origin/쿠키 없음 | 거절, PASS |
| Phase 1 카탈로그·출처·404·오류/재시도·이미지 실패·키보드 | PASS |

## Build Verification

| 항목 | 실행 결과 |
|---|---|
| Build | `npm run build` PASS |
| Typecheck | `npm run typecheck` PASS |
| Lint | `npm run lint` PASS |
| Unit / API | `npm test` **26/26 PASS** |
| Integration | `npm run test:integration` **13/13 PASS**, 별도 PostgreSQL DB |
| E2E | `npm run test:e2e` **36/36 PASS**, 12개 시나리오 × desktop/mobile/tablet Chromium |
| Migration | 3개 migration 전체 적용, `prisma migrate status` up to date |
| Seed | 카탈로그 + FC 옵션/정책 seed 및 재실행 PASS |

## Manual Verification

실제 Chromium에서 로컬 3000 포트의 완성 화면을 추가 구동했습니다. 0 → 11,000 FC 충전 → 파운데이션 1개 구매 → 9,800 FC, 아이템 3종 표시 → 새로고침 유지 → 확인 후 초기화 → 0 FC/빈 인벤토리를 확인했습니다. FC 데스크톱, 상세 구매, 모바일 인벤토리 캡처를 직접 확인했습니다. 자동 E2E에서도 2회 충전·수량 2 구매·초기화 취소/확정을 검증했습니다.

생성되는 화면 증거: `test-results/fc-{desktop,mobile,tablet}.png`, `inventory-{desktop,mobile,tablet}.png`, `detail-{desktop,mobile,tablet}.png`. `playwright-report/index.html`에 최종 실행 결과가 있습니다. 테스트 산출물은 Git 제외 대상입니다.

## Official Data

2026-09-19 공식 일반 FC 기본+보너스: **300+0, 500+10, 1,000+40, 3,000+180, 5,000+400, 10,000+1,000, 20,000+2,400**. 확인된 수량만 OFFICIAL 데이터셋으로 보관합니다. 공식 상품은 0종입니다.

## Mock Data

기존 상품 3종 유지: 파운데이션(1,200 FC, 체험 한도 5개), 디스커버리 상자(600 FC), 정보 미확인 예시(구매 불가). 실제 지급되는 모든 FC·구매·보유 상태는 MOCK입니다. 공식 FC 수량을 사용해도 실제 게임 FC가 되지 않습니다.

## Known Issues

- 확인된 Phase 2 필수 기능의 미해결 오류는 없습니다.
- 공식 상품 0종. FC 단위는 확인일 스냅샷이며 자동 갱신하지 않습니다.
- 쿠키 삭제/만료 후 복구 및 기기 간 동기화는 없습니다. 브라우저 저장소를 차단하면 미확정 요청의 새로고침 복구가 제한됩니다.
- 만료 기록 자동 정리, 대규모 운영 제한/페이지네이션, Safari/Firefox 검증은 후속 범위입니다. 현재 검증은 Chromium입니다.
- 실제 결제·개봉·확률 추첨은 범위 밖이며 구현하지 않았습니다.

## Files Created / Modified

- DB: `prisma/schema.prisma`, `prisma/migrations/202609190001_playground/migration.sql`, `prisma/seed-playground.ts`
- 계약/도메인/서버: `src/contracts/playground.ts`, `src/contracts/catalog.ts`, `src/domain/playground/rules.ts`, `src/application/playground.ts`, `src/infrastructure/db/playground-http.ts`, `catalog-repository.ts`
- 데이터: `src/data/official/fc-options.json`
- API: `src/app/api/playground/`, `wallet/`, `fc/`, `purchases/`, `inventory/`
- UI: `src/features/playground/`, `src/app/shop/fc/page.tsx`, `src/app/inventory/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, 기존 상품 상세/목록
- 아이콘: `public/images/item-{player_pack,box,bp_card,event_item}.svg`
- 테스트: `tests/playground.test.ts`, `tests/playground.integration.test.ts`, `tests/e2e/playground.spec.ts`, `tests/e2e/shop.spec.ts`, `vitest.config.ts`, `vitest.integration.config.ts`
- 실행/문서: `package.json`, `.env.example`, `README.md`, `docs/phase-2-{references,architecture,report}.md`

## Ready for Next Phase?

**YES** — Phase 2 기반 준비 완료. 요청대로 여기서 중단하며 Phase 3은 시작하지 않습니다.
