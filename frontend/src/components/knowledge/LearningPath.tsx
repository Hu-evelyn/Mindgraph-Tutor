import { useState } from 'react';
import type { DbKnowledgeNode } from '../../types';

interface LearningPathProps {
  nodes: DbKnowledgeNode[];
  onSelect: (nodeId: number) => void;
}

function createLearningOrder(nodes: DbKnowledgeNode[]) {
  const byId = new Map<number, DbKnowledgeNode>(nodes.map(node => [node.id, node] as const));
  const outgoing = new Map<number, Set<number>>();
  const inDegree = new Map<number, number>(nodes.map(node => [node.id, 0] as const));

  const addEdge = (from: number, to: number) => {
    if (!byId.has(from) || !byId.has(to) || from === to) return;
    const edges = outgoing.get(from) ?? new Set<number>();
    if (edges.has(to)) return;
    edges.add(to);
    outgoing.set(from, edges);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  };

  nodes.forEach(node => {
    if (node.parent_id === null) return;
    // PREREQUISITE 节点优先于其父主题；普通组成关系沿根到叶学习。
    if (node.relation_type === 'PREREQUISITE') addEdge(node.id, node.parent_id);
    else addEdge(node.parent_id, node.id);
  });

  const priority = (node: DbKnowledgeNode) =>
    (node.is_core ? 0 : 10)
    + (node.importance === 'high' ? 0 : node.importance === 'medium' ? 2 : 4)
    + (node.difficulty === 'easy' ? 0 : node.difficulty === 'medium' ? 1 : 2);
  const ready = nodes.filter(node => inDegree.get(node.id) === 0);
  const ordered: DbKnowledgeNode[] = [];
  while (ready.length) {
    ready.sort((left, right) => priority(left) - priority(right) || left.id - right.id);
    const node = ready.shift()!;
    ordered.push(node);
    for (const nextId of outgoing.get(node.id) ?? []) {
      const degree = (inDegree.get(nextId) ?? 1) - 1;
      inDegree.set(nextId, degree);
      if (degree === 0) ready.push(byId.get(nextId)!);
    }
  }

  // 遇到错误的关系环时仍给出可执行的路径，不让界面失去推荐内容。
  if (ordered.length < nodes.length) {
    const included = new Set(ordered.map(node => node.id));
    ordered.push(...nodes.filter(node => !included.has(node.id)).sort((a, b) => priority(a) - priority(b) || a.id - b.id));
  }
  return ordered;
}

export function LearningPath({ nodes, onSelect }: LearningPathProps) {
  const [isOpen, setIsOpen] = useState(false);
  const remaining = createLearningOrder(nodes).filter(node => !node.is_learned).slice(0, 6);

  return (
    <div className="relative shrink-0">
      <button type="button" className="mt-soft-button h-10 px-3 text-sm"
        aria-expanded={isOpen} onClick={() => setIsOpen(open => !open)}>
        学习路径
      </button>
      {isOpen && (
        <div className="mt-surface absolute top-full right-0 z-40 mt-2 w-80 max-w-[90vw] p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--mt-ink)]">接下来可以学习</h3>
            <span className="mt-muted text-xs">完成状态会更新推荐顺序</span>
          </div>
          {remaining.length ? (
            <ol className="space-y-1">
              {remaining.map((node, index) => (
                <li key={node.id}>
                  <button type="button" onClick={() => { onSelect(node.id); setIsOpen(false); }}
                    className="mt-search-result flex w-full items-center gap-2 px-2 py-2 text-left">
                    <span className="mt-muted w-5 shrink-0 text-xs">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{node.label}</span>
                    <span className="mt-muted shrink-0 text-xs">{node.difficulty || 'medium'}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-muted py-4 text-center text-sm">这棵知识树的节点都已标记为学完。</p>
          )}
        </div>
      )}
    </div>
  );
}
