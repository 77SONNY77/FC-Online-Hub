import type { CatalogDataset } from '@/domain/catalog/dataset';

// Entirely synthetic. No real product, probability, or price is represented here.
export const mockCatalog: CatalogDataset = {
  sourceId: 'local-design-fixtures',
  metadata: {
    datasetId: 'mock-catalog-v1', datasetVersion: 1,
    source: 'MOCK', sourceName: '프로젝트 개발용 예시', sourceUrl: null,
    sourceNotes: '상품·가격·구성은 화면과 데이터 구조를 검증하기 위해 자체 작성했습니다. 실제 FC Online 상품이 아닙니다.',
    verificationStatus: 'NEEDS_VERIFICATION', verified: false, verifiedAt: null,
    lastUpdatedAt: '2026-09-18T04:00:00.000Z', dataType: 'MOCK',
  },
  items: [
    { id: 'demo-player-pack-v1', itemId: 'demo-player-pack', version: 1, name: '선수팩 A · 개발용', kind: 'PLAYER_PACK', description: '선수팩 유형을 보여주는 예시입니다. 선수 구성과 확률은 정의하지 않았습니다.', compositionStatus: 'UNKNOWN', children: [] },
    { id: 'demo-bp-card-v1', itemId: 'demo-bp-card', version: 1, name: 'BP 카드 · 개발용', kind: 'BP_CARD', description: 'BP 카드 유형 예시입니다. 지급 금액은 정의하지 않았습니다.', compositionStatus: 'UNKNOWN', children: [] },
    { id: 'demo-box-v1', itemId: 'demo-box', version: 1, name: '구성 확인 상자 · 개발용', kind: 'BOX', description: '아래 두 아이템으로 구성된 구조 예시입니다. 확률형 보상 규칙을 의미하지 않습니다.', compositionStatus: 'DOCUMENTED', children: [{ itemVersionId: 'demo-player-pack-v1', quantity: 1 }, { itemVersionId: 'demo-bp-card-v1', quantity: 2 }] },
    { id: 'demo-event-item-v1', itemId: 'demo-event-item', version: 1, name: '이벤트 아이템 · 개발용', kind: 'EVENT_ITEM', description: '이벤트 아이템 유형을 확인하는 예시입니다. 실제 이벤트와 연결되지 않습니다.', compositionStatus: 'UNKNOWN', children: [] },
  ],
  products: [
    { id: 'demo-foundation-package', versionId: 'demo-foundation-package-v1', version: 1,
      name: '파운데이션 패키지', description: '선수팩과 상자, 이벤트 아이템으로 구성한 개발용 패키지입니다. 구성품의 종류와 수량, 중첩 구조를 확인할 수 있습니다.',
      imagePath: '/images/foundation-pack.svg', price: '1200', currency: 'VIRTUAL_FC',
      salePeriod: null, purchaseLimit: null, compositionStatus: 'DOCUMENTED',
      components: [{ itemVersionId: 'demo-player-pack-v1', quantity: 5 }, { itemVersionId: 'demo-box-v1', quantity: 3 }, { itemVersionId: 'demo-event-item-v1', quantity: 1 }] },
    { id: 'demo-discovery-box', versionId: 'demo-discovery-box-v1', version: 1,
      name: '디스커버리 박스', description: '상자 안의 아이템까지 단계별로 살펴보는 개발용 상품입니다. 표기된 가격은 예시용 가상 단위입니다.',
      imagePath: '/images/discovery-box.svg', price: '600', currency: 'VIRTUAL_FC',
      salePeriod: null, purchaseLimit: null, compositionStatus: 'DOCUMENTED',
      components: [{ itemVersionId: 'demo-box-v1', quantity: 1 }] },
    { id: 'demo-unverified-package', versionId: 'demo-unverified-package-v1', version: 1,
      name: '데이터 확인용 패키지', description: '가격과 구성 정보를 아직 확보하지 못한 경우를 보여주는 개발용 상품입니다. 확인되지 않은 값을 임의로 채우지 않습니다.',
      imagePath: '/images/unverified-pack.svg', price: null, currency: null,
      salePeriod: null, purchaseLimit: null, compositionStatus: 'UNKNOWN', components: [] },
  ],
};
