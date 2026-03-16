import { useKnowledgeStore } from './stores/useKnowledgeStore';
import { ThreePanelLayout } from './components/layout/ThreePanelLayout';

function App() {
  const { currentTree, isLoading } = useKnowledgeStore();

  // 如果有当前会话，显示三面板布局；否则显示开始界面
  if (!currentTree()) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">🎓</div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">结构化学习助手</h1>
            <p className="text-gray-600">生成知识树，逐层深入理解复杂概念</p>
          </div>
          
          <div className="space-y-4">
            <button
              onClick={() => {
                const topic = prompt('请输入学习主题：');
                if (topic) useKnowledgeStore.getState().createNewTree(topic);
              }}
              disabled={isLoading}
              className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium"
            >
              {isLoading ? '创建中...' : '开始新的学习旅程'}
            </button>
            
            <div className="text-xs text-gray-500 text-center">
              示例：机器学习、React开发、智能体系统、量子计算...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <ThreePanelLayout />;
}

export default App;