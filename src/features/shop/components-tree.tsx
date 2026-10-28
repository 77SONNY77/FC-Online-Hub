import Link from 'next/link';
import type { ComponentNode } from '@/contracts/catalog';
import { sourceLabel } from './format';
const kindLabels = { PLAYER_PACK: '선수팩', BOX: '상자', BP_CARD: 'BP 카드', EVENT_ITEM: '이벤트 아이템' };
export function ComponentsTree({ nodes, nested = false }: { nodes: ComponentNode[]; nested?: boolean }) {
  return <ul className={nested ? 'component-tree nested' : 'component-tree'}>{nodes.map(node => <li key={node.id}>
    <div className="component-row"><span className={`item-symbol ${node.kind.toLowerCase()}`} aria-hidden="true">{node.kind === 'BOX' ? '▣' : node.kind === 'PLAYER_PACK' ? '▱' : node.kind === 'BP_CARD' ? 'B' : '◇'}</span><div className="component-copy"><span className="eyebrow">{kindLabels[node.kind]} · {sourceLabel(node.metadata)}</span><h3>{node.name}</h3><p>{node.description}</p>{node.probability && <Link className="probability-link" href={`/items/${node.id}/probabilities`}>확률 정보 · {node.probability.entryCount.toLocaleString('ko-KR')}개 보상 ↗</Link>}</div><span className="quantity">× {node.quantity}</span></div>
    {node.children.length > 0 ? <details open={node.metadata.dataType === 'MOCK'}><summary>{node.rewardBehavior === 'WEIGHTED_RANDOM' ? '가능한 보상' : '내부 구성'} {node.children.length}종 <span>{node.rewardBehavior === 'WEIGHTED_RANDOM' ? '중 1종 획득 · 전부 지급되지 않음' : '수량은 상자 1개 기준'}</span></summary><ComponentsTree nodes={node.children} nested /></details> : node.compositionStatus === 'UNKNOWN' && node.kind !== 'EVENT_ITEM' && <p className="component-note">세부 구성 정보 확인 필요</p>}
  </li>)}</ul>;
}
