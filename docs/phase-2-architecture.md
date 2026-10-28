# Phase 2 — Persistence, transactions, API

## State ownership

`POST /api/playground`가 256비트 무작위 토큰을 HttpOnly / SameSite=Lax / Path=/ 쿠키로 설정합니다. 유효기간은 최초 생성 후 30일이며 HTTPS에서는 Secure를 사용합니다. DB에는 토큰 원문 대신 SHA-256 해시를 저장합니다. UI와 JSON에는 토큰/브라우저 ID를 노출하지 않습니다. 소유자는 쿠키로만 결정하며 요청 본문에서 지정할 수 없습니다.

클라이언트의 최초 요청은 단일 진행 중 Promise로 합치고 Web Locks 지원 브라우저에서는 탭 사이에도 직렬화합니다. 상태는 PostgreSQL에 있고 새로고침·브라우저 재실행 후 유지됩니다. 쿠키 만료/삭제 후에는 새로운 상태와 FC 0으로 시작합니다. 쿠키 공유 없이 다른 브라우저/기기로 복구하는 기능은 없습니다.

브라우저 저장소에는 재시도할 요청 키·본문만 보관합니다. 결제 또는 인증 비밀은 없으며 localStorage를 잔액의 원본으로 사용하지 않습니다. sessionStorage 사용 불가 환경에서는 현재 페이지의 재시도는 가능하지만 미확정 요청의 새로고침 복구는 제공되지 않습니다.

## Model

- `BrowserState`: 토큰 해시, 만료, 초기화 세대(epoch), 변경 번호(revision).
- `WalletBalance`: 브라우저 + 데이터 구분 + 통화별 유일 잔액. 현재 UI는 MOCK FC만 사용.
- `WalletEntry`: CHARGE / PURCHASE / RESET, 부호 있는 금액, 처리 후 잔액, 사유, 출처 옵션/구매, 생성 시각.
- `FCChargeOption`: 기본 FC, 추가 FC, 표시 순서, 활성 상태, 기존 DatasetVersion 참조. 출처/검증 정보는 데이터셋에서 상속.
- `PurchasePolicy`: 상품 버전별 시뮬레이터 구매 활성 여부 및 초기화 전 최대 수량. 공식 사실 필드와 분리.
- `Purchase`: 상품 버전 및 이름/단가/총액 스냅샷, 수량, 브라우저, 세대, 데이터 구분.
- `InventoryEntry`: 직접 구성품 버전 및 이름/유형 스냅샷, 수량, 구매 출처, 브라우저, 세대.
- `IdempotencyRecord`: 브라우저+UUID 유일 키, 요청 해시, 원래 처리 영수증.

카탈로그 모델은 유지됩니다. 잔액은 BIGINT, API 금액은 10진 문자열이며 클라이언트 표시/계산도 BigInt를 사용합니다. DB CHECK로 음수 잔액, 잘못된 충전량·수량·원장 부호를 막습니다.

## Atomic writes and races

모든 상태 읽기/변경은 해당 BrowserState 행의 PostgreSQL `FOR UPDATE` 잠금 후 진행합니다. 다른 브라우저는 별도 잠금입니다. 같은 브라우저의 충전·구매·초기화를 순서대로 처리하여 잔액 검사와 차감 사이의 경쟁을 막습니다.

구매 한 트랜잭션: 요청 검증 → 서버 상품 버전/가격/정책/구성 조회 → 잔액/누적 한도 검사 → 차감 → 구매 → 원장 → 직접 구성품 지급 → revision 증가 → 재시도 영수증 저장. 중간에 어떤 단계가 실패해도 전부 롤백됩니다. 구성품의 자식 관계는 조회/지급하지 않습니다.

초기화는 원장에 잔액의 반대 금액을 기록하고 balance=0, epoch+1로 바꿉니다. 기존 구매/인벤토리는 감사 기록으로 남지만 현재 조회와 한도 계산에서는 제외됩니다. 이전 epoch 요청은 409로 거절합니다. 이미 완료된 요청 키를 다시 보내면 원래 영수증과 **현재 상태**만 반환하여, 초기화 이후 과거 충전/구매가 재실행되거나 과거 잔액으로 UI가 돌아가지 않습니다.

클라이언트는 의도한 행동마다 새 UUID를 생성합니다. 처리 중 버튼과 동기 ref 잠금으로 빠른 중복 클릭을 막고, 응답 유실/5xx에는 같은 키와 본문을 유지해 사용자가 결과를 다시 확인하도록 합니다. reload 후에도 이 요청을 복구합니다. 같은 키에 다른 본문은 409입니다. 성공한 기록을 브라우저별 최근 10초 30회로 제한하고, 최대 잔액은 1조 FC, 구매 수량은 요청당 1–100개입니다. 정상 반복 클릭은 새 키이므로 누적됩니다.

상태 응답은 revision으로 정렬하고 오래된 응답은 무시합니다. BroadcastChannel과 창 focus 시 재조회로 탭 사이의 변경을 반영합니다.

## API contract

모든 개인 상태 응답: `Cache-Control: private, no-store`, `Vary: Cookie`. 변경 API는 동일 출처 Origin, JSON Content-Type, 최대 4KB 본문만 허용합니다. 로컬에서는 공개 Host와 Origin을 비교하고 프록시 배포에서는 `APP_ORIGIN`을 정확히 설정합니다. 추가 가격/금액/소유자 필드는 strict Zod에서 거절합니다.

| Method / route | Body / result |
|---|---|
| POST `/api/playground` | `{}` → 현재 상태. 처음이면 FC 0 + 쿠키 |
| GET `/api/wallet` | `balance`, `epoch`, `revision`, `dataType`, 상품별 `purchased` |
| GET `/api/fc/options` | 옵션 ID, 기본/추가/총 FC, 출처·검증 metadata |
| POST `/api/fc/charges` | `{chargeOptionId, epoch}` |
| POST `/api/purchases` | `{productId, quantity, epoch}` |
| GET `/api/inventory` | 현재 상태 + 현재 세대의 보유품/구매 출처 |
| POST `/api/playground/reset` | `{epoch}` |

충전/구매/초기화는 `Idempotency-Key: <UUID>`가 필수이며 `{state, receipt, replayed}`를 반환합니다. 영수증은 원래 행동의 금액/수량이며 `state`는 최신 상태입니다. 원장 조회 UI는 이번 범위에 없습니다.

오류: 400 입력 형식/추가 필드, 403 외부 출처, 404 없는 상품, 409 잔액 부족/한도/키 충돌/이전 세대, 413 큰 본문, 419 쿠키 없음/만료, 422 비활성·미검증 구성, 429 속도 제한, 503 DB/처리 결과 불명. 원시 SQL·토큰·연결 정보는 오류 응답에 포함하지 않습니다.

## Data and operations

마이그레이션: `202609190001_playground`. `npm run db:seed`는 Phase 1 Mock 카탈로그와 Phase 2 옵션/정책을 차례로 검증해 넣습니다. 재실행은 중복 생성이나 과거 버전 덮어쓰기를 하지 않습니다. FC 옵션과 정책을 수정하려면 명시적 새 버전 또는 별도 운영 변경 절차가 필요합니다.

통합 테스트 DB는 `_test` 접미사를 강제하며 자신이 생성한 행만 정리합니다. E2E는 개발 DB에 별도의 쿠키 상태를 생성합니다. 만료/테스트 데이터 자동 정리 작업, 운영 규모의 트래픽 제어와 페이지네이션은 아직 없습니다. Pack Opening과 실제 결제는 구현하지 않았습니다.
