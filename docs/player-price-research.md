# 선수·가격 후속 조사

2026-09-20 공개 공식 문서와 Data Center 화면 및 화면이 참조하는 공개 스크립트를 확인했다. 전체 선수 DB, 가격 수집기, 실제 선수 순위 매핑은 구현하지 않았다. API 키를 사용하지 않았다.

## Nexon Open API

[메타데이터 공식 문서](https://openapi.nexon.com/game/fconline/?id=5)와 연결된 [공식 메타데이터 YAML](https://openapi.nexon.com/static/api/fconline/5_script00000000000000.yaml)을 확인했다. 메타데이터 호스트는 `https://open.api.nexon.com`이다.

| 경로 | 확보 가능한 값 / 한계 |
|---|---|
| /static/fconline/meta/spid.json | 선수 id, name. 이 스키마에는 OVR나 현재 가격이 없음 |
| /static/fconline/meta/seasonid.json | seasonId, className, seasonImg |
| /static/fconline/meta/spposition.json | spposition, desc. 포지션 사전이며 선수별 포지션 매핑이 아님 |
| matchtype / division / division-volta JSON | 경기 유형·등급 사전 |

[이미지 공식 문서](https://openapi.nexon.com/game/fconline/?id=6)는 `https://fco.dn.nexoncdn.co.kr` 아래 `live/externalAssets/common/playersAction/p{spid}.png`, `p{pid}.png`, 일반 이미지의 `players/p{spid}.png`, `p{pid}.png` 형식을 안내한다. 실제 전체 이미지 다운로드나 모든 선수 이미지의 존재 검증은 하지 않았다. 향후 개별 조회의 실패 처리가 필요하다.

[계정 API 공식 YAML](https://openapi.nexon.com/static/api/fconline/2_script00000000000000.yaml)의 `/fconline/v1/user/trade`는 API 키가 필요한 본인 거래 기록이다. offset/limit을 사용하며 limit 상한은 100이다. 거래 당시 강화·가격은 현재 전체 시장 기준가와 다르다. 확인한 공개 문서에서는 전체 선수의 현재 기준가를 제공하는 지원 API를 확인하지 못했다.

## Data Center

[공식 Data Center](https://fconline.nexon.com/datacenter)는 클래스·포지션·강화(1~13)·OVR·급여·가격 필터와 선수별 포지션/OVR 및 강화별 가격 화면을 제공한다. 안내에는 **2시간 단위 갱신**, 선수별 반영 시점 차이, 실제 게임과의 차이 가능성, **최대 200명 노출** 제한이 명시되어 있다.

실제 화면이 참조한 공개 `Scripts/datacenter/datacenter.js`를 읽었다. GetPlayerList는 폼 데이터와 `n4PageNo=1`을 POST `/datacenter/PlayerList`에 보내 HTML을 받는다. 페이지 번호 파라미터의 존재만으로 전체 선수 집합을 순회할 수 있다고 결론 내리지 않았다. 200명 제한 우회나 대량 요청은 하지 않았다.

## Price Rank Snapshot 가능성

현재 조사 결과만으로는 UC Top Price 750 전체를 공식 팩의 개봉일 0~1시 기준과 일치하게 매핑할 수 없다. 다음 조건을 해결한 뒤 매핑해야 한다.

- 해당 클래스·강화·OVR 및 생성 제한 조건에 맞는 완전한 후보 집합.
- 가격의 기준 시각, 갱신 지연과 동일 시점 일관성을 확인할 수 있는 출처.
- 동률 순위 규칙과 후보 누락을 검증할 방법.
- 재현 가능한 수집 시각·원문 해시·조건·버전을 포함한 불변 스냅샷.

Data Center의 200명 화면과 2시간 단위 갱신만으로는 위 조건을 충족하지 못한다. 현재 6개 선수팩은 PRICE_RANK와 원문 조건을 저장하며 선수 이름·ID·현재 기준가를 추측하지 않는다. 선수 기본 ID/이름·클래스 사전과 이미지 경로는 후속 단계에서 활용 가능하지만, 선수별 OVR·포지션·강화별 가격은 별도의 검증된 데이터 확보가 필요하다.
