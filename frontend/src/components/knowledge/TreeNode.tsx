import React from 'react';
import { AcademicCapIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { TreeKnowledgeNode } from '../../types';



// 接口:TreeKnowledgeNode
interface TreeNodeProps {
  node: TreeKnowledgeNode;
  depth: number;
  index: number;
  totalSiblings: number;
  currentFocusNodeId: number | null;
  onNodeClick: (node: TreeKnowledgeNode) => void; 
  onOpenContextMenu: (node: TreeKnowledgeNode, x: number, y: number) => void;
  onToggleExpand: (node: TreeKnowledgeNode) => void; // 展开/收缩回调
  onToggleLearned: (node: TreeKnowledgeNode) => void;
}

export const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  index,
  totalSiblings,
  currentFocusNodeId,
  onNodeClick, //左键
  onOpenContextMenu,
  onToggleExpand, // 接收展开/收缩回调
  onToggleLearned,
}) => {
  const isExpanded = node.isExpanded ?? false;
  const isFocused = node.id === currentFocusNodeId;
  const hasChildren = node.children && node.children.length > 0;
  // 沿用 main 对齐后的虚线层级布局，并保留学习完成时的反馈。
  const indent = depth * 28;
  const branchLeft = indent - 15;
  const isLastSibling = index === totalSiblings - 1;
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

  // 改进分支将多个元数据标签合为重点星标，避免树状视图过密。
  const hasStarTag = Boolean(
    node.is_core || node.importance === 'high' || node.is_boundary ||
    (node.relation_type && node.relation_type !== 'PART_OF')
  );

  return (
    <div className="relative">
      {/* 非末位节点的竖线延续到后续兄弟节点；末位节点的线只画到自身中心。 */}
      {depth > 0 && !isLastSibling && (
        <span aria-hidden="true" className="mt-tree-branch-line" style={{ left: branchLeft }} />
      )}
      {/* 缩小节点行高和上下内边距，让树的层级更紧凑，保持原有选中与学习状态样式。 */}
      {/* 树状视图右键节点打开与思维导图相同的操作菜单，不改变当前笔记焦点。 */}
      <div
        data-node-id={node.id}
        className={`mt-node-row relative flex min-h-[40px] items-center gap-2 px-2 py-1 cursor-pointer select-none
          ${isFocused ? 'mt-node-row-active' : ''} ${node.is_learned ? 'mt-node-row-learned' : ''}
          ${isCelebratingLearned ? 'mt-node-row-celebrating' : ''}`}
        style={{ paddingLeft: indent }}
        onClick={handleNodeClick}
        onContextMenu={event => {
          event.preventDefault(); event.stopPropagation();
          onOpenContextMenu(node, event.clientX, event.clientY);
        }}
      >
        {depth > 0 && isLastSibling && (
          <span aria-hidden="true" className="mt-tree-branch-end" style={{ left: branchLeft - 1 }} />
        )}
        {/* 父节点的竖线从当前行中心接到第一条子节点连接线。 */}
        {isExpanded && hasChildren && (
          <span aria-hidden="true" className="mt-tree-parent-stem" style={{ left: indent + 12 }} />
        )}
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
        {/* 新子节点只从右键菜单生成；无子节点时仍占位以保持层级对齐。 */}
        {!hasChildren && <span aria-hidden="true" className="w-6 h-6" />}

        {/* 普通节点不再显示文件图标；根节点保留学科图标。 */}
        {depth === 0 && <AcademicCapIcon className="w-4 h-4 text-blue-500" />}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`mt-node-title truncate ${depth === 0 ? 'text-[15px] font-semibold text-[var(--mt-ink)]' : hasChildren ? 'text-sm font-medium text-slate-800' : 'text-sm font-normal text-gray-800'}`}>{node.title}</span>
            {hasStarTag && <span
              className="ml-1 inline-flex items-center text-xs leading-none"
              role="img"
              aria-label="重点标记"
            >⭐</span>}
          </div>
          {/* 树状视图只展示节点名称与重点标记，难度仍保留在数据中供其他逻辑使用。 */}
        </div>
        {/* 学习状态仍可直接标记；节点编辑已移至右键菜单。 */}
        <button type="button" title={node.is_learned ? '标记为未学习' : '标记为已学习'}
          aria-label={node.is_learned ? `标记${node.title}为未学习` : `标记${node.title}为已学习`}
          aria-pressed={Boolean(node.is_learned)}
          onClick={event => { event.stopPropagation(); onToggleLearned(node); }}
          className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors ${node.is_learned
            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'}`}>
          {node.is_learned ? '✓ 已学习' : '○ 未学习'}
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
              onOpenContextMenu={onOpenContextMenu}
              onToggleExpand={onToggleExpand} // 传递下去
              onToggleLearned={onToggleLearned}
            />
          ))}
        </div>
      )}
    </div>
  );
};
