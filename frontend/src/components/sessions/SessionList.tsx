import { useState } from 'react';
import { useKnowledgeStore } from '../../stores/useKnowledgeStore';
import { ArrowLeftIcon, TrashIcon } from '@heroicons/react/24/outline';

interface SessionListProps {
  onBackToLibrary: () => void;
}

export const SessionList: React.FC<SessionListProps> = ({ onBackToLibrary }) => {
  const { trees, currentTreeId, setCurrentTree, createNewTree, isLoading, deleteTree } = useKnowledgeStore();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [treeToDelete, setTreeToDelete] = useState<number | null>(null);
  
  const filteredTrees = trees.filter(tree =>
    tree.root_topic.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleNewTree = async () => {
    const topic = prompt('请输入你想学习的主题：');
    if (topic && topic.trim()) {
      await createNewTree(topic.trim());
    }
  };

  const handleDeleteClick = (treeId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发知识树选择
    setTreeToDelete(treeId);
  };

  const confirmDelete = async () => {
    if (treeToDelete !== null) { // 明确检查 null
      try {
        const result = await deleteTree(treeToDelete);
        setTreeToDelete(null);
        // 在这里添加成功提示
        console.log(`成功删除知识树，删除了 ${result.deletedNodes} 个节点`);
      } catch (error) {
        console.error('删除失败:', error);
      }
    }
  };

  const cancelDelete = () => {
    setTreeToDelete(null);
  };

  return (
    // 视觉统一：侧栏表面、搜索框、知识树卡片和弹窗沿用全站样式。
    <div className="mt-sidebar h-full flex flex-col w-full">
      {/* 头部区域 */}
      {/* 顶部对齐：56px 标题栏和下方操作区与中、右两列形成相同的两条水平线。 */}
      <div className="mt-panel-header mt-sidebar-header flex-shrink-0 border-b flex flex-col">
        <div className="mt-topbar h-14 px-4 border-b flex items-center gap-3">
          {/* 返回知识库的入口移到左侧栏顶部；边栏折叠按钮统一放到中间面板。 */}
          <button
            type="button"
            onClick={onBackToLibrary}
            className="mt-soft-button w-8 h-8 flex items-center justify-center"
            title="返回知识库"
            aria-label="返回知识库"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--mt-ink)]">知识树</h1>
        </div>
        <div className="flex-1 px-4 py-3 flex flex-col justify-center">
          {/* 搜索框 */}
          <div className="relative mb-3">
            <input
              type="text"
              placeholder="搜索知识树..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mt-input w-full px-3 py-2 text-sm"
            />
          </div>

          {/* 新建按钮 */}
          <button
            onClick={handleNewTree}
            disabled={isLoading}
            className="mt-primary-button w-full py-2 px-4 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                创建中...
              </>
            ) : (
              '新建知识树'
            )}
          </button>
        </div>
      </div>

      {/* 知识树列表 - 可滚动区域 */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        {filteredTrees.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchTerm ? '没有找到匹配的知识树' : '暂无知识树'}
            <div className="mt-2 text-sm">
              {!searchTerm && '点击"新建知识树"开始学习'}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTrees.map(tree => (
              <div
                key={tree.id}
                onClick={() => setCurrentTree(tree.id)}
                className={`mt-tree-card p-4 cursor-pointer relative group ${
                  tree.id === currentTreeId 
                    ? 'mt-tree-card-active'
                    : ''
                }`}
              >
                {/* 删除按钮 */}
                <button
                  onClick={(e) => handleDeleteClick(tree.id, e)} // tree.id 是 number
                  className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 rounded text-red-500"
                  title="删除知识树"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
                
                <h3 className="font-medium text-gray-800 mb-1 line-clamp-2 pr-6">
                  {tree.root_topic}
                </h3>
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex items-center gap-1">
                    <span>📊</span>
                    <span>{tree.node_count || 0} 个节点</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>📅</span>
                    <span>{new Date(tree.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部信息 */}
      <div className="mt-sidebar flex-shrink-0 p-4 border-t">
        <p className="text-xs text-gray-500 text-center">
          共 {filteredTrees.length} 个知识树
        </p>
      </div>

      {/* 删除确认对话框 */}
      {treeToDelete !== null && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }} // 使用内联样式确保透明度生效
        >
          <div className="mt-surface p-6 max-w-sm mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              是否删除此知识树？
            </h3>
            <p className="text-gray-500 mb-6">
              删除后无法恢复，请谨慎操作。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelDelete}
                className="mt-soft-button px-4 py-2"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-[10px] transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
