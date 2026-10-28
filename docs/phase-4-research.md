# Phase 4 공식 선수·가격 조사

조사일: 2026-09-20 KST. 공식 메타데이터는 실제 다운로드했고, Data Center는 일반 Playwright 브라우저로 읽었다. 인증·접근 제한을 우회하지 않았다.

## 선수 ID와 클래스

[Nexon 메타데이터 문서](https://openapi.nexon.com/game/fconline/?id=5)에 연결된 [공식 YAML](https://openapi.nexon.com/static/api/fconline/5_script00000000000000.yaml)을 다시 다운로드했다. 설명은 SPID가 **시즌 ID 3자리 + 선수 ID 6자리**임을 명시한다. 이 규칙을 확인한 뒤에만 SPID를 분리했다. pid는 선행 0을 포함한 6자리 문자열로 보존한다. 같은 이름을 같은 선수라고 합치지 않는다.

| 실제 다운로드한 출처 | 확인 내용 |
|---|---|
| [spid.json](https://open.api.nexon.com/static/fconline/meta/spid.json) | id, name; 88,359행 |
| [seasonid.json](https://open.api.nexon.com/static/fconline/meta/seasonid.json) | seasonId, className, seasonImg; 153행 |

전체 SPID 중복 0, 누락/빈 이름 0, 잘못된 클래스 연결 0을 검사하고 DB에 등록했다. UC는 **877 / UC (Untouchable Champions)**, 26TOTS는 **866 / 26 TOTS (26 Team Of The Season)**다. 공식 이름을 임의로 축약해 저장하지 않는다.

[공식 이미지 문서](https://openapi.nexon.com/game/fconline/?id=6)가 안내하는 `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p{spid}.png`를 사용한다. 이는 문서화된 URL 매핑이며 모든 이미지 파일의 존재를 보증하지 않는다. 실패하면 이미지 없음 UI로 대체한다. 클래스 이미지 URL도 메타데이터 원문대로 저장한다.

포지션 사전은 선수별 포지션이 아니다. spid.json에는 OVR·강화별 가격·선수별 포지션이 없다. 다른 필드를 임의 생성하지 않았다.

## API 이용량과 키

[공식 이용 제한 FAQ](https://openapi.nexon.com/support/faq/2354215/)와 [준비 안내](https://openapi.nexon.com/ko/guide/prepare-in-advance/)를 확인했다. 개발 단계는 초당 5건/하루 1,000건, 서비스 단계는 초당 500건/하루 20,000,000건이다. 실제 키별 적용 정책은 운영 전 다시 확인해야 한다.

이번 수집은 키가 필요 없는 공개 static JSON 2개를 순서대로 요청했다. 요청 사이 1초 간격, 요청당 30초 timeout, 최대 3회 시도와 429/5xx 재시도 제한을 둔다. 긴 Retry-After는 자동 재시도하지 않고 종료한다. API 키를 읽거나 외부 이미지 요청에 전달하지 않는다.

## 가격 경로

확인한 공개 API 문서에서 전역 현재 기준가 API는 확인하지 못했다. [계정 API 정의서](https://openapi.nexon.com/static/api/fconline/2_script00000000000000.yaml)의 본인 거래 기록은 현재 전체 시장 기준가나 과거 순위 기준 스냅샷을 대신하지 않는다.

[공식 Data Center](https://fconline.nexon.com/datacenter)는 클래스·이름·강화·포지션·OVR 등으로 검색한다. 화면이 호출한 **POST `/datacenter/PlayerList`**의 200 응답을 브라우저 네트워크에서 확인했다. 목록 스크립트는 폼 데이터와 `n4PageNo=1`을 보낸다. 페이지 번호 파라미터가 있다고 해서 전체 데이터셋 순회가 가능하다고 가정하지 않았다.

공식 안내는 **2시간마다 갱신**, 반영 지연, 선수마다 다른 갱신 시점, 게임 내 기준가와의 불일치 가능성, **최대 200명 노출**을 명시한다. 이번 collector는 공개 첫 페이지 한 번만 읽고, 그 안의 UC 선수 최대 5명만 가격 표본으로 선택한다. 가격은 강화별 `.span_bp1`~`.span_bp13`의 정수 title 값을 읽는다. 검색 결과 제한을 우회하거나 모든 선수×강화를 대량 순회하지 않았다.

## 실제 관측 표본

관측 시각: **2026-09-20 13:32:26.256 KST** (`2026-09-20T04:32:26.256Z`). 공식 기준 시각은 공개되지 않아 **referenceAt=null**이다.

| SPID | UC 선수 | 확보 강화 단계 | +1 화면 관측 가격 |
|---|---|---|---:|
| 877028130 | 호나우지뉴 | 1~13 | 1,840,000 BP |
| 877156616 | 프랑크 리베리 | 1~13 | 1,870,000 BP |
| 877158023 | 리오넬 메시 | 1~13 | 1,770,000 BP |
| 877188545 | 레반도프스키 | 1~13 | 2,060,000 BP |
| 877001625 | 티에리 앙리 | 1~13 | 944,000 BP |

총 5명 / 65 variants / 65 가격 관측값이다. 공식 웹에서 읽은 가격이지만 정확한 기준 시점·최신성을 검증하지 못해 NEEDS_VERIFICATION 및 freshness UNKNOWN으로 저장한다. 수집 시각을 공식 기준 시각으로 복사하지 않는다.

선택되어 있던 +1 화면에서 포지션과 OVR 표시값 5건을 함께 보존했다. 기본/강화 순수 OVR의 정의와 팩의 `119+` 조건의 기준을 동일하다고 단정하지 않는다. 나머지 강화 OVR은 null이다. 화면에 없는 OVR을 강화 공식으로 계산하지 않는다.

## 가격 그래프 추가 확인

공식 화면의 공개 스크립트가 사용하는 **POST `/datacenter/PlayerPriceGraph`**, `spid=877028130&n1strong=1`을 한 번 요청했고 200 HTML을 받았다. 현재가와 `9.10`~`9.19`처럼 일자만 있는 그래프 값이 있었다. 연도·가격의 정확한 시각·집계 방식이 해당 배열에서 확인되지 않았다. 이 일별 값을 개봉일 0~1시 스냅샷이나 내부 가격 이력으로 가져오지 않았다.

## 순위 연결을 막는 조건

- 특정 날짜의 0~1시 공식 기준 가격이 없음.
- 클래스·강화·OVR·생성 제한을 모두 충족하는 완전한 후보 집합이 없음.
- 서로 다른 선수 가격을 동일 기준 시점에 비교할 수 있다는 근거가 없음.
- 동률 처리 규칙과 일부 팩의 OVR 기준이 미확인.

따라서 6개 선수팩의 실제 선수 매핑은 전부 UNRESOLVED다. 다음 단계는 일반적인 최신 가격 확대 수집보다 공식 기준 시각과 후보 완전성을 검증할 수 있는 출처 확보가 먼저다. 확인된 스냅샷이 없으면 개봉 엔진으로 넘어가지 않는다.

[FC Detox](https://fcdetox.com/)는 선수/가치와 구성 정보를 함께 보여주는 UX 참고로만 확인했다. 해당 사이트 가격·계산값은 공식 DB에 등록하지 않았다.
