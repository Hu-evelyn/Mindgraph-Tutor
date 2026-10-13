import React from 'react';
import { AcademicCapIcon, DocumentTextIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline';
import type { TreeKnowledgeNode } from '../../types';



// 接口:TreeKnowledgeNode
interface TreeNodeProps {
  node: TreeKnowledgeNode;
  depth: number;
  index: number;
  totalSiblings: number;
  currentFocusNodeId: number | null;
  onNodeClick: (node: TreeKnowledgeNode) => void; 
  onToggleExpand: (node: TreeKnowledgeNode) => void; // 展开/收缩回调
}

export const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  currentFocusNodeId,
  onNodeClick, //左键
  onToggleExpand, // 接收展开/收缩回调
}) => {
  const isExpanded = node.isExpanded ?? false;
  const isFocused = node.id === currentFocusNodeId;
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 24;

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
    <div>
      {/* 节点行 */}
      <div
        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer select-none
          ${isFocused ? 'bg-blue-100 border border-blue-300' : 'hover:bg-gray-100'}`}
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
              onToggleExpand={onToggleExpand} // 传递下去
            />
          ))}
        </div>
      )}
    </div>
  );
};
