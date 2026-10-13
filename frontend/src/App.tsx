// App.tsx
import { useEffect } from 'react';
import { useKnowledgeStore } from './stores/useKnowledgeStore';
import { ThreePanelLayout } from './components/layout/ThreePanelLayout';

function App() {
  const { 
    currentTree, 
    isLoading, 
    createNewTree, 
    loadUserTrees,
    trees,
    setCurrentTree,
    currentTreeId,
    loadTree
  } = useKnowledgeStore();

  // 组件加载时加载用户的知识树
  useEffect(() => {
    loadUserTrees();
  }, [loadUserTrees]);

  // 如果有当前选中的知识树，确保加载树数据
  useEffect(() => {
    if (currentTreeId) {
      loadTree(currentTreeId).catch(error => console.error('加载知识树失败:', error));
    }
  }, [currentTreeId, loadTree]);

  // 如果没有知识树，显示开始界面
  if (trees.length === 0 && !isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">🌳</div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">知识树学习助手</h1>
            <p className="text-gray-600">AI驱动的结构化学习平台</p>
          </div>
          
          <div className="space-y-4">
            <button
              onClick={async () => {
                const topic = prompt('请输入你想学习的主题：');
                if (topic && topic.trim()) {
                  try {
                    await createNewTree(topic.trim());
                  } catch (error) {
                    console.error('创建知识树失败:', error);
                    alert('创建失败，请检查网络连接或稍后重试');
                  }
                }
              }}
              disabled={isLoading}
              className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium transition-colors"
            >
              {isLoading ? 'AI思考中...' : '创建新的知识树'}
            </button>
            
            <div className="text-xs text-gray-500 text-center">
              示例：机器学习、React开发、中国古代史、量子力学...
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 如果有知识树但没有选中当前树，显示知识树选择界面
  if (!currentTreeId && trees.length > 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">📚</div>
            <h1 className="text-4xl font-bold text-gray-800 mb-2">我的知识库</h1>
            <p className="text-gray-600">选择知识树继续学习，或创建新的主题</p>
          </div>

          {/* 知识树网格列表 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
            {trees.map(tree => (
              <div
                key={tree.id}
                onClick={() => setCurrentTree(tree.id)}
                className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer p-6 border-2 border-transparent hover:border-blue-200 flex flex-col"
              >
                <div className="flex items-center mb-3">
                  <div className="text-2xl mr-3">🌲</div>
                  <h3 className="font-semibold text-lg truncate">{tree.root_topic}</h3>
                </div>
                <div className="text-sm text-gray-600 space-y-1 flex-1">
                  <div>节点数量: {tree.node_count || 0}</div>
                  <div>创建时间: {new Date(tree.created_at).toLocaleDateString()}</div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <span className="text-xs text-blue-600 font-medium">点击进入学习 →</span>
                </div>
              </div>
            ))}
            
            {/* 新建知识树卡片 */}
            <div
              onClick={async () => {
                const topic = prompt('请输入新的学习主题：');
                if (topic && topic.trim()) {
                  try {
                    await createNewTree(topic.trim());
                  } catch (error) {
                    console.error('创建知识树失败:', error);
                    alert('创建失败，请稍后重试');
                  }
                }
              }}
              className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-300 transition-colors cursor-pointer p-6 flex flex-col items-center justify-center min-h-[160px]"
            >
              <div className="text-3xl mb-2 text-gray-400">+</div>
              <div className="text-gray-600 font-medium">新建知识树</div>
              <div className="text-xs text-gray-500 mt-2 text-center">创建新的学习主题</div>
            </div>
          </div>

          {/* 使用说明 */}
          <div className="bg-white rounded-lg p-6 max-w-2xl mx-auto">
            <h3 className="font-semibold text-lg mb-3">使用说明</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
              <div className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <span>选择知识树进入学习界面</span>
              </div>
              <div className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <span>在树状视图和思维导图间切换</span>
              </div>
              <div className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <span>点击节点展开更多内容</span>
              </div>
              <div className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <span>与AI助手对话深入学习</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 显示加载状态
  if (isLoading && !currentTree()) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-xl font-semibold text-gray-700">AI正在生成知识树...</div>
          <div className="text-gray-500">这可能需要几秒钟时间</div>
        </div>
      </div>
    );
  }

  // 正常显示三面板布局（包含 KnowledgeMap）
  return (
    <div className="h-screen bg-white">
      <ThreePanelLayout />
      
      {/* 全局加载遮罩 */}
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center shadow-lg">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-3"></div>
            <span className="text-gray-700">AI处理中...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
