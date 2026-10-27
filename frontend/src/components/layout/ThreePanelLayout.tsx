import { useState } from 'react';
import { useKnowledgeStore } from '../../stores/useKnowledgeStore';
import { SessionList } from '../sessions/SessionList';
import { ChatPanel } from '../chat/ChatPanel';
import { KnowledgeMap } from '../knowledge/KnowledgeMap';
import { ResizablePanelGroup } from '../ui/ResizablePanelGroup'; 
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from '@heroicons/react/24/outline';


export const ThreePanelLayout: React.FC = () => {
  const { setCurrentTree } = useKnowledgeStore();
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);

  const handleToggleLeftPanel = () => {
    setIsLeftPanelCollapsed(!isLeftPanelCollapsed);
  };

  return (
    // 视觉统一：三面板共用浅色工作台底色和分隔线，面板折叠及拖拽逻辑不变。
    <div className="mt-workspace flex h-screen">
      {/* 收起时隐藏侧栏而非留一个零宽容器：消除蓝色卡片露边，同时保留搜索输入状态。 */}
      <div className={`mt-sidebar w-64 flex-shrink-0 border-r ${isLeftPanelCollapsed ? 'hidden' : ''}`}>
        <SessionList onBackToLibrary={() => setCurrentTree(null)} />
      </div>

      {/* 中间和右侧面板容器 - 使用 ResizablePanelGroup 实现联动 */}
      <div className="flex-1 flex min-w-0">
        <ResizablePanelGroup className="flex-1 min-w-0">
          {/* 中间面板 */}
          <div className="h-full mt-page flex flex-col min-w-0">
            {/* 折叠箭头始终位于中间面板左上角，展开和收起共用同一位置。 */}
            <div className="mt-panel-header h-14 px-6 border-b flex-shrink-0">
              <div className="h-full flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={handleToggleLeftPanel}
                  className="mt-soft-button w-8 h-8 flex-shrink-0 flex items-center justify-center"
                  title={isLeftPanelCollapsed ? '展开边栏' : '收起边栏'}
                  aria-label={isLeftPanelCollapsed ? '展开边栏' : '收起边栏'}
                >
                  {isLeftPanelCollapsed
                    ? <ChevronDoubleRightIcon className="w-4 h-4" />
                    : <ChevronDoubleLeftIcon className="w-4 h-4" />}
                </button>
                <span className="mt-kicker truncate">Mindgraph Tutor · 学习工作台</span>
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
