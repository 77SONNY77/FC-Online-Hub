# Phase 4 선수·가격·순위 구조

기존 상품/보상 정의, 지갑, 구매, 인벤토리는 유지한다. 추가 기능은 공식 메타데이터와 관측 가격을 저장하고, 조건에 맞는 검증된 순위 스냅샷이 있을 때만 선수 연결을 허용하는 기반이다.

## 데이터 모델

| 모델 | 역할 |
|---|---|
| PlayerDataset | API 원문 JSON 2개, 수집 시각, 출처, SHA-256의 불변 버전 |
| Season | 공식 클래스 ID·이름·이미지, 메타데이터 버전 연결 |
| Player | SPID PK, 6자리 pid, 공식 이름, 클래스 FK, 공식 이미지 규칙, 출처 버전, 확인 시각 |
| PlayerVariant | SPID + enhancement 유일성; 현재는 실제 가격 관측 단계만 생성 |
| PriceSourceSnapshot | 공식 페이지 추출 가격 본문, 출처, 수집 시각, 해시·조건/한계 |
| PlayerPriceSnapshot | variant FK, Decimal(30,0), referenceAt?, observedAt, 검증 상태, 화면 OVR/포지션? |
| PlayerPriceRankSnapshot | 보상 pool FK, KST 기준일/시간창, 조건 JSON·해시, 완전성·후보 수·동률 정책·검증 상태·버전 |
| PlayerPriceRankEntry | 순위, variant FK, 가격 관측 FK, 후보 사용 가능 여부 |

정밀 BP는 API에서도 문자열이며 화면은 BigInt로 구분자를 넣는다. 누락 가격은 null이며 0을 대신 입력하지 않는다. 가격을 Player row에 덮어쓰지 않는다. 같은 출처/관측 시각 및 같은 variant/source snapshot의 중복을 차단한다. 후속 관측은 별도 이력으로 누적한다. 실제 역사 순위 스냅샷은 현재 **0개**다.

`202609200002_player_prices`, `202609200003_player_constraints`는 additive migration이다. `202609200004_player_observation_utc`는 원본 metadata 관측 시각에 맞춰 초기 bulk SQL 시간대 변환을 교정한다. 이후 bulk 입력은 UTC를 명시한다. FK·SPID 규칙·강화 범위·가격 양수·시각 순서·순위 양수 제약을 적용한다.

## Collector / import

`src/jobs/player-metadata.ts`는 공개 metadata 2개를 직렬 수집하고 Zod, SPID 중복, 이름 누락, 시즌 연결, 이미지 출처를 검증한다. 전체 검증 이후 트랜잭션으로 게시한다. 원문 hash가 같으면 no-op, 더 오래된 다른 metadata로 최신 자료를 되돌리면 거절한다. 1,000행씩 parameterized SQL upsert하여 88,359번의 개별 DB 요청을 피한다. 원문 버전은 보존하고 목록은 최신 데이터셋 기준으로 조회한다.

`src/jobs/player-prices.ts`는 일반 Chromium으로 공식 첫 페이지를 한 번 열어 최대 UC 5명의 강화별 가격을 추출한다. 보안 확인이나 HTML 형식 변경으로 실패하면 종료하며 우회하지 않는다. 공식 가격 페이지는 안정된 API라고 주장하지 않으며 자동 재시도 폭주·자동 스케줄러를 두지 않는다. 성공 표본 수를 로그에 출력하고 나머지는 미수집 상태로 둔다.

가격 importer는 이름/SPID를 공식 metadata와 대조하고, 불완전/잘못된 입력은 트랜잭션 밖 검증 또는 전체 rollback으로 거절한다. 현재 Data Center importer는 어떤 non-null referenceAt도 허용하지 않는다. 같은 출처·시각의 다른 값은 불변 관측 충돌로 거절한다. PostgreSQL advisory lock으로 metadata 및 가격의 동시 게시를 각각 직렬화한다.

`--offline`은 성공적으로 수집한 `.local` capture를 검증하고 재등록한다. 원문 보존의 기준은 API JSON 원문 및 추출 가격 JSON이며, 가격 JSON의 해시는 원본 HTML 바이트 해시라고 주장하지 않는다. DB에 원문이 있으므로 로컬 capture가 사라져도 기존 화면은 계속 동작한다. 프런트엔드 요청에서 외부 데이터를 수집하지 않는다.

## 시간과 검증 상태

