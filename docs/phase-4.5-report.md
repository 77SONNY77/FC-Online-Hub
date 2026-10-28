# PHASE 4.5 COMPLETION REPORT

검증일: 2026-09-20 KST. Phase 4.5만 구현했으며 Pack Opening은 구현하지 않았다.

## 1. Status

**PARTIAL**. 실제 공식 가격 수집·저장·재개·기존 화면 연동은 성공했다. 공식 기준 시각과 팩 편입 조건이 미확인이라 검증된 실제 Rank Pool은 0개다. Collection Run의 COMPLETE는 고정 metadata 대비 가격 수집 완료를 뜻하며 Phase DONE을 뜻하지 않는다.

## 2. Data Center Price Source

공식 [Data Center](https://fconline.nexon.com/datacenter)의 브라우저가 사용하는 `POST /datacenter/PlayerList` HTML 응답. 선수 metadata는 기존 Nexon 공개 API 데이터를 사용한다. FC Detox 가격은 사용하지 않는다. [실제 요청·정책 조사](phase-4.5-research.md).

## 3. Data Center Architecture

초기 페이지와 검색 HTML fragment를 조합하는 구조다. XHR 응답은 JSON이 아니다. 클래스·강화·OVR 필터와 +1 가격 내림차순을 관찰했다. 페이지 1만 검증했고 최대 200명에 도달하면 OVR 구간 분할을 사용한다. 다른 페이지를 추측하지 않는다. 상세 링크도 실제 방문했지만 가격 수집에는 목록 응답만 필요했다.

## 4. Price Meaning

데이터센터가 표시한 강화별 가격이다. 공식 안내의 갱신·반영 시차 때문에 특정 게임 기준 시각의 가격과 동일하다고 확정하지 않는다. NEEDS_VERIFICATION / UNKNOWN / referenceAt=null을 유지한다. 최근 체결가나 계산된 강화 가격이 아니다.

## 5. Crawler

`src/infrastructure/fconline-data-center`의 client/parser/defaults, `src/domain/players/collection-plan.ts`, `src/application/price-collection.ts`, CLI job을 추가했다. 요청 간격·timeout·bounded retry, 정책 확인, 보안 화면 차단, 엄격한 정수/식별자 검증, 중복·완전성 검사, DB checkpoint와 재개를 제공한다. [구조 및 운영](phase-4.5-architecture.md).

## 6. Collection Strategy

TARGETED는 실제 팩의 클래스·강화 범위를 먼저 수집한다. GENERAL은 명시한 1~10개 클래스의 전체 강화 가격 수집 구조를 제공한다. 전체 선수의 상세 페이지를 순회하지 않는다. 미확인 OVR·생성 제한 조건은 적용했다고 주장하지 않고 클래스 후보 상위집합을 확보한다.

## 7. Target Pack

실제 Phase 3의 **UC Top Price 750 선수팩**, pool `official-pool-24987-v1`, item `official-item-24987-v1`. UC 클래스 877, +1~+7, 요구 순위 TOP 750. 원문에 없는 TOP 95 팩을 만들지 않았다.

## 8. Query Plan

클래스 877, 선택 강화1, 응답의 +1~+7 값 추출, OVR0~200, +1 가격 내림차순, page1. 고정 metadata는 선수113명×7강화=791조합. 최초 segment1개, 최소 가격 요청1회. 200명일 때만 분할하며 이번 실제 응답은113명이므로 추가 분할은 없었다. 다른 다섯 실제 순위 팩의 클래스/강화 계획도 지원한다.

## 9. Collection Results

실제 run `cmu9om7s70000ty1q2npfc1d0`:

|항목|결과|
|---|---:|
|가격 POST 요청|1|
|실행 전 robots GET|1|
|수집 선수|113|
|강화 조합|791|
|새 가격 관측값|791|
|실패 요청 / 누락 가격 / 중복|0 / 0 / 0|
|metadata 대비 coverage|100.00%|
|성공 segment|1|

이 요청 수는 DB 수집 run의 값이며 별도 브라우저 사전 조사는 포함하지 않는다. `--max-segments=0`으로 PAUSED run을 만든 후 실제 `--resume`으로 수집했다. 팩 적격 후보 전체가 검증됐다는 의미는 아니다.

## 10. Database

PriceCollectionRun→Segment→Request를 추가하고 Segment→PriceSourceSnapshot→PlayerPriceSnapshot→PlayerVariant로 출처를 연결했다. 원본 HTML·SHA256·plan hash·실제 관측 시각·시도별 상태를 저장한다. RankSnapshot에는 observedWindowStart/End·pricedCount를 추가했다. additive migration `202609200005_price_collections`를 개발/격리 테스트 DB에 적용했다.

## 11. Historical Storage

기존65건에791건을 추가해 총856건이다. 원본 가격 snapshot2개, 서로 다른 선수×강화821조합이다. 기존5명×7강화35조합은 이전·새 관측값을 모두 가진다. 재개 시 원본/시각을 재사용하고 동일 import는 중복되지 않는다. 기존 history API에서 누적값과 null referenceAt을 검증했다.

## 12. Rank Resolution

|항목|결과|
|---|---:|
|metadata 후보 조합|791|
|가격이 확보된 조합|791|
|팩 적격 후보 수|미확인|
|요구 TOP N|750|
|실제 연결 선수|0|
|대상 / resolved / unresolved 팩|1 / 0 / 1|

전략은 **Case B**다. 강화별 개별 가격을 확보한 후 완전한 검증 입력에서 정렬해야 한다. 사이트 +1 정렬을 여러 강화가 섞인 공식 순위로 쓰지 않는다. 749/750 차단과 완전한 검증 입력750개에서 TOP95 계산은 합성 테스트로 통과했다. 실제 rank snapshot 생성은 시각·자격 검증이 없어 수행하지 않았다.

전체12개 확률표는 fully2 / partially4 / unresolved6, 전체1,208항목 중 기존 BP·중첩 BP5항목만 연결되고1,203항목은 미완료다. 여섯 실제 선수 순위 팩은 모두 UNRESOLVED다.

## 13. Reference Time

관측 시각은 **2026-09-20 19:37:36.501 KST** (`2026-09-20T10:37:36.501Z`)다. 팩의 개봉일00~01시 기준가라고 확인되지 않아 referenceAt은 null이다. 현재 값을 과거 기준가로 바꾸지 않았다. `--window-only`도 관측 시간대만 제한하며 공식 기준 시각을 증명하지 않는다.

## 14. CLI

```sh
npm run prices:plan
npm run prices:collect -- --pack=official-pool-24987-v1
npm run prices:collect -- --resume=cmu9om7s70000ty1q2npfc1d0
npm run prices:status -- --run=cmu9om7s70000ty1q2npfc1d0
npm run prices:plan -- --seasons=877,866
npm run prices:collect -- --window-only
```

완료 run의 재개는 가격을 재요청하지 않는다. 새 관측값을 축적하려면 새 run을 실행한다.

## 15. Tests

- Unit **101 PASS**: 실제 HTML fixture, ID/이름/클래스/강화, 정밀 BP, 보안·점검·빈 shell·selector 변경, retry, robots, 시간대 경계, 200명 분할 계획, 749/750 순위 차단 및 검증 입력 TOP N.
- Integration **40 PASS**: 실제 PostgreSQL, snapshot/출처,30자리 BP/API 직렬화, 부분 실패 재개, checkpoint 재실행 중복 방지, 완료 run 멱등성,200명 parent 미수입·분할, 시간대 종료, 글로벌 lease, 미완료 후보 차단.
- E2E **63 PASS**: desktop/tablet/mobile. FC 충전→공식 구매→인벤토리→초기화, 보상 트리·확률·선수 UI/API 회귀, 새 가격과 이전 이력 동시 존재, 미확인 rank 원문 유지.
- Actual collection / resume / snapshot 검증:113명791가격 저장 및 DB/API 조회 성공.

## 16. Build Verification

|명령|결과|
|---|---|
|npm run build|PASS|
|npm run typecheck|PASS|
|npm run lint|PASS|
|npm test|101 PASS|
|npm run test:integration|40 PASS|
|npm run test:e2e|63 PASS|

## 17. Data Counts

개발 DB를 읽기 전용 집계한 실제 수치:

|항목|건수|
|---|---:|
|Players in DB|88,359|
|Classes|153|
|Data Center 가격 요청 (이번 run)|1|
|Players Crawled (이번 run)|113|
|Player Variants Crawled (이번 run)|791|
|Player Variants in DB|821|
|Price Observations (이번 / 전체)|791 / 856|
|PriceSourceSnapshots|2|
|Collection Runs|1|
|Failed Requests / Missing Prices (이번 run)|0 / 0|
|Target / Resolved / Unresolved Rank Packs|1 / 0 / 1|
|PlayerPriceRankSnapshots|0|

## 18. Operational Plan

기본 동시성1, 요청 간격3초, timeout30초, 재시도2회, backoff5초다. 실행 예산 기본20구간이며 미완료 작업은 resume한다. KST00~01시에 `--window-only` 실행을 지원하고 매 요청 직전 경계를 검사한다. 스케줄러는 설치하지 않았다. 지속 수집 전에 공식 정책과 기준 시각 의미를 재검증해야 한다. 일자별 run은 실제 관측값으로 누적한다.

## 19. Known Issues

공식 reference window, 팩 편입·생성 제한, 동률 처리, 일부 팩 OVR 의미가 미확인이다. metadata coverage100%를 적격 후보 검증으로 대체할 수 없다. 실제 rank snapshot 발행은 남아 있다. 대규모 GENERAL 수집은 실행하지 않았고 OVR 분할은 테스트로 검증했다. 빈 결과 마크업과 페이지2는 미검증이며 안전하게 실패/미사용 처리한다. 단일 OVR200명은 추가 분할 축 없이는 실패한다. 강제 종료 후 활성 lease 만료(최대30분)를 기다려 재개한다. 사이트 변경 시 fixture·조건 검토가 필요하다. robots 확인은 상업적 재배포 허가가 아니다.

## 20. Ready for Pack Opening?

**NO.** 실제 검증된 Rank Pool이0개이며 기준 시각·후보 적격성을 확인하지 못했다. Phase4.5의 가격 수집 기반과 관측 이력까지만 제공한다. 개봉·랜덤 추첨은 구현하지 않았다.
