import { useState } from 'react';
import { useKnowledgeStore } from '../../stores/useKnowledgeStore';
import { SessionList } from '../sessions/SessionList';
import { KnowledgeTree } from '../knowledge/KnowledgeTree';
import { ChatPanel } from '../chat/ChatPanel';
import { ResizablePanel } from '../ui/ResizablePanel';
import { KnowledgeMap } from '../knowledge/KnowledgeMap';
import { ResizablePanelGroup } from '../ui/ResizablePanelGroup'; 
import { ArrowLeftIcon } from '@heroicons/react/24/outline';


// 帮助信息组件（与上面相同）
const HelpTooltip: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors text-xs"
        title="查看帮助"
      >
        ?
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-3">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-gray-800 text-sm">知识关系说明</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              ×
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded"></div>
              <span className="font-medium text-red-600">先修</span>
              <span className="text-gray-600">- 必须的基础</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded"></div>
              <span className="font-medium text-green-600">引导至</span>
              <span className="text-gray-600">- 推荐延伸</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded"></div>
              <span className="font-medium text-blue-600">属于</span>
              <span className="text-gray-600">- 组成部分</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-500 rounded border border-dashed"></div>
              <span className="font-medium text-purple-600">相关</span>
              <span className="text-gray-600">- 辅助知识</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ThreePanelLayout: React.FC = () => {
  const { setCurrentTree } = useKnowledgeStore();
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);

  const handleToggleLeftPanel = () => {
    setIsLeftPanelCollapsed(!isLeftPanelCollapsed);
  };

  return (
    // 视觉统一：三面板共用浅色工作台底色和分隔线，面板折叠及拖拽逻辑不变。
    <div className="mt-workspace flex h-screen">
      {/* 左侧面板 - 固定宽度，不再使用 ResizablePanel */}
      {!isLeftPanelCollapsed ? (
        <div className="mt-sidebar w-64 flex-shrink-0 border-r">
          <SessionList 
            onToggleCollapse={handleToggleLeftPanel}
            isCollapsed={false}
          />
        </div>
      ) : (
        // 收起状态下的固定宽度面板
        <div className="mt-sidebar w-0 border-r flex-shrink-0">
          <SessionList 
            onToggleCollapse={handleToggleLeftPanel}
            isCollapsed={true}
          />
        </div>
      )}

      {/* 中间和右侧面板容器 - 使用 ResizablePanelGroup 实现联动 */}
      <div className="flex-1 flex min-w-0">
        <ResizablePanelGroup className="flex-1 min-w-0">
          {/* 中间面板 */}
          <div className="h-full mt-page flex flex-col min-w-0">
            {/* 视觉统一：原有空白顶栏改为简洁的工作台标识，仍保留展开侧栏按钮。 */}
            <div className="mt-panel-header h-14 px-6 border-b flex-shrink-0">
              <div className="h-full flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* 返回逻辑：清除当前树选择，复用 App 已有的知识库选择页面。 */}
                  <button
                    type="button"
                    onClick={() => setCurrentTree(null)}
                    className="mt-soft-button flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm"
                    title="返回知识库"
                  >
                    <ArrowLeftIcon className="w-4 h-4" />
                    返回知识库
                  </button>
                  <span className="mt-kicker truncate">Mindgraph Tutor · 学习工作台</span>
                </div>
                {isLeftPanelCollapsed && (
                  <button
                    onClick={handleToggleLeftPanel}
                    className="mt-soft-button px-3 py-1.5 text-sm"
                  >
                    展开边栏
                  </button>
                )}
                
              </div>
            </div>
            <KnowledgeMap />
          </div>

          {/* 右侧面板 */}
          <div className="h-full flex flex-col bg-white min-w-0">
            <ChatPanel />
          </div>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};
