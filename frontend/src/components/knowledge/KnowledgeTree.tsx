import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useKnowledgeStore } from '../../stores/useKnowledgeStore';
import { TreeNode } from './TreeNode';
import type { TreeKnowledgeNode } from '../../types';
import { buildTreeStructure } from '../../utils/knowledgeTreeUtils'; // 导入共享函数

// 修改组件接口
interface KnowledgeTreeProps {
  onNodeClick?: (node: TreeKnowledgeNode) => void;
  onEditNode: (nodeId: number) => void;
  toolbar: ReactNode;
}
export const KnowledgeTree: React.FC<KnowledgeTreeProps> = ({ 
  onNodeClick,
  onEditNode,
  toolbar,
})=> {
  const { 
    currentTreeId, 
    currentFocusNodeId, 
    setFocusNode, 
    expandNode, 
    getCurrentTreeNodes,
    currentTree,
    toggleNodeExpansion,
    markNodeLearned,
  } = useKnowledgeStore();

  
  // 1.获取状态
  const treeNodes = getCurrentTreeNodes();
  const tree = currentTree();
  const [expansionError, setExpansionError] = useState<string | null>(null);
  const [learningError, setLearningError] = useState<string | null>(null);
  const treeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentFocusNodeId === null) return;
    requestAnimationFrame(() => {
      // 只滚动树卡片本身，避免 scrollIntoView 连带移动外层而遮住底框。
      const container = treeScrollRef.current;
      const target = container?.querySelector<HTMLElement>(`[data-node-id="${currentFocusNodeId}"]`);
      if (!container || !target) return;
      const containerBox = container.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      container.scrollTo({
        top: container.scrollTop + targetBox.top - containerBox.top - (container.clientHeight - targetBox.height) / 2,
        behavior: 'smooth',
      });
    });
  }, [currentFocusNodeId, treeNodes]);
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
    // 树状视图顶部共用完整工具栏；卡片仍只在自身内部滚动。
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      <div className="shrink-0 flex items-center border-b border-[var(--mt-border)] bg-white px-4 py-3">
        {toolbar}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden p-6 flex flex-col">
        <div className="max-w-4xl w-full mx-auto flex-1 min-h-0 flex flex-col">
        {/* 树状图容器 */}
        {expansionError && (
          <div role="alert" className="mb-3 text-sm text-red-700">
            扩展失败：{expansionError}。请再次点击节点箭头重试。
          </div>
        )}
        {learningError && <div role="alert" className="mb-3 text-sm text-red-700">学习状态保存失败：{learningError}</div>}
        {/* 卡片边框固定可见，长树只在卡片内部滚动，与思维导图画布一致。 */}
        <div ref={treeScrollRef} className="mt-surface relative flex-1 min-h-0 overflow-y-auto p-4">
          {structuredNodes.map((rootNode, index) => (
          <TreeNode
            key={rootNode.id}
            node={rootNode}
            depth={0}
            index={index}
            totalSiblings={structuredNodes.length}
            currentFocusNodeId={currentFocusNodeId} // 传递焦点节点ID
            onNodeClick={handleNodeClick}
            onEditNode={onEditNode}
            onToggleExpand={handleToggleExpand} // 传入展开/收缩处理函数
            onToggleLearned={node => {
              setLearningError(null);
              void markNodeLearned(node.id, !node.is_learned).catch(error =>
                setLearningError(error instanceof Error ? error.message : '请重试')
              );
            }}
          />
          ))}
          {/* 空状态也留在固定边框内，不在卡片外增加第二段可滚动高度。 */}
          {structuredNodes.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">🌱</div>
              <p className="text-gray-500">知识树为空，尝试扩展根节点</p>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};
