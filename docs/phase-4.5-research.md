# Phase 4.5 — Data Center 조사 (2026-09-20 KST)

## 실제 요청과 응답

공식 [Data Center](https://fconline.nexon.com/datacenter)를 정상 Chromium으로 열고 Network 요청과 응답을 기록했다. 검색은 `POST https://fconline.nexon.com/datacenter/PlayerList`, 응답은 JSON이 아닌 `text/html` 선수 목록 fragment다. 브라우저가 이 HTML을 결과 영역에 삽입한다. 별도의 추정 API를 사용하지 않았다.

기본 검색 200명, UC 체크 후 113명, 가격 정렬 후 113명을 관찰했다. UI가 만든 공개 form 기본값은 `src/infrastructure/fconline-data-center/request-defaults.json`에 보존했다. 핵심 값:

|항목|관찰한 값 / 적용|
|---|---|
|클래스|`strSeason=,877,`|
|선택 강화|`n1Strong=1`|
|성장/팀컬러|`n1Grow=0`, `n1TeamColor=0`|
|OVR 범위|`n4OvrMin=0`, `n4OvrMax=200`|
|가격 정렬|`strOrderby= n8playergrade1 descending` (+1 가격)|
|페이지|`n4PageNo=1`; 다음 페이지 검증 안 됨|

사이트 JS의 페이지 문자열에는 `n4PageNo=1rd=...`처럼 임의값 구분자가 붙는 동작이 있었다. collector는 페이지 1을 명시하며 페이지 2를 추측하지 않는다. 최대 200명 안내와 실제 기본 결과 200명을 확인했다. 정확히 200명이면 잘린 결과일 가능성으로 처리하고 OVR 범위를 분할한다. 한 OVR에서도 200명이면 실패한다. OVR은 수집 구간 분할에만 사용하며 팩의 OVR 자격과 동일하다고 가정하지 않는다.

행 ID `area_playerunit_<spid>`, `Strong<spid>` 입력값, 선수 이름, `.td_ar_bp .span_bp1`~`.span_bp13`의 `title`을 교차 확인했다. 한 행에 +1~+13 실제 표시 가격이 모두 있으므로 강화마다 상세 요청할 필요가 없다. 수집 결과 정렬은 +1 기준이며 여러 강화가 섞인 TOP N 순위를 보장하지 않는다.

상세 링크는 사이트 JS의 `/DataCenter/PlayerInfo?spid=877020801&n1Strong=1`을 실제 방문해 확인했다. 상세 화면은 선수 정보와 JS 동작을 포함한다. 이번 가격 수집은 목록 HTML만 사용한다. 이전 Phase의 `PlayerPriceGraph` 일자별 값은 정확한 기준 시각·집계 의미가 확인되지 않아 가져오지 않았다.

## 가격 의미

공식 화면은 선수 가격과 기준가 안내를 제공하며 약 2시간 갱신, 선수별 반영 시차, 게임 기준가와 차이가 있을 수 있음을 안내한다. 수집 값은 **공식 데이터센터에 표시된 강화별 가격 관측값**이다. 최근 체결가·평균가·상하한가로 재해석하지 않는다. 게임의 특정 00~01시 기준가와 동등하다는 근거는 없어 `NEEDS_VERIFICATION`, `referenceAt=null`, freshness `UNKNOWN`을 유지한다.

## 접근 정책

[robots.txt](https://fconline.nexon.com/robots.txt)는 조사 시 Bingbot에 `/community/*`, `/news/*`를 제한했고 Data Center에 해당하는 제한은 없었다. CLI도 실행 시 다시 읽고 해당 경로 제한/비정상 응답이면 중단한다. robots에 제한이 없다는 것은 이용 허가나 재배포 라이선스가 아니다.

공식 footer의 [넥슨 이용약관](https://member.nexon.com/policy/stipulation.aspx)을 실제 브라우저 iframe에서 읽었다. 제11조의 무단 복제·배포·영리 이용 및 서비스 방해 관련 제한을 확인했다. 이번 실행은 제한된 공개 요청을 통한 로컬 검증이며, 지속적인 대량 수집·상용 재배포 허가를 확인한 것으로 간주하지 않는다. 자동 작업은 설치하지 않았다. 인증 우회, CAPTCHA 해결, 프록시 교체, 브라우저 위장 헤더를 사용하지 않는다. 401/403/429 또는 보안/점검 화면이면 중단한다.

## 증거와 fixture

로컬 연구 기록은 Git 제외 `.local/phase45-research/`의 requests.json, list-0/1/2.html, robots.txt, terms-1.txt 등에 있다. DB의 실제 segment에는 원본 가격 HTML·SHA256·관측 시각을 보존했다. 저장소 fixture는 실제 UC 응답에서 선수 2개 행만 추출했고 `tests/fixtures/datacenter/provenance.json`에 원본/부분 fixture 해시와 추출 범위를 기록했다. 이 fixture는 전체 후보나 과거 공식 순위를 증명하지 않는다. 200명/750명 시험 데이터는 명시적인 합성 테스트이며 실제 DB의 공식 데이터가 아니다.
