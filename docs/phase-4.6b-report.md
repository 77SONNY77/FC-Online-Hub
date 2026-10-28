# PHASE 4.6B COMPLETION REPORT

검증일2026-09-21 KST. [운영 구조·설정·CLI](phase-4.6b-operations.md) · [실제 실행/비용/캐시 근거](phase-4.6b-audit.json).

## 1. Status

**PARTIAL**. 전역 보호 장치·증분 계획·fresh cache·실제 예산 중단과 재개 검증을 완료했다. 초기 Full Build는 진행 중이며14/153클래스, 해당 manifest 가격 coverage2.24%다. 이번 명세대로100%를 위해 요청을 밀어붙이지 않고 예산에서 멈췄다. 개봉은 구현하지 않았다.

## 2. Official Access Policy Research

[공식 Data Center](https://fconline.nexon.com/datacenter), [robots](https://fconline.nexon.com/robots.txt), [넥슨 약관](https://member.nexon.com/policy/stipulation.aspx)과 공개 접근/요청 제한 자료를 확인했다. Data Center에 적용되는 공식 안전 요청률은 확인하지 못했다: **No explicit safe request rate confirmed.** 자체 설정을 공식 허용량으로 표현하지 않는다. robots에 해당경로 disallow가 없다는 것은 수집/재배포 라이선스가 아니다. 약관의 무단 복제·배포·영리 이용 및 서비스 방해 관련 제한을 무시하지 않는다. 차단 임계값을 시험하지 않았다.

공식 페이지의 약2시간 갱신 및 반영 지연 안내를 정상 공개 GET으로 재확인했다. 선수별 실제 게임 가격 변동과 홈페이지 반영·우리 수집은 서로 다른 시계다. root와 실제 검색 POST 모두 ETag/Last-Modified/Age는 없고 Cache-Control private이었다. Date는 응답 시각이다. 신뢰할 전역 market version이나 cheap change endpoint가 확인되지 않아 가짜 버전/시장 전체 unchanged 판정을 만들지 않았다.

## 3. Current Data Center Request Architecture

공식 페이지가 사용하는 `POST /datacenter/PlayerList` HTML 검색이다. 클래스/선택강화/OVR범위/가격 정렬/page1을 사용한다. 한 선수 행의+1~13 가격을 함께 읽으며0 선택값의 '-'는 가격 없음 상태다.200명 cap이면 부모를 입력하지 않고 OVR 정수 범위를 나눈다. 개별 선수 상세 요청은 없다. 기존40요청의 평균은34.4선수/447.2가격이며 cap부모와 빈 결과까지 포함한 수치다. phase4.5 checkpoint/immutable import/resume를 유지했다.

## 4. Full Crawl Cost

153클래스 전체 plan과 완료클래스 실측을 결합한 최종 추정:

|항목|값|
|---|---:|
|가격 요청|1,201|
|20요청 실행 예산에 따른 robots GET 추정|64|
|총 요청|1,265|
|추정 선수/가격 요청|73.57|
|추정 가격 조합/가격 요청|956.43|
|10초 간격만 반영한 시간|3.51시간|
|시간60회 상한을 반영한 최소 예산 시간|21.08시간|
|일120회 상한을 반영한 최소 예산 일수|10.54일|
|현재 Full manifest에서 남은 가격 요청 추정|1,142|
|실제 적용 시간/일 상한|60 / 120|

metadata88,359×13은1,148,667조합의 상한이며 현재 유효 시장 수가 아니다. 처음 계산은완료9클래스 기준1,193가격 요청이었고, 새로 완료한5클래스 실측을 반영해1,201로 갱신했다. 아직 동적 분할을 끝내지 못했으므로 **정확한 전체 요청 수는 미확인**이다. 완료14클래스만 비용이 실측이다. 이 숫자를 전체 실측이나 보장으로 보고하지 않는다. 초기 구축 중 HOT/reference에 예산을 남기면 완료 기간은 더 길어진다.

## 5. Ban / Blocking Risk Controls

|장치|구현/기본값|
|---|---|
|Rate|동시성1, 요청 간격10초|
|전역 rolling budget|분6 / 시간60 / 일120|
|실행 budget|20 HTTP 예약; robots/재시도 포함|
|Hard stop|REQUEST_BUDGET_EXHAUSTED → pending 유지/PAUSED|
|Circuit|첫401/403/429/보안·점검에 중단, 일반 연속오류3회; 기본24시간|
|Single collector|원천별 DB lease + advisory lock, robots 이전 획득|
|Kill switch|PRICE_COLLECTION_ENABLED=false 및 DB disable 명령|

예약은 HTTP 이전에 원자적으로 기록한다. 프로세스 재실행으로 시간/일 quota가 초기화되지 않는다. 기존 저장 가격 요청41건도 backfill했다. 기록이 없던 과거 브라우저/robots 요청은 추정해 만들지 않았다. 회로가 열리면 다른 run도 요청할 수 없고 enable은 circuit을 초기화하지 않는다. 이미 전송된 요청은 종료/timeout까지 갈 수 있으나 다음 요청을 막는다.

## 6. Initial Market Build

동일 Full run `cmualiypa0000tyfh10nnw2ax`를 재개했다.

|항목|이전|현재|
|---|---:|---:|
|해당 Full manifest coverage|1.56%|2.24%|
|가격 선수|1,376|1,976|
|가격 조합|17,888|25,688|
|완료 / 남은 클래스|9 / 144|14 / 139|
|성공 leaf / SPLIT 부모|24 / 16|36 / 23|
|남은 동적 구간|145|140|
|가격 요청 누계|40|59|
|실패 / 중복|0 / 0|0 / 0|

이번 FULL_BUILD execution은 **20회=robots1+가격19**에서 자동 정지했다. 요청21은 전송하지 않았으며 stopReason은REQUEST_BUDGET_EXHAUSTED다. 새600명×13=7,800가격을 확보했다. Full 실행시간은17:26:59~17:30:21KST, 약202초였다. 이어지는 HTTP 예산이 남아 있어도 같은 execution 예산을 초과하지 않았다.

별도의 HOT 갱신까지 합친 전체 DB는 가격 선수2,250명(metadata 대비2.55%), distinct variants29,250개, history30,106행이다. 이 전체 DB 수치와 위 Full manifest 수치는 서로 다른 범위다.

## 7. Full Crawl Every 2 Hours Simulation

가격1,201+정책GET64=총1,265요청/한 번, 하루12회면 **15,180요청/일**, **455,400요청/30일**이다. 가격 POST만도14,412회/일이다. 자체 하루120회 상한과 맞지 않고 비용·반영 지연도 커서 **사용하지 않는다**. 실제로 반복 실행하지 않은 계획 시뮬레이션이다.

## 8. Incremental Strategy

HOT: 현재 저장된 published official product 보상 그래프의 실제 팩 클래스866/877. 기본6시간이며 첫 우선순위다. 공식 pack eligibility가 확인됐다는 뜻은 아니다.

WARM: 관측된 Current 가격 기준 상위2클래스 중 HOT을 제외한다. 현재100클래스1개, 기본48시간이다. 전체 시장 인기/사용자 조회 신호로 주장하지 않는다.

COLD: 나머지150클래스, 기본14일. 동일leaf에서 연속2회 new=0/changed=0이면 비-HOT 간격을2배로 늘릴 수 있다. 전체 초기 구축이 끝나지 않은 비-HOT클래스는 Full Build로 넘겨 증분 run에서 초기 수집을 반복하지 않는다. tier 내에서는 오래된 관측이 먼저이며 DB priority가 분할 자식에게 상속된다.

## 9. Incremental Request Cost

전체 구축 이후의 최종 plan 모델:

|대상|한 sweep 가격 요청|주기|평균 가격 요청/일|
|---|---:|---|---:|
|HOT2클래스|2|6시간|8|
|WARM1클래스|1|48시간|0.5|
|COLD150클래스|1,175 추정|14일|83.93|
|합계|||92.43|

2시간 단위로 환산한 장기평균은약7.70가격 요청이며,2시간마다 전체를 실행한다는 뜻이 아니다.30일 가격 요청 모델은약2,773회다. 예를 들어 HOT4실행 + COLD/혼합5실행/일의 정책GET9회를 더하면 약101.43HTTP/일,3,043HTTP/30일이다. 시도/분할/실행 단위에 따라 실제 비용은 달라지며,120회 hard cap이 우선한다. source-change signal 미확인이라 숫자가 같다는 이유로 시장 전체 skip을 하지 않는다.

|전략|HTTP/일 추정|최신성|사용|
|---|---:|---|---|
|Full every2h|15,180|긴 수집 창과 지연 존재|NO|
|Incremental|약101.43, hard cap120|HOT6h/WARM48h/COLD14d|일반 운영 후보|
|단일 UC reference plan|가격1+정책1=2/해당일|해당 시간대의 관측|기준 의미 검증 후 별도 운영|

실제로 HOT 두클래스를 가격2요청(+robots1)으로 갱신했다. 직후 재실행은16개 완료클래스 fresh,137개 미완료클래스 Full Build 위임, due0으로 **SKIP_FRESH**, 외부 요청0·새 가격행0이었다.

## 10. Reference Snapshot Strategy

`prices:collect:reference -- --pack=official-pool-24987-v1`를 제공한다. REFERENCE mode/REFERENCE_SNAPSHOT reason을 기록하고00~01KST를 요청 직전까지 검사한다. 같은 시간대에 일반 Full/Incremental은 멈춰 reference 작업을 우선한다. reference는 일반cache와 분리하지만 **referenceAt=null**을 유지한다. 그 시간에 HTTP를 보냈다는 사실만으로 공식 기준 시각 의미가 검증되지는 않는다. 이번에는 해당시간 외 reference 요청을 보내지 않았다.

## 11. Cache Strategy

증분 plan은 완전한 클래스 leaf partition의 가장 오래된 관측이 fresh이면 요청을 만들지 않는다. MANUAL은 동일 metadata/query의 최근2시간 성공 관측이 전체 계획을 덮으면 FRESH_QUERY_CACHE로 멈춘다. 사용자 cache miss는 DB의 가격 없음 표시로 끝나며 사이트 조회를 유발하지 않는다. unchanged는 로컬 관측 비교이며 공식 market version이 아니다. 현재 동일 값은 불필요한 재요청을 먼저 줄이고, 필요했던 다른 시각 heartbeat는 history에 남긴다.

## 12. Database

PriceCollectorState/Execution/Request를 추가했다. segment priority와 비교결과(new/changed/unchanged)를 저장한다. request ledger는 source 전체 정책GET/POST/retry를 포함한다. 기존 PriceCurrent projection, history source of truth, 원문/hash/관측 시각, run manifest와 snapshot unique 정책은 유지했다. 총11개 migration을 개발/격리 테스트 DB에 적용했다. Current29,250조합, history30,106행, source31개, PriceRankSnapshot0이다. 이력을 삭제하거나 과거 시각으로 바꾸지 않았다.

## 13. Request Efficiency

분모는 **가격 POST**이며 정책GET은 별도다.

|실제 실행|가격 요청|선수/요청|가격/요청|새 가격/요청|변경/요청|동일/요청|
|---|---:|---:|---:|---:|---:|---:|
|Full 재개|19|31.58|410.53|410.53|0|0|
|HOT incremental|2|137|1,781|1,370.5|393|17.5|

HOT 총3,562관측 중 새2,741·변경786·동일35였다. source 관측 시각은17:38KST이며 과거 reference로 저장하지 않았다. 캐시 재실행에는 요청 자체가 없어 비율을 계산하지 않는다. Full의 낮은 비율에는 cap부모·빈 구간 분할 비용이 포함된다. 전체 run 누적 시작/끝 시간에는 긴 중단이 있어 처리율로 사용하지 않았다.

## 14. CLI

```sh
npm run prices:cost
npm run prices:plan:full
npm run prices:collect:full -- --resume=cmualiypa0000tyfh10nnw2ax --max-segments=100
npm run prices:status:full -- --run=cmualiypa0000tyfh10nnw2ax
npm run prices:plan:incremental
npm run prices:collect:incremental
npm run prices:collect:incremental -- --resume=<incrementalRunId>
npm run prices:collect:reference -- --pack=official-pool-24987-v1
npm run prices:control -- status
npm run prices:control -- disable
npm run prices:control -- enable
```

max-segments100은HTTP100회를 허용하지 않으며 실행20회 cap에 먼저 멈춘다. 상태는 lifetime run과 현재 execution 예산을 구분한다. 최종 집계 당시 circuit CLOSED, active false, rolling hour23/60, day66/120, 마지막 Full execution20/20이었다. 시간 경과에 따라 rolling usage는 변한다.

## 15. Tests

Unit111 PASS, Integration53 PASS, E2E69 PASS. 요청100 허용/101 전송 차단, 재실행 간 rolling quota, 두번째 collector 거절, 첫403/429 및 security 중단, 반복5xx/비정상 shell breaker, DB kill switch, Hot→Warm→Cold와stale/cache, 예산 중단 Full resume, unchanged/changed 집계 및 heartbeat, DB-only user reads를 검증했다. 실제 Full예산 stop/증분 HOT/캐시 재실행도 수행했다. FC충전→공식 구매→인벤토리→보상 트리→확률→선수/가격 회귀를 유지했다.

## 16. Build Verification

|검증|결과|
|---|---|
|npm run build|PASS|
|npm run typecheck|PASS|
|npm run lint|PASS|
|npm test|111 PASS|
|npm run test:integration|53 PASS|
|npm run test:e2e|69 PASS|

## 17. Recommended Production Collection Schedule

자동 스케줄은 설치하지 않았다. 초기에는 수동 budget execution으로 Full run을 이어가며 HOT/reference 요청을 위한 일일 여유를 남긴다. Full every2h는 금지된 기본 전략으로 사용하지 않는다. 구축 후 HOT6시간/WARM48시간/COLD14일을 출발점으로 하되 클래스별 실제 요청 비용·changed/request·backlog를 보고 더 느리게 조정한다. Source 공식 정책 확인 전 무제한 상용 수집으로 확대하지 않는다. full reconciliation은 초기구축/복구/낮은 빈도의 점검용이다.

동일값 압축은 향후 changed-only + heartbeat + daily checkpoint를 검토한다. 현재는 실제 관측과 원문을 보존하고 fresh skip으로 증가량을 먼저 줄인다. 기준 시각 수집은 별도 목적과예산으로 관리한다.

## 18. Remaining Risks

공식 안전 요청률과 자동 수집 허용 범위가 확정되지 않았다. 자체 제한이 차단 방지를 보장하지 않는다. 전체 비용은동적 분할 모델이며1,201요청을 보장하지 않는다. 단일OVR200명,새로운 미표시HTML,metadata 차이 및 실제 전체 유효 시장 분모는 남아 있다. 아직137클래스는 어느 full/증분 클래스 수집도 완료하지 않았다. 현재관측의 고가 신호는 전체시장 랭킹이 아니다. 별도 cheap version endpoint는 없으며 값이 같아도 시장 전체 unchanged를 알 수 없다. reference의공식 시각·팩 자격·동률/OVR 조건은 계속 미확인이다. kill switch는 이미전송된요청을 되돌리지 못하며 강제종료후 lease만료를 기다릴 수 있다.

## 19. Ready for Reference-Time Snapshot Phase?

**NO — 검증된 reference snapshot 발행 기준.** 안전한 중앙 수집·시간대 우선권·관측 이력 기반은 준비했지만 공식reference 의미가 확인되지 않아 실제rank pool은UNRESOLVED다. 현재가격을 과거값으로 위장하지 않았고 Pack Opening은 구현하지 않았다. Phase4.6B는여기서 중단한다.
