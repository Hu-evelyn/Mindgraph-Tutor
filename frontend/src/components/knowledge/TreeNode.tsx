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
  // 展开按钮宽 24px；节点行有 1px 边框，枝干坐标统一按外层容器计算，避免逐层偏移。
  const indent = depth * 28;
  const branchLeft = indent - 15;
  const isLastSibling = index === totalSiblings - 1;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // 防止触发 onNodeClick
    onToggleExpand(node); // 调用展开/收缩
  };

  const handleNodeClick = () => {
    onNodeClick(node);
  };

  // 在 TreeNode 组件中修复关系标签映射
  const getRelationLabels = (): { [key: string]: string } => {
    return {
      'PREREQUISITE': '先修',
      'LEADS_TO': '引导至', 
      'RELATED': '相关'
    };
  };

  // 在 getNodeMetadata 函数中使用
  const getNodeMetadata = () => {
    const metadata = [];
    
    if (node.is_core) {
      metadata.push({ text: '核心', color: 'bg-orange-100 text-orange-800' });
    }
    
    if (node.importance === 'high') {
      metadata.push({ text: '重要', color: 'bg-red-100 text-red-800' });
    }
    
    if (node.relation_type && node.relation_type !== 'PART_OF') {
      const relationLabels = getRelationLabels();
      metadata.push({ 
        text: relationLabels[node.relation_type] || node.relation_type, 
        color: 'bg-blue-100 text-blue-800' 
      });
    }
    
    return metadata;
  };

  const metadata = getNodeMetadata();

  return (
    <div className="relative">
      {/* 非末位节点的竖线延续到后续兄弟节点；末位节点的线只画到自身中心。 */}
      {depth > 0 && !isLastSibling && (
        <span aria-hidden="true" className="mt-tree-branch-line" style={{ left: branchLeft }} />
      )}
      {/* 节点行沿用悬停与选中样式，统一缩进后用字重区分父节点和叶子节点。 */}
      {/* 树状视图右键节点打开与思维导图相同的操作菜单，不改变当前笔记焦点。 */}
      <div
        data-node-id={node.id}
        className={`mt-node-row relative flex min-h-[52px] items-center gap-2 px-2 py-2 cursor-pointer select-none
          ${isFocused ? 'mt-node-row-active' : ''}`}
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
            <span className={`truncate ${depth === 0 ? 'text-[15px] font-semibold text-[var(--mt-ink)]' : hasChildren ? 'text-sm font-medium text-slate-800' : 'text-sm font-normal text-gray-800'}`}>{node.title}</span>
            {/* 元数据标签 */}
            {metadata.map((meta, idx) => (
              <span 
                key={idx}
                className={`text-xs px-1.5 py-0.5 rounded ${meta.color}`}
              >
                {meta.text}
              </span>
            ))}
          </div>
          {/* 难度和时间信息 */}
          {(node.difficulty || node.estimated_time) && (
            <div className="text-xs text-gray-500">
              {node.difficulty && <span>难度: {node.difficulty}</span>}
              {node.estimated_time && <span> </span>}
            </div>
          )}
        </div>
        {/* 学习状态仍可直接标记；节点编辑已移至右键菜单。 */}
        <button type="button" title={node.is_learned ? '标记为未学习' : '标记为已学习'}
          aria-label={node.is_learned ? `标记${node.title}为未学习` : `标记${node.title}为已学习`}
          aria-pressed={Boolean(node.is_learned)}
          onClick={event => { event.stopPropagation(); onToggleLearned(node); }}
          className={`w-7 h-7 flex-shrink-0 rounded-full ${node.is_learned ? 'text-emerald-600' : 'text-slate-400 hover:text-emerald-600'}`}>
          {node.is_learned ? '✓' : '○'}
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
