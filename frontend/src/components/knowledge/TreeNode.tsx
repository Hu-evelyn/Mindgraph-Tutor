import React from 'react';
import { AcademicCapIcon, DocumentTextIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import type { TreeKnowledgeNode } from '../../types';



// 接口:TreeKnowledgeNode
interface TreeNodeProps {
  node: TreeKnowledgeNode;
  depth: number;
  index: number;
  totalSiblings: number;
  currentFocusNodeId: number | null;
  onNodeClick: (node: TreeKnowledgeNode) => void; 
  onEditNode: (nodeId: number) => void;
  onToggleExpand: (node: TreeKnowledgeNode) => void; // 展开/收缩回调
  onToggleLearned: (node: TreeKnowledgeNode) => void;
}

export const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  currentFocusNodeId,
  onNodeClick, //左键
  onEditNode,
  onToggleExpand, // 接收展开/收缩回调
  onToggleLearned,
}) => {
  const isExpanded = node.isExpanded ?? false;
  const isFocused = node.id === currentFocusNodeId;
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 24;
  const [isCelebratingLearned, setIsCelebratingLearned] = React.useState(false);
  const previousLearned = React.useRef(Boolean(node.is_learned));

  React.useEffect(() => {
    const justLearned = Boolean(node.is_learned) && !previousLearned.current;
    previousLearned.current = Boolean(node.is_learned);
    if (!justLearned) return;
    setIsCelebratingLearned(true);
    const timeout = window.setTimeout(() => setIsCelebratingLearned(false), 850);
    return () => window.clearTimeout(timeout);
  }, [node.is_learned]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // 防止触发 onNodeClick
    onToggleExpand(node); // 调用展开/收缩
  };

  const handleNodeClick = () => {
    onNodeClick(node);
  };

  const getNodeIcon = () => {
    if (depth === 0)
      return <AcademicCapIcon className="w-4 h-4 text-blue-500" />;
    return <DocumentTextIcon className="w-4 h-4 text-gray-500" />;
  };

  const hasStarTag = Boolean(
    node.is_core || node.importance === 'high' || node.is_boundary ||
    (node.relation_type && node.relation_type !== 'PART_OF')
  );

  return (
    <div>
      {/* 视觉统一：节点行共用悬停与选中样式；缩进和标签语义保持不变。 */}
      <div
        data-node-id={node.id}
        className={`mt-node-row flex items-center gap-2 px-2 py-2 cursor-pointer select-none
          ${isFocused ? 'mt-node-row-active' : ''} ${node.is_learned ? 'mt-node-row-learned' : ''}
          ${isCelebratingLearned ? 'mt-node-row-celebrating' : ''}`}
        style={{ paddingLeft: indent }}
        onClick={handleNodeClick}
      >
        {/* 展开 / 收起图标 */}
        {hasChildren && (
          <button
            type="button"
            title={isExpanded ? '收起子节点' : '展开子节点'}
            aria-label={isExpanded ? '收起子节点' : '展开子节点'}
            onClick={handleToggle}
            className="w-6 h-6 flex items-center justify-center text-gray-500"
          >
            {isExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
          </button>
        )}
        {/* 对于没有子节点但可以展开的节点 */}
        {!hasChildren && !node.childrenGenerated && (
          <button
            type="button"
            title="生成子节点"
            aria-label="生成子节点"
            onClick={handleToggle}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:bg-gray-200 rounded"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        )}
        {!hasChildren && node.childrenGenerated && <span aria-hidden="true" className="w-6 h-6" />}

        {/* 节点图标 */}
        {getNodeIcon()}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-800 truncate">{node.title}</span>
            {hasStarTag && <span
              className="ml-1 inline-flex items-center text-xs leading-none"
              role="img"
              aria-label="重点标记"
            >⭐</span>}
          </div>
          {/* 难度和时间信息 */}
          {(node.difficulty || node.estimated_time) && (
            <div className="text-xs text-gray-500">
              {node.difficulty && <span>难度: {node.difficulty}</span>}
              {node.estimated_time && <span> </span>}
            </div>
          )}
        </div>
        {/* 编辑按钮独立于节点选择和展开操作，避免点击时触发笔记生成。 */}
        <button type="button" title={node.is_learned ? '标记为未学习' : '标记为已学习'}
          aria-label={node.is_learned ? `标记${node.title}为未学习` : `标记${node.title}为已学习`}
          aria-pressed={Boolean(node.is_learned)}
          onClick={event => { event.stopPropagation(); onToggleLearned(node); }}
          className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors ${node.is_learned
            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'}`}>
          {node.is_learned ? '✓ 已学习' : '○ 未学习'}
        </button>
        <button type="button" title={`编辑${node.title}`} aria-label={`编辑${node.title}`}
          onClick={event => { event.stopPropagation(); onEditNode(node.id); }}
          className="mt-soft-button w-7 h-7 flex-shrink-0 flex items-center justify-center">
          <PencilSquareIcon className="w-4 h-4" />
        </button>
      </div>

      
      

      {/* 递归渲染子节点 */}
      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child, idx) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              index={idx}
              totalSiblings={node.children!.length}
              currentFocusNodeId={currentFocusNodeId}
              onNodeClick={onNodeClick}
              onEditNode={onEditNode}
              onToggleExpand={onToggleExpand} // 传递下去
              onToggleLearned={onToggleLearned}
            />
          ))}
        </div>
      )}
    </div>
  );
};
