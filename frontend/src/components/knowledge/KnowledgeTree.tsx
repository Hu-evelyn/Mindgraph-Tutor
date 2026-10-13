import { useState } from 'react';
import { useKnowledgeStore } from '../../stores/useKnowledgeStore';
import { TreeNode } from './TreeNode';
import type { TreeKnowledgeNode } from '../../types';
import { buildTreeStructure } from '../../utils/knowledgeTreeUtils'; // 导入共享函数

// 修改组件接口
interface KnowledgeTreeProps {
  onNodeClick?: (node: TreeKnowledgeNode) => void;
}
export const KnowledgeTree: React.FC<KnowledgeTreeProps> = ({ 
  onNodeClick 
})=> {
  const { 
    currentTreeId, 
    currentFocusNodeId, 
    setFocusNode, 
    expandNode, 
    getCurrentTreeNodes,
    currentTree,
    toggleNodeExpansion
  } = useKnowledgeStore();

  
  // 1.获取状态
  const treeNodes = getCurrentTreeNodes();
  const tree = currentTree();
  const [expansionError, setExpansionError] = useState<string | null>(null);
  //没则加载页面
  if (!currentTreeId || !tree) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="text-6xl mb-4">🌳</div>
          <p className="text-lg">选择或创建知识树开始学习</p>
          <p className="text-sm">思维导图将在这里显示</p>
        </div>
      </div>
    );
  }
  //3、按钮交互
  const handleNodeClick = async (node: TreeKnowledgeNode) => {
    setFocusNode(node.id);

     // 如果有外部传入的点击处理，优先使用
    if (onNodeClick) {
      onNodeClick(node);
      return;
    }

  };

  // 添加专门的展开/收缩处理函数
  const handleToggleExpand = async (node: TreeKnowledgeNode) => {
    if (node.children.length > 0) {
      toggleNodeExpansion(node.id);
      return;
    }
    if (node.childrenGenerated) return;

    setExpansionError(null);
    try {
      await expandNode(node.id, currentTreeId);
    } catch (error) {
      setExpansionError(error instanceof Error ? error.message : '扩展失败，请重试');
    }
  };


  const structuredNodes = buildTreeStructure(treeNodes);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* 知识树标题 */}
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-gray-800"></h2>
        </div>

        {/* 树状图容器 */}
        {expansionError && (
          <div role="alert" className="mb-3 text-sm text-red-700">
            扩展失败：{expansionError}。请再次点击节点箭头重试。
          </div>
        )}
        <div className="relative max-h-[70vh] overflow-y-auto border border-gray-200 rounded-lg p-4 bg-white">
          {structuredNodes.map((rootNode, index) => (
          <TreeNode
            key={rootNode.id}
            node={rootNode}
            depth={0}
            index={index}
            totalSiblings={structuredNodes.length}
            currentFocusNodeId={currentFocusNodeId} // 传递焦点节点ID
            onNodeClick={handleNodeClick}
            onToggleExpand={handleToggleExpand} // 传入展开/收缩处理函数
          />
          ))}
        </div>
        
        {structuredNodes.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">🌱</div>
            <p className="text-gray-500">知识树为空，尝试扩展根节点</p>
          </div>
        )}
      </div>
    </div>
  );
};
