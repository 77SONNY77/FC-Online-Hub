# PHASE 3 COMPLETION REPORT

완료일: 2026-09-20 KST

## 1. Status

**DONE** — 공식 상품부터 중첩 구성품·확률표·최종 보상 유형까지 연결했다. Phase 1/2 충전·가상 구매·인벤토리 흐름을 유지했다. 개봉과 Random Draw는 구현하지 않았다.

## 2. Official Product Research

[공식 웹샵 상품 44699](https://shop.fconline.nexon.com/Shop/View?strPid=44699)의 실제 목록·상세를 조사하고 공식 확률표를 연결했다. FC Detox는 UX 참고에만 사용했다. 확률 페이지의 직접 접속은 보안 확인에 막혀 공개 웹 조회에서 제공된 공식 본문을 사용했다. 캐시 및 최신성 한계를 기록했다. 상세: [조사 문서](phase-3-research.md).

## 3. Official Products Imported

**1개**: `[쓸돌][확정 에디션] 'UC 8~11강팩' or '26TOTS 10~11강팩' 100% 패키지`.

Product ID `official-44699`, DatasetVersion `official-shop-44699-20260920`, source `OFFICIAL_WEB`. 기존 MOCK 상품 3개를 유지한다.

## 4. Product Data

| 항목 | 검증한 값 |
|---|---|
| 가격 | 14,900 |
| Currency | FC |
| 판매 기간 | 2026-09-10 08:00 ~ 2026-09-30 08:00 KST |
| 공식 구매 제한 | 계정당 FCO / FCOM / WEB 각각 3회 |
| 직접 구성품 | 확정 에디션 상자 ×1, UC Top Price 750 (1~7강) 선수팩 ×3, [가을맞이!] 쓸돌코인 ×30 |

이름·가격·통화·기간·제한·구성품의 필드별 검증 상태와 근거를 저장한다. 가상 구매 제한은 리셋 전 3회다.

## 5. Reward Tree

상품 → 직접 아이템 3종 → 메인 상자의 후보 5종 → 3개 복합 상자의 ALL 지급 → 선수 순위 풀 또는 고정 BP까지 연결했다. 직접 구성품을 제외한 중첩 아이템은 10개, 중첩 관계는 11개다. 코인은 직접 지급되는 이벤트 아이템으로 보존하며 교환 보상은 확정하지 않았다.

## 6. Probability Data

확률표/Reward Pool **12개**, Entry **1,208개**. 원문 확률 문자열과 BigInt 기반 분자/10^20 분모를 함께 저장한다. DB는 Decimal(40,0)을 사용한다. 중복·누락·형식·음수·범위·출처·해시·그래프·순위 완전성·합계를 검증한다. 반올림 허용 정책과 FIXED/ALL의 개별 100% 검증은 [설계 문서](phase-3-architecture.md)에 명시했다. 원문 값을 재정규화하지 않는다.

## 7. Rank-Based Rewards

6개 선수팩의 **1,195행**은 PRICE_RANK + rank + 원문 조건으로 저장했다. 임의의 선수 이름/ID로 매핑하지 않았다. 나머지는 NESTED_ITEM 11행, BP_AMOUNT 2행이다. 클래스·강화·OVR·기준 시각·생성 제한 조건을 보존한다.

## 8. Database Changes

SourceSnapshot, RewardPoolVersion, ProbabilityEntry와 행동/대상 enum을 추가했다. ProductVersion 필드별 검증·기간·근거, ItemVersion 행동·조건, DatasetVersion importHash를 확장했다. `202609200001_reward_definitions`를 개발 및 통합 테스트 DB에 적용했다. 기존 구매/충전 모델은 유지한다.

## 9. Import Pipeline

저장 공식 본문 → 파싱/교차 확인 → Zod/도메인 검증 → 불변 데이터셋 → 트랜잭션 저장. `npm run data:validate`와 `npm run db:import:official`을 제공한다. 동일 데이터 재실행은 no-op, 같은 버전의 다른 데이터는 거절한다. 실제 스냅샷과 합성 테스트 fixture는 분리했다.

## 10. UI

Shop의 기본 공식 탭, 개발용 탭, 공식 이미지/fallback, 상품 검증·기간·제한, 접기/펼치기 트리, 실제 확률 정보 링크를 구현했다. 확률 페이지는 50행씩 조회하며 원문 수치·조건·유효 기간·출처·수집 한계를 표시한다. 인벤토리는 아이템별 공식/개발용 출처를 표시한다. 데스크톱·모바일·태블릿에서 검증했다.

## 11. APIs

추가: `GET /api/items/[id]/probabilities?page=1` (ItemVersion ID).

기존 `/api/products`, `/api/products/[id]`에 공식 출처·검증·구성 트리 및 확률 요약을 연결했다. 별도 중복 트리 API는 만들지 않았다. 기존 충전·구매·인벤토리·리셋 API를 유지했다. 구매 가능 여부는 서버에서 판단한다.

## 12. Purchase Integration

공식 상품의 가상 구매가 가능하다. 14,900 FC 차감과 직접 구성품 1/3/30 지급을 원자적으로 처리한다. 중복 요청·동시 구매 제한·잔액 잠금·리셋을 검증했다. 상자 내부 보상이나 BP를 지급하지 않는다. 미검증 공식 상품 및 REFERENCE 구매는 서버가 거절한다. 지갑 통화는 계속 무료 충전되는 가상 FC다.

## 13. Player / Price Research

공식 메타데이터의 선수 ID/이름, 클래스 사전, 포지션 사전, 이미지 경로를 확인했다. 확인한 메타데이터에는 선수별 OVR·현재 가격이 없다. 계정 거래 API는 본인 과거 거래이며 전역 기준가 API가 아니다. Data Center는 최대 200명, 2시간 단위 갱신과 지연 가능성을 안내한다. 페이지 파라미터만으로 전체 수집 가능성을 확정하지 않았다. 현재 자료로는 완전한 750명 후보와 개봉일 0~1시 가격 순위를 보증할 수 없다. [후속 조사 문서](player-price-research.md).

## 14. Tests

- Unit/API: **48 passed**.
- PostgreSQL Integration: **20 passed**.
- E2E: **48 passed** (Chromium desktop/mobile/tablet).
- Phase 1/2 회귀: 충전 → MOCK 구매 → 차감 → 인벤토리 → 새로고침 → 리셋 통과.
- 공식 E2E: 공식 배지·중첩 탐색·원문 확률·출처·페이지 이동·이미지 fallback 및 공식 구매/지급/리셋 통과.

## 15. Build Verification

| Gate | 실제 실행 결과 |
|---|---|
| npm run build | PASS |
| npm run typecheck | PASS |
| npm run lint | PASS |
| npm test | PASS — 48 |
| npm run test:integration | PASS — 20 |
| npm run test:e2e | PASS — 48 |
| Prisma generate / validate | PASS |
| Migration | PASS — 4개 migration, up to date |
| npm run data:validate | PASS — 1 product / 13 items / 12 pools / 1,208 entries |
| Official Import | PASS — 최초 등록 및 동일 버전 재실행 검증 |
| npm run db:seed | PASS — 기존 seed 유지, 공식 재등록 imported:false |

## 16. Data Counts

| 항목 | 확보 수 |
|---|---:|
| Official Products | 1 |
| Official Items | 13 |
| Nested-only Items | 10 |
| Nested Edges | 11 |
| Reward Pools | 12 |
| Probability Tables | 12 |
| Probability Entries | 1,208 |
| PRICE_RANK Entries | 1,195 |
| Source Snapshots | 14 |
| Verified Products | 1 |
| Verified Reward Pools | 12 |
| Needs Verification: 구매 필수 필드 | 0 |
| 미확정: 이벤트 교환 보상 정의 | 1 아이템 (UNKNOWN) |
| 미확정: 실제 선수 순위 매핑 | 6 선수팩 |
| 기존 Mock Products | 3 |

## 17. Known Issues

확률 원문은 공개 웹의 공식 본문 스냅샷으로, 캐시가 포함되며 실시간 최신성을 보증하지 않는다. 새 공지가 나오면 수동 확인 및 새 데이터셋 버전이 필요하다. importer는 확인한 공식 표 형식을 지원하며 완전 자동 crawler가 아니다.

가격 순위의 실제 선수 매핑과 이벤트 코인 교환은 미구현이다. 공식 판매 기간·채널별 제한은 표시하지만 실제 계정 이력이나 현재 판매 상태를 동기화하지 않는다. 가상 구매는 저장된 상품 정의를 기준으로 한다. 외부 이미지 실패는 fallback으로 처리한다. 개봉·확률 추첨·선수 지급은 다음 Phase 범위로 남겼다.

## 18. Files Created / Modified

주요 추가/변경 파일과 경로:

- `prisma/schema.prisma`, `prisma/migrations/202609200001_reward_definitions/migration.sql`, `prisma/import-official.ts`.
- `src/data/official/product-44699/{capture,snapshots}.json`.
- `src/domain/official/import.ts`, `src/domain/rewards/`, `src/domain/playground/eligibility.ts`.
- `src/application/import-official.ts`, `src/application/rewards.ts`, `src/application/rewards-instance.ts`, `src/application/playground.ts`.
- `src/contracts/{catalog,playground,rewards}.ts`, `src/infrastructure/db/{catalog-repository,reward-repository}.ts`.
- `src/app/api/items/[id]/probabilities/`, `src/app/items/[id]/probabilities/`, Shop/상품 상세·구성품·구매·인벤토리 UI와 스타일.
- `tests/official.test.ts`, `tests/official.integration.test.ts`, `tests/fixtures/official/`, `tests/e2e/official.spec.ts` 및 기존 E2E.
- `next.config.ts`, `package.json`, `.env.example`, `README.md`, Phase 3 문서 4개.

## 19. Ready for Next Phase?

**YES** — 공식 상품 정의, 출처 추적, 정밀 확률, 중첩 그래프와 기존 가상 구매의 연결 및 회귀 검증이 완료됐다. 실제 선수 지급을 구현하기 전에는 검증된 후보 집합·가격 시점·순위 규칙을 확보해야 한다. 이번 작업은 Phase 3에서 종료하며 다음 Phase를 자동 진행하지 않는다.
