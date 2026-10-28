# PHASE 4.6 COMPLETION REPORT

검증일: 2026-09-21 KST. 실제 수집 run: `cmualiypa0000tyfh10nnw2ax`.

## 1. Status

**PARTIAL**. 전체153클래스 계획·수집·분할·실패 격리·재개·이력·현재 가격 조회·coverage를 구현하고 실제40요청을 실행했다.9클래스 완료,1클래스 부분 수집,143클래스 미착수다. 전체 시장을 확보했다고 주장하지 않는다. 명세56항에 따라 추정 요청량과 미검증 큰 클래스 분포를 고려해20구간씩2회 제한 배치로 검증했다.

## 2. Full Market Definition

현재 공식 [FC Online Data Center](https://fconline.nexon.com/datacenter)에서 조회할 수 있는 선수의 실제 표시 강화별 가격이다. Nexon metadata88,359개는 계획의 기준 목록이며 모두 현재 등재/거래 가능하다는 뜻이 아니다. 명시적 미표시, 미조회, 요청 실패를 구분한다. 가격0은 저장하지 않는다.

## 3. Data Center Collection Strategy

Phase4.5의 공식 `POST /datacenter/PlayerList` HTML client/parser를 확장했다. 한 검색 응답에서 모든 강화 가격 칸을 확인하고 SPID로 metadata에 연결한다. 클래스 필터와 OVR 구간을 사용하며 개별 상세 페이지 순회는 하지 않는다. [구조·운영 문서](phase-4.6-architecture.md).

## 4. Benchmark

[수집 전3개 전략 비교](phase-4.6-benchmark.md): 개별 상세 최소88,359요청/73.6시간 간격, 클래스×강화1,989요청/99.5분(200명 누락 보완 전), 선택한 클래스+전체강화+분할 모델1,215요청/60.75분 간격. 앞 두 전략은 비용 추정이며 실제 대량 실행하지 않았다. 실제 선택 전략의 첫20요청은57.933초, 평균응답891.35ms,771명10,023가격이었다. 모델은 metadata와 가정한 분포에 기반하며 전체 실측이 아니다.

## 5. Enhancement Levels

공식 HTML 버튼/검색 선택 값0~13을 재확인했다. 값0의 표시 라벨은 `-`이고, 수집한 모든 선수에서 `.span_bp0`도 가격 없이 `-`였다. 따라서 이를 양수 가격이 있는 유효 variant로 생성하지 않았다. 실제1~13강 양수 가격을 각각 확인·저장했다. 특정 칸의 `-`는 NOT_AVAILABLE(화면 미표시)로 보존하며 게임의 영구 거래 불가를 단정하지 않는다. 아직 미수집된 클래스의 모든 강화 유효성을 확인한 것은 아니다.

## 6. Collection Plan

|항목|실제 계산|
|---|---:|
|Metadata Players|88,359|
|Classes|153|
|표시 확인 단계|0~13 (0은 '-' 상태 확인)|
|초기 Segments|153|
|metadata 기반 최소 leaf 요청 추정|533|
|이진 분할 모델 요청 추정|1,215|
|OVR 전체 분할 트리 상한|61,353|
|1~13강 metadata 가격 조합 상한|1,148,667|
|실제 전체 유효 조합 수|미확인|
|첫 dry run 시 최근24시간 관측 조합|821|
|미관측 조합 상한|1,147,846|

`prices:plan:full`은 HTTP 없는 dry run이다. 실제 DB153클래스를 검사하고 클래스/강화/범위 누락·중복을 거부한다. 최근 관측값이 있어도 완전한 run 집합을 위해 자동 skip하지 않는다.

## 7. Actual Collection

가격 POST40회, HTTP성공40, 실패0, retry0. 실행 전 robots GET은 배치당1회로2회이며 위40회와 별도다. 사전 조사의 robots/page/빈 검색도 이 run 집계에 포함하지 않는다.

첫 요청 시작~마지막 응답 종료752.769초(약12분33초)이며 **두 배치 사이 검토·중지 시간 포함**이다. 이는 연속 수집 성능 측정치가 아니다. 첫 배치 요청 구간은57.933초다. 전체 실행은 PAUSED이고 collectionCompletedAt=null이다.

## 8. Coverage

|항목|이번 FULL run|
|---|---:|
|Total Metadata Players|88,359|
|Players Checked / With Price|1,376 / 1,376|
|Variants Checked (0 표시 포함)|19,264|
|Variants With Price (1~13)|17,888|
|명시적 가격 미표시 (0)|1,376|
|조회한1~13강의 미표시|0|
|미조회 metadata 선수|86,983|
|실패 segment / 중복 관측|0 / 0|
|metadata 대비 선수 가격 coverage|1.56%|

관측한1,376명의1~13강은100% 양수 가격이지만 이것을 전체 시장100%로 표시하지 않는다. 전체 유효 시장 분모는 아직 모른다. 전체 DB는 이전UC를 포함해 가격 선수1,489명, distinct variants18,709, 관측 이력18,744건이다.

## 9. Class Coverage

|Class ID|가격 선수/metadata|검색 완료|
|---|---:|---|
|100|126/126|예|
|101|145/145|예|
|110|125/125|예|
|111|14/14|예|
|113|26/26|예|
|114|2/2|예|
|201|286/286|예|
|202|47/47|예|
|206|515/515|예|
|207|90/321 (28.04%)|아니오|
|나머지143클래스|이번 run 미착수|아니오|

완료9클래스에서 metadata 누락0. 모든153클래스 수치·segment 상태는 [실제 DB 집계 manifest](phase-4.6-coverage.json)에 보존했다. 기존UC 가격이 있더라도 이번 FULL run의 미착수 상태를 완료로 바꾸지 않는다.

## 10. Enhancement Coverage

0 표시:1,376확인 / 가격0 / NOT_AVAILABLE1,376. +1,+2,+3,+4,+5,+6,+7,+8,+9,+10,+11,+12,+13은 각각1,376확인 /1,376가격 /미표시0. 합계17,888양수 가격. 강화별 전체metadata 대비 가격 coverage는 각각1.56%이며 전체 유효 조합 coverage는 미확인이다.

## 11. Database

기존 observation/source/variant/run/segment/request 모델을 유지하고 Segment.result에 선수 발견 목록·미표시 이유를 추가했다. run 자체가 시작·완료·관측 범위를 가진 market snapshot manifest다. `PlayerPriceCurrent` materialized view와 variant unique, enhancement+price, class+enhancement+price 인덱스를 추가했다. 전역/단일·다중 클래스 조회 함수는 관측 가격 순위를 제공한다. 마이그레이션9개 모두 개발/격리 테스트 DB에 적용했다.

## 12. Price History

이번17,888행을 이전856행에 추가해18,744행이다. 이전값을 overwrite하거나 다른 시각의 같은 가격을 제거하지 않는다. 동일 snapshot 내 variant는 unique이며 checkpoint 재생은 같은 source hash/시각을 재사용한다. 대량 입력은 transaction 안의 bulk createMany로 처리한다. 기존 누적 history API를 유지했다.

## 13. Segmentation

실제200명 cap을 만나16개 부모를 SPLIT하고 OVR 정수 범위를 겹치지 않게 분할했다. 총185구간 중 leaf성공24, SPLIT16, pending145, 실패0. 성공leaf에는 빈 검색6개가 포함된다. 부모의 잘린 가격은 저장하지 않는다. 클래스201의286명,206의515명을 분할 후 실제 전부 확보했다. 단일OVR에서200명이면 자동 완료하지 않고 실패한다.

## 14. Rate Limiting

MAX_CONCURRENCY1, REQUEST_DELAY_MS3000, REQUEST_TIMEOUT_MS30000, MAX_RETRIES2, RETRY_BACKOFF_MS5000. network/5xx 때 지연 배수를 최대8까지 늘리고 정상 응답 시 점진적으로 회복한다.429는 즉시 중단한다. 이번 실제 run에는 오류가 없어 지연 증가가 발동하지 않았다. 관련 경로는 테스트했다. [robots](https://fconline.nexon.com/robots.txt)를 배치마다 확인했고 접근 제한을 우회하지 않았다. robots 결과는 상업적 재배포 허가가 아니다.

## 15. Resume

첫20구간 이후 PAUSED, 같은 run으로20구간을 재개했다. 이전 성공 구간을 재요청하지 않았으며 총40개 서로 다른 구간 요청이다. 현재 이어갈 명령:

```sh
npm run prices:collect:full -- --resume=cmualiypa0000tyfh10nnw2ax --max-segments=20
npm run prices:status:full -- --run=cmualiypa0000tyfh10nnw2ax
```

구간마다 응답/hash/시각/checkpoint를 저장한다. 일반 실패는 다른 pending 작업을 계속하며 보안 제한은 중단한다. 강제 종료 시30분 lease 만료 후 재개할 수 있다.

## 16. Performance

전체run 시간(배치 사이 중지 포함)752.769초,40요청/752.769=0.0531 requests/sec. 첫 배치에서는20/57.933=0.3452 requests/sec이며 start-to-start 최소3초 정책을 유지했다. 전체 평균 HTTP응답891.85ms, 가격 삽입17,888행, variant 신규17,888행, 실패0, retry0. Current projection은821→18,709행으로 증가했다. 역사 관측 update는0이며 projection refresh는 최신행을 재계산한다.

## 17. Database Growth Estimate

실측 **PlayerPriceSnapshot** 테이블+인덱스 크기는11,083,776bytes /18,744행, 약591.3bytes/행이다. 현재 관측 규모와 metadata 상한을 매일1회 저장한다고 가정한 선형 추정:

|기간|현재 검증 규모1,376명×13 행|관측 테이블 추정|metadata 상한 행|관측 테이블 추정|
|---|---:|---:|---:|---:|
|1일|17,888|10.09MiB|1,148,667|0.63GiB|
|7일|125,216|70.61MiB|8,040,669|4.43GiB|
|30일|536,640|302.63MiB|34,460,010|18.98GiB|
|365일|6,529,120|3.60GiB|419,263,455|230.89GiB|

현재 별도 실측: source snapshots311,296bytes, raw segment9,469,952bytes, Current projection5,513,216bytes, variants2,875,392bytes. 위 일별 추정에는 이들·WAL·백업·bloat가 포함되지 않는다. raw HTML 분할 비용은 분포에 따라 크게 달라져 전체 DB 실제 성장은 더 크다. 상한은 모든 metadata가13개 유효가격을 가진다는 가정이지 확보된 시장 크기가 아니다. 이번 작업에서 이력을 삭제하지 않았다.

## 18. Player UI Integration

기존 `/players`, `/players/[spid]`, 현재 가격/history API에 자동 반영된다. 실제 class100 검색24명 모두+13가격을 반환하고 이니에스타100000041 상세에서도 가격을 확인했다. 기존 미가격 선수 사례는 실제로 가격이 수집됐으므로 아직 미수집인26TOTS 선수로 missing-price 테스트를 갱신했다. observationFreshness(기본24시간)를 API에 추가했으며 기존 official reference freshness와 분리했다. 차트 UI는 만들지 않았다.

## 19. Pack Resolution Impact

관측 가격의 강화별·클래스별·다중 클래스 내림차순 조회 기반이 생겼다. PriceCurrent 인덱스는 분석용이며 검증된 보상 순위가 아니다. 데이터센터 조회 시각을 개봉일00~01시 기준 시각으로 바꾸지 않았다. referenceAt=null, 실제 rank snapshot0, 기존 선수팩은UNRESOLVED를 유지한다. 개봉 기능은 없다.

## 20. Tests

Unit106 PASS, Integration43 PASS, E2E66 PASS(desktop/mobile/tablet). 전체153클래스 계획 누락/중복, 강화/범위 누락, 실제 빈/가격 fixture, 가격 없음과0거부, 자동 분할, 중간 실패 후 독립 진행·resume skip, overlap current 중복 방지, history 보존, DB coverage,30자리 가격, 현재 순위 조회, freshness, 보안 차단을 검증했다. FC충전→공식 구매→인벤토리→보상 트리→확률→선수→가격 회귀가 통과했다. 실제40요청과 두 배치재개는 테스트 fixture가 아닌 공식 사이트 수집이다.

## 21. Build Verification

|검증|결과|
|---|---|
|npm run build|PASS|
|npm run typecheck|PASS|
|npm run lint|PASS|
|npm test|106 PASS|
|npm run test:integration|43 PASS|
|npm run test:e2e|66 PASS|

## 22. Known Issues

전체가격 coverage는아직1.56%이며145개 동적 구간이 pending이다. 전체 유효 시장 크기·모든 클래스의 유효 강화 여부·단일OVR200명 문제는 미완료다. 실제 양수0강이나 새로운 미표시 형식이 나타나면 검증 실패로 남기고 의미를 조사해야 한다. materialized ranking은 마지막 refresh 기준이며 일반 Player API의 indexed latest는 즉시 최신이다. 전체 상태 집계는 raw HTML을 읽지 않지만 모든 가격 식별자를 읽으므로 향후100만행 규모에서는 SQL 집계 최적화/실측이 필요하다. 공식 기준 시각·팩 eligibility/OVR·동률 규칙은 별도 미확인이다.

## 23. Operational Recommendation

우선20구간 배치를 재개하며 큰 클래스 분할/미표시를 확인한다. 추정만으로 매일 전체1,215회 이상을 무조건 예약하지 않는다. 전체 run의 실측 시간/오류율/데이터 변화량과 공식 이용 조건을 확인한 뒤 일별 또는 더 낮은 빈도의 full snapshot을 결정한다. 중요한 팩 reference-window 수집은 별도 targeted plan으로 운영한다. 이번에는 자동 스케줄러나 무기한 수집을 설치하지 않았다. 보존 기간/일별 집계/압축은 별도 설계하며 조기 삭제하지 않는다.

## 24. Ready for Reference Snapshot Phase?

**NO — 전체 시장 기반 완료 기준.** 관측/재개/시각 기록 기반은 준비됐지만 전체 coverage와 큰 클래스 한계 검증이 남았다. 공식 기준 시각의 의미도 해결되지 않았다. Phase4.6은PARTIAL로 보고하고 여기서 중단한다.
