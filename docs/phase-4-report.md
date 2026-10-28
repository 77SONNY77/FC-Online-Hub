# PHASE 4 COMPLETION REPORT

보고일: 2026-09-20 KST

## 1. Status

**PARTIAL**. 공식 선수 metadata, 강화별 관측 가격 저장, 선수 UI/API, 엄격한 순위 resolver와 기존 확률표 연결 상태 계산을 구현했다. 실제 선수 연결은 정확한 과거 기준 가격과 완전한 후보 스냅샷이 없어 **0건**이다. 이 한계를 가짜 가격이나 임의 선수 매핑으로 메우지 않았다.

## 2. Player Metadata Source

[Nexon 공식 SPID JSON](https://open.api.nexon.com/static/fconline/meta/spid.json)과 [공식 클래스 JSON](https://open.api.nexon.com/static/fconline/meta/seasonid.json)을 실제 다운로드했다. 공식 YAML의 SPID 3자리 클래스 + 6자리 선수 규칙, 공식 이미지 문서의 playersAction URL 형식을 확인한 후 적용했다. API 키를 사용하거나 노출하지 않았다.

## 3. Player Import

| 항목 | 실제 등록 결과 |
|---|---:|
| Imported Players | 88,359 |
| Seasons / Classes | 153 |
| Missing Name | 0 |
| Invalid Season / Broken Mapping | 0 |
| Duplicate SPID | 0 |

메타데이터 관측: **2026-09-20 13:19:40.608 KST**. 원문 2개를 PlayerDataset에 보관한다. 결합 SHA-256: `78582b8dc3280679a261aa0aae803c070c057e0fa95b855bc3914bd8a741e619`. 전체 등록 후 동일 capture 재실행은 imported:false였다.

## 4. Player Price Research

공개 API 문서, 공식 Data Center 화면, 공개 목록/가격 그래프 요청을 조사했다. 일반 전역 현재 기준가 API는 확인한 공개 API 문서에서 찾지 못했다. Data Center의 POST `/datacenter/PlayerList`와 `/datacenter/PlayerPriceGraph`는 실제 200 응답을 확인했다.

Data Center는 2시간 단위 갱신·반영 지연·선수별 다른 갱신 시점·최대 200명 노출을 안내한다. 가격 그래프는 일자별 값이지만 0~1시 기준 가격이라는 근거가 없다. 자세한 출처와 관측 내용은 [조사 문서](phase-4-research.md)에 기록했다.

## 5. Price Collection

공식 첫 페이지에서 UC 선수 최대 5명의 강화별 가격 title 값을 수집했다. 호나우지뉴, 프랑크 리베리, 리오넬 메시, 레반도프스키, 티에리 앙리의 1~13강 표본을 확보했다. 일반 브라우저 한 페이지를 읽었으며 제한 우회·전체 후보 대량 수집은 하지 않았다. FC Detox 가격은 사용하지 않았다.

## 6. Price Data

| 항목 | 실제 결과 |
|---|---:|
| 관측 선수 | 5 |
| Player Variants | 65 |
| Price Records | 65 |
| Price Source Snapshots | 1 |
| 공식 Reference Time 확보 | 0 |
| VERIFIED Price Records | 0 |
| Historical Rank Snapshots | 0 |

Reference Time: **null / 공식 기준 시각 미확인**.

Observed Time: **2026-09-20 13:32:26.256 KST**.

가격 65건은 OFFICIAL_WEB 출처지만 시각·최신성 검증이 부족해 NEEDS_VERIFICATION / freshness UNKNOWN이다. Decimal(30,0)·문자열·BigInt로 정밀 보존한다. +1 화면 OVR/포지션 관측 5건 외 다른 강화 OVR을 계산하지 않았다.

## 7. Rank Resolution

기준일: **2026-09-20 KST**. 실제 Phase 3 데이터셋을 조회하여 계산했다.

| 항목 | 결과 |
|---|---:|
| Probability Tables | 12 |
| Fully Resolved | 2 |
| Partially Resolved | 4 |
| Unresolved | 6 |
| Probability Entries | 1,208 |
| Resolved Entries | 5 |
| Unresolved / Not Fully Resolved Entries | 1,203 |
| 실제 선수로 연결된 Entries | **0** |
| PRICE_RANK Entries 미연결 | **1,195** |

완전 확인된 표 2개는 고정 BP 표다. 완전 확인 행 5개는 BP_AMOUNT 2행 + BP 표를 참조하는 중첩 3행이다. 중첩 자식 일부만 확인된 행은 resolved로 세지 않는다. 복합 상자 3개 및 메인 상자 1개는 일부 확인이며, 6개 선수팩은 모두 UNRESOLVED다. 선수 이름을 추측해 연결한 결과가 아니다.

## 8. Database Changes

PlayerDataset, Season, Player, PlayerVariant, PriceSourceSnapshot, PlayerPriceSnapshot, PlayerPriceRankSnapshot, PlayerPriceRankEntry와 ResolutionStatus를 추가했다. 기존 RewardPoolVersion에 순위 스냅샷 관계를 추가했다.

적용 migration: `202609200002_player_prices`, `202609200003_player_constraints`, `202609200004_player_observation_utc`. 마지막 migration은 초기 bulk SQL의 시간대 변환 문제를 원본 PlayerDataset 관측 시각으로 교정한다. 이후 bulk 입력은 UTC를 명시하며 통합 테스트가 시각 일치를 확인한다.

## 9. Collector

`data:players`: 공개 metadata 2개 직렬 수집, timeout·제한된 retry/429 대응, 검증 후 트랜잭션 게시, hash 기반 멱등 처리.

`data:prices`: 일반 브라우저에서 제한된 UC 표본 수집, 이름/SPID/강화/정밀 가격 검증, 공식 기준 시각은 null로만 허용, 관측 버전 누적. 같은 출처·시각의 다른 입력은 충돌로 거절한다.

`--offline` 재등록 지원. 사용자 요청은 DB만 조회한다. 가격 collector는 자동 스케줄러나 완전한 가격 API로 취급하지 않는다.

## 10. Player UI

`/players` 이름 검색·클래스 필터·강화 선택·24명 페이지, `/players/[spid]` 상세·강화별 가격·기준/관측 시각·출처를 구현했다. 가격 없음과 이미지 fallback을 명시한다. 관측값이 있는 단계만 ‘관측값 있음’으로 표시한다. 메뉴에 선수를 추가했다. History / Special Shop / 개봉 메뉴는 추가하지 않았다.

## 11. Product Integration

기존 확률 페이지에 기준일과 보상 연결 상태를 추가했다. 실제 선수 연결이 검증될 때 선수 링크·강화·가격·기준 시각·출처를 표시하는 경로를 마련했다. 현재 공식 데이터에서는 모든 rank player가 null이며 원문 TOP N을 유지한다. FC 충전·공식/개발용 상품 구매·직접 구성품 지급·인벤토리·리셋은 유지한다.

## 12. APIs

- `GET /api/players?q=&season=&enhancement=&page=`
- `GET /api/players/[spid]?enhancement=`
- `GET /api/players/[spid]/price?enhancement=`
- `GET /api/players/[spid]/price-history?enhancement=&page=`
- 기존 확률 API에 pool resolutionStatus/resolutionDate, 행별 resolution 및 nullable player 추가.

순위 계산은 내부 service/CLI로 제공하며 불필요한 public mutation API를 만들지 않았다. 가격 이력이 없으면 빈 배열과 UNAVAILABLE을 반환한다.

## 13. Tests

Unit/API: **71 passed**. PostgreSQL Integration: **28 passed**. E2E: **60 passed**, desktop/mobile/tablet Chromium.

순위 테스트는 합성 테스트 전용 3명 스냅샷에서 TOP 2를 정확히 선택하는 경우와 누락·날짜·시간·클래스·강화·OVR·사용 가능 여부·동률·중복·후보 불완전성을 거절하는 경우를 포함한다. 합성 선수/가격은 격리된 `_test` DB에만 사용하고 정리한다.

가격 정밀도·시각 분리·최신성·동일 관측 중복/충돌·가격 없음·이력 누적, 검색 및 페이지 이동을 검증했다. Phase 1~3의 충전 → 공식/개발용 구매 → 인벤토리 → 새로고침 → 리셋 및 중첩 확률 탐색 회귀를 통과했다.

## 14. Build Verification

| Gate | 결과 |
|---|---|
| Build | PASS |
| Typecheck | PASS |
| Lint | PASS |
| Tests | PASS — 71 |
| Integration | PASS — 28 |
| Rank Resolution | PASS — 실제 coverage 계산, 선수 연결 0 유지 |
| E2E | PASS — 60 |
| Migration | 개발/격리 테스트 DB 적용, 총 7 migrations |
| Metadata Import | PASS — 88,359명 / 153클래스, 재실행 no-op |
| Price Import | PASS — 65건, 재실행 no-op |

## 15. Data Integrity

API 키를 사용·노출하지 않았다. 공식 metadata와 관측 가격의 검증 수준을 분리했다. referenceAt을 observedAt으로 대신 채우지 않았고, 최신가를 과거 가격으로 저장하지 않았다. 누락 가격을 0으로 표시하지 않았다. 포지션 사전을 선수별 포지션으로 오해하지 않았고, OVR을 강화 공식으로 계산하지 않았다. FC Detox 값은 공식 DB에 없다.

## 16. Known Issues

가격 표본은 UC 5명만 포함한다. 전체 적격 후보·생성 제한·팩 OVR 기준·동률 규칙·정확한 0~1시 기준 가격이 확보되지 않았다. 따라서 실제 선수 연결이 미완료이며 개봉 단계 준비도 완료로 볼 수 없다.

가격 그래프 일자별 값은 의미/시각을 더 검증해야 한다. 현재 collector는 공식 HTML 구조나 첫 페이지 UC 노출이 바뀌면 실패할 수 있고 자동 수집/재수집 스케줄은 없다. 메타데이터가 선수별 OVR·포지션·가격을 제공하지 않는 한 해당 필드 대부분은 미확인이다. 이미지 경로는 공식 규칙이지만 개별 이미지의 존재는 보증하지 않는다.

## 17. Files Created / Modified

- `prisma/schema.prisma`, Phase 4 migration 3개, `prisma/migrate-test.ts`.
- `src/domain/players/{metadata,price}.ts`, `src/domain/rewards/resolution.ts`.
- `src/application/{import-players,players,players-instance,reward-resolution}.ts`.
- `src/jobs/{player-metadata,player-prices,reward-resolution}.ts`.
- `src/contracts/players.ts`, `src/contracts/rewards.ts`.
- `src/infrastructure/db/{player-repository,player-http,reward-repository}.ts`.
- `src/app/players/`, `src/app/api/players/`, 기존 확률 페이지, `src/features/players/`, 글로벌 메뉴·스타일.
- `tests/players.test.ts`, `tests/players.integration.test.ts`, `tests/e2e/players.spec.ts`, 기존 공식 E2E selector.
- `next.config.ts`, `package.json`, `README.md`, Phase 4 조사·설계·보고서.

실제 원문과 관측값은 DB에 저장했다. `.local/player-metadata/`, `.local/player-prices/`, `.local/phase4-research/`는 로컬 capture/조사 자료이며 저장소에 포함되지 않는다.

## 18. Ready for Pack Opening Phase?

**NO**. 서버 구조·정밀 가격 저장·보수적 resolver는 준비됐지만 현재 상품의 실제 선수 보상을 확정할 정확한 시간대의 가격 및 후보 스냅샷이 없다. 이 자료를 먼저 확보·검증해야 한다. 요청대로 Phase 4에서 종료하며 Pack Opening / Random Draw / Player Reveal / Reward Grant는 시작하지 않는다.
