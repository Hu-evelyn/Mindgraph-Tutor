import { useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { DbKnowledgeNode } from '../../types';

interface KnowledgeNodeSearchProps {
  nodes: DbKnowledgeNode[];
  onSelect: (nodeId: number) => void;
}

export const KnowledgeNodeSearch: React.FC<KnowledgeNodeSearchProps> = ({ nodes, onSelect }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase();

  // 前端检索：只查询当前已加载知识树的节点名称和内容，不请求后端。
  const matches = normalizedQuery
    ? nodes.filter(node =>
        node.label.toLocaleLowerCase().includes(normalizedQuery) ||
        node.content?.toLocaleLowerCase().includes(normalizedQuery)
      )
    : [];

  const selectNode = (nodeId: number) => {
    onSelect(nodeId);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div
      className="mt-node-search relative w-full max-w-md"
      onFocusCapture={() => setIsOpen(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false);
      }}
    >
      <label htmlFor="knowledge-node-search" className="sr-only">搜索当前知识树的节点</label>
      <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        id="knowledge-node-search"
        type="search"
        value={query}
        onChange={event => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' && matches[0]) selectNode(matches[0].id);
          if (event.key === 'Escape') {
            setQuery('');
            setIsOpen(false);
          }
        }}
        placeholder="搜索当前知识树的节点..."
        className="mt-input w-full h-10 pl-9 pr-3 text-sm"
      />

      {/* 检索结果仅影响当前焦点节点，点击后右侧详情显示该节点。 */}
      {normalizedQuery && isOpen && (
        <div className="mt-search-results absolute top-full left-0 right-0 mt-2 max-h-72 overflow-y-auto p-1 z-40">
          {matches.length > 0 ? (
            <>
              <p className="mt-muted px-3 py-1 text-xs">
                找到 {matches.length} 个节点{matches.length > 8 ? '，显示前 8 个' : ''}
              </p>
              {matches.slice(0, 8).map(node => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => selectNode(node.id)}
                  className="mt-search-result w-full text-left px-3 py-2"
                >
                  <span className="block text-sm font-medium truncate">{node.label}</span>
                  {node.content && (
                    <span className="mt-muted block text-xs truncate mt-0.5">
                      {node.content.replace(/\s+/g, ' ').slice(0, 70)}
                    </span>
                  )}
                </button>
              ))}
            </>
          ) : (
            <p className="mt-muted px-3 py-3 text-sm">没有找到匹配的知识节点</p>
          )}
        </div>
      )}
    </div>
  );
};