- referenceAt: 가격이 의미하는 공식 기준 시각. 모르면 null.
- observedAt: 수집기가 확인한 시각. 기준 시각을 대신하지 않는다.
- freshness: 유효한 referenceAt이 있고 2시간 이내면 FRESH, 초과면 STALE. 기준 시각 미확인·모순·미래 시각은 UNKNOWN. 2시간은 화면 갱신 안내에 기반한 표시 정책이며 실제 게임과 일치를 보증하지 않는다.
- 수집 가격 65건: OFFICIAL_WEB / NEEDS_VERIFICATION / referenceAt=null / UNKNOWN.

선수 기본 metadata 검증과 가격 검증은 별개다. 가격의 공식 출처를 표시하더라도 최신의 정확한 기준가라고 표현하지 않는다. OVR/포지션은 선택된 강화 단계의 화면 관측값만 표시한다.

## 보상 연결

`resolvePriceRank()`는 순수 도메인 서비스다. 입력은 검증된 조건, KST 기준일, 후보 스냅샷이다. 아래 항목을 모두 검사한다.

1. pool ID·원문 조건 해시·클래스·강화·최소 OVR 조건의 일치.
2. 정확한 기준일과 00:00~01:00 KST 시간창.
3. 가격의 기준 시각이 시간창 안에 있고 후보 전체의 기준 시각이 동일함.
4. 확인 시각이 기준 시각보다 빠르지 않음, 미래 관측이 아님.
5. 검증된 공식 출처와 완전한 후보 집합, rank 1..N 연속성, variant 중복 없음.
6. 클래스·강화·OVR·사용 가능 여부가 각 후보에서 충족됨.
7. 가격 내림차순. 현재는 NO_TIES만 지원하며 동률은 거절함.

조건의 OVR 기준이 UNKNOWN이면 해당 조건을 추측하여 평가하지 않는다. 동일 조건의 후보 스냅샷이 여러 개면 검토 필요 상태로 둔다. 최신 관측값으로 과거 순위를 생성하는 경로는 없다. 저장 모델과 검증/읽기 경로만 제공하며, 현재 수집 표본을 rank snapshot으로 게시하는 작업은 하지 않는다.

실제 Phase 3의 6개 선수팩 조건을 버전별로 매핑했다. 지원하지 않는 정의·조건은 NEEDS_VERIFICATION으로 남긴다. `resolutionCoverage()`는 실제 확률표와 중첩 아이템을 순회하여 상태를 계산한다. `data:resolution -- YYYY-MM-DD`는 이 계산 결과만 출력하며 DB나 지갑에 보상을 쓰지 않는다.

**Coverage 의미**: BP_AMOUNT 정의는 확인됨. NESTED_ITEM은 최종 자식 정의까지 전부 확인돼야 resolved entry로 센다. 일부 자식만 확인되면 PARTIALLY_RESOLVED이며 resolved entry 수에는 포함하지 않는다. 따라서 12표 중 완전 2 / 일부 4 / 미연결 6, 1,208행 중 완전 확인 5 / 미완료 1,203이다. 완전 확인 5행은 BP 정의 2행과 BP를 가리키는 중첩 3행이며 실제 선수 연결은 0건이다.

## 조회·UI·API

선수 목록/상세는 공통 application service → repository → PostgreSQL을 사용한다. 검색은 이름 contains + 클래스 + 강화, SPID를 보조 정렬 키로 사용한다. 목록 24명, 관측 이력 50건씩 조회한다. API 입력/출력은 Zod 검증, 오류는 400/404/503으로 정리하고 내부 DB 오류를 노출하지 않는다.

- `/players`: 이름 검색, 클래스/강화 필터, 이미지 fallback, 해당 강화의 최근 관측값 또는 미확인 표시.
- `/players/[spid]`: 1~13강 선택, 실제 가격이 있는 단계 표시, 가격·기준/관측 시각·조건·출처.
- `/api/players`, `/api/players/[spid]`, `/price`, `/price-history`: metadata 및 관측 이력 조회. 가격 이력이 없으면 빈 배열과 UNAVAILABLE.
- 기존 확률 API: pool resolutionStatus/resolutionDate, 행별 resolution 및 nullable player를 추가. UI에서 내부 enum을 그대로 표시하지 않는다.

선수 연결이 검증되면 기존 원문 옆에 선수·강화·가격·기준 시각·출처 및 선수 상세 링크를 렌더링할 수 있다. 현재 데이터에서는 player=null이며 원문 TOP N을 유지한다. 글로벌 메뉴는 상점 / FC 구매 / 인벤토리 / 선수다. 개봉·추첨·선수 지급은 없다.
