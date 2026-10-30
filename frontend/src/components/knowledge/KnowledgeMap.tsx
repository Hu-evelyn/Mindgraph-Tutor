//主容器
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useKnowledgeStore } from '../../stores/useKnowledgeStore';
import { KnowledgeTree } from './KnowledgeTree';
import { MindMapVisualization } from './mind-map/MindMapVisualization';
import { KnowledgeViewSwitcher, type KnowledgeViewMode } from './KnowledgeViewSwitcher';
import { KnowledgeNodeSearch } from './KnowledgeNodeSearch';
import { KnowledgeFileActions } from './KnowledgeFileActions';
import { NodeEditDialog } from './NodeEditDialog';
import type { TreeKnowledgeNode } from '../../types';

// 帮助信息组件
const HelpTooltip: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const updatePosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 12;
    const edge = 12;
    const width = Math.min(360, window.innerWidth - edge * 2);
    const rightLeft = rect.right + gap;
    const left = rightLeft + width <= window.innerWidth - edge
      ? rightLeft
      : Math.max(edge, rect.left - width - gap);
    const maxHeight = Math.max(180, window.innerHeight - edge * 2);
    const top = Math.min(Math.max(edge, rect.top), window.innerHeight - maxHeight - edge);
    setPosition({ top, left, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, updatePosition]);

  return (
    <div>
      {/* 帮助按钮 */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(open => !open)}
        className="mt-soft-button w-8 h-8 flex items-center justify-center rounded-full text-sm"
        title="查看帮助"
        aria-label="查看知识图谱帮助"
        aria-expanded={isOpen}
      >
        ?
      </button>

      {/* 帮助内容 */}
      {isOpen && position && createPortal(
        <div
          role="dialog"
          aria-label="知识关系说明"
          className="mt-surface fixed z-[1000] overflow-y-auto p-4 shadow-2xl"
          style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
        >
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-semibold text-gray-800">知识关系说明</h3>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="ml-3 text-gray-400 hover:text-gray-600"
              aria-label="关闭帮助"
            >
              ×
            </button>
          </div>

          {/* 关系类型说明 */}
          <div className="space-y-3">
            <div>
              <h4 className="font-medium text-sm text-gray-700 mb-2">关系类型</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded"></div>
                  <span className="font-medium text-red-600">先修关系 (Prerequisite)</span>
                  <span className="text-gray-600">- 必须掌握的基础知识</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded"></div>
                  <span className="font-medium text-green-600">引导至关系 (Leads To)</span>
                  <span className="text-gray-600">- 推荐学习的延伸知识</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded"></div>
                  <span className="font-medium text-blue-600">属于关系 (Part Of)</span>
                  <span className="text-gray-600">- 知识体系的组成部分</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-purple-500 rounded border-2 border-dashed border-purple-500"></div>
                  <span className="font-medium text-purple-600">相关关系 (Related)</span>
                  <span className="text-gray-600">- 相关的辅助知识</span>
                </div>
              </div>
            </div>

            {/* 节点特性说明 */}
            <div>
              <h4 className="font-medium text-sm text-gray-700 mb-2">节点特性</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-orange-100 border border-orange-300 rounded"></div>
                  <span className="text-gray-700">核心概念 - 橙色背景</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></div>
                  <span className="text-gray-700">边界知识点 - 蓝色背景</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white border-2 border-gray-400 rounded"></div>
                  <span className="text-gray-700">高重要性 - 粗边框</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white border border-gray-300 rounded"></div>
                  <span className="text-gray-700">中重要性 - 中等边框</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white border border-gray-200 rounded"></div>
                  <span className="text-gray-700">低重要性 - 细边框</span>
                </div>
              </div>
            </div>

            {/* 操作说明 */}
            <div>
              <h4 className="font-medium text-sm text-gray-700 mb-2">操作提示</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• 点击节点查看详细内容</li>
                <li>• 右键节点可编辑、展开或标记学习状态</li>
                <li>• 拖动视图可移动思维导图</li>
                <li>• 使用缩放按钮调整大小</li>
              </ul>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export const KnowledgeMap: React.FC = () => {
  const [currentView, setCurrentView] = useState<KnowledgeViewMode>('tree');
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  
  const { 
    currentTree, 
    setFocusNode,
    revealNode,
    currentTreeId,
    getCurrentTreeNodes,
    updateNode,
    isLoading
  } = useKnowledgeStore();
  
  const tree = currentTree();
  const treeNodes = getCurrentTreeNodes();
  const editingNode = treeNodes.find(node => node.id === editingNodeId);
  const learnedCount = treeNodes.filter(node => node.is_learned).length;
  const progress = treeNodes.length ? Math.round(learnedCount / treeNodes.length * 100) : 0;

  // 切换知识树时关闭旧节点的编辑框，避免误把内容保存到新的学习主题。
  useEffect(() => setEditingNodeId(null), [currentTreeId]);

  // 统一的节点点击处理
  const handleNodeClick = async (node: TreeKnowledgeNode) => {
    console.log('点击节点:', node);
    console.log('节点属性:', {
      is_core: node.is_core,
      is_boundary: node.is_boundary,
      importance: node.importance,
      relation_type: node.relation_type,
      difficulty: node.difficulty,
      
    });
    setFocusNode(node.id);
    
    // 根据不同视图模式执行不同操作
    switch (currentView) {
      case 'mindmap':
        // 思维导图（mind-map)：只聚焦节点，不自动生成子节点
        // 这里不需要额外操作，MindMapVisualization 会处理自己的点击逻辑
        break;
        
      case 'tree':
        // 树状视图(KnowledgeTree)：使用 KnowledgeTree 内部的逻辑
        // 这里不需要额外处理，KnowledgeTree 会处理自己的点击逻辑
        break;
    }
  };

  // 调试信息
  useEffect(() => {
    if (treeNodes.length > 0) {
      console.log('当前所有节点数据:', treeNodes);
      console.log('包含样式的节点:', treeNodes.filter(node => 
        node.is_core || node.is_boundary || node.importance !== 'medium'
      ));
    }
  }, [treeNodes, currentView]);


  // 两种视图共用同一组控件：搜索、帮助、视图切换依次位于导出图谱左侧。
  const viewToolbar = tree ? (
    <div className="flex w-full min-w-0 items-center gap-3">
      <KnowledgeNodeSearch key={tree.id} nodes={treeNodes} onSelect={revealNode} />
      <HelpTooltip />
      <div className="shrink-0">
        <KnowledgeViewSwitcher currentView={currentView} onViewChange={setCurrentView} />
      </div>
      <div className="ml-auto shrink-0">
        <KnowledgeFileActions tree={tree} nodes={treeNodes} mode="export" />
      </div>
    </div>
  ) : null;

  const renderCurrentView = () => {
    console.log(`渲染 ${currentView} 视图，节点数量: ${treeNodes.length}`);
    
    switch (currentView) {
      case 'tree':
        return <KnowledgeTree onNodeClick={handleNodeClick} onEditNode={setEditingNodeId} toolbar={viewToolbar} />;
      
      case 'mindmap':
        return (
          <div className="flex-1 min-h-0 min-w-0 flex flex-col">
            <MindMapVisualization onNodeClick={handleNodeClick} onEditNode={setEditingNodeId} toolbar={viewToolbar} />
          </div>
        );
      
      default:
        return <KnowledgeTree onNodeClick={handleNodeClick} onEditNode={setEditingNodeId} toolbar={viewToolbar} />;
    }
  };

  if (!tree) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-lg">选择或创建知识树开始学习</p>
          <p className="text-sm">知识图谱将在这里可视化显示</p>
        </div>
      </div>
    );
  }

  return (
    // 视觉统一：主题标题、视图工具和内容区采用同一工作台层级。
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
      {/* 学习进度移到主题标题下方；保留原有标题区最小高度，避免改变面板分界线位置。 */}
      <div className="mt-panel-header mt-main-header knowledge-map-header flex shrink-0 flex-col px-6 py-5 border-b min-w-0">
        <div className="min-w-0">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--mt-ink)] break-words [overflow-wrap:anywhere]">{tree.root_topic}</h2>
          {/* 节点数量和当前视图已由内容与切换控件表达，不再在标题下重复显示。 */}
          {/* 进度区下移 16px，贴近标题区底线；标题区高度仍由原有样式控制。 */}
          <div className="mt-6 w-full max-w-56" aria-label={`已学习 ${learnedCount} 个，共 ${treeNodes.length} 个节点`}>
            <div className="mb-1.5 flex justify-between text-xs text-slate-500">
              <span>学习进度</span><span>{learnedCount}/{treeNodes.length} · {progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* 当前视图内容 */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="w-full max-w-full mx-auto flex-1 min-h-0 min-w-0 flex flex-col"> {/* 增加中间面板宽度 */}
          {renderCurrentView()}
        </div>
      </div>
      
      {treeNodes.length === 0 && !isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-gray-400 text-6xl mb-4">
              {currentView === 'tree' ? '🌳' : '🗺️'}
            </div>
            <p className="text-gray-500 text-lg mb-2">
              {currentView === 'tree' ? '知识树为空' : '思维导图数据为空'}
            </p>
            <p className="text-sm text-gray-400">
              请尝试扩展根节点来生成内容
            </p>
          </div>
        </div>
      )}

      {/* 树状视图与思维导图共用节点名称编辑框；笔记编辑入口位于右侧详情。 */}
      {editingNode && currentTreeId !== null && (
        <NodeEditDialog key={editingNode.id} node={editingNode}
          onClose={() => setEditingNodeId(null)}
          onSave={label => updateNode(editingNode.id, currentTreeId, { label })} />
      )}
    </div>
  );
};
