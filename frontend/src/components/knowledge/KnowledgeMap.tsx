//主容器
import React, { useState, useEffect } from 'react';
import { useKnowledgeStore } from '../../stores/useKnowledgeStore';
import { KnowledgeTree } from './KnowledgeTree';
import { MindMapVisualization } from './mind-map/MindMapVisualization';
import { KnowledgeViewSwitcher, type KnowledgeViewMode } from './KnowledgeViewSwitcher';
import { KnowledgeNodeSearch } from './KnowledgeNodeSearch';
import { KnowledgeFileActions } from './KnowledgeFileActions';
import { NodeEditDialog } from './NodeEditDialog';
import { NodeDeleteDialog } from './NodeDeleteDialog';
import type { TreeKnowledgeNode } from '../../types';

export const KnowledgeMap: React.FC = () => {
  const [currentView, setCurrentView] = useState<KnowledgeViewMode>('tree');
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [deletingNodeId, setDeletingNodeId] = useState<number | null>(null);
  
  const { 
    currentTree, 
    setFocusNode,
    revealNode,
    currentTreeId,
    getCurrentTreeNodes,
    updateNode,
    regenerateChildren,
    generateNote,
    deleteNodeSubtree,
    isLoading
  } = useKnowledgeStore();
  
  const tree = currentTree();
  const treeNodes = getCurrentTreeNodes();
  const editingNode = treeNodes.find(node => node.id === editingNodeId);
  const learnedCount = treeNodes.filter(node => node.is_learned).length;
  const progress = treeNodes.length ? Math.round(learnedCount / treeNodes.length * 100) : 0;

  // 切换知识树时关闭旧节点的编辑框，避免误把内容保存到新的学习主题。
  useEffect(() => { setEditingNodeId(null); setDeletingNodeId(null); }, [currentTreeId]);

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


  // 移除知识关系说明入口；两种视图仍共用搜索、切换和导出控件。
  const viewToolbar = tree ? (
    <div className="flex w-full min-w-0 items-center gap-3">
      <KnowledgeNodeSearch key={tree.id} nodes={treeNodes} onSelect={revealNode} />
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
        return <KnowledgeTree onNodeClick={handleNodeClick} onEditNode={setEditingNodeId}
          onDeleteNode={setDeletingNodeId} toolbar={viewToolbar} />;
      
      case 'mindmap':
        return (
          <div className="flex-1 min-h-0 min-w-0 flex flex-col">
            <MindMapVisualization onNodeClick={handleNodeClick} onEditNode={setEditingNodeId}
              onDeleteNode={setDeletingNodeId} toolbar={viewToolbar} />
          </div>
        );
      
      default:
        return <KnowledgeTree onNodeClick={handleNodeClick} onEditNode={setEditingNodeId}
          onDeleteNode={setDeletingNodeId} toolbar={viewToolbar} />;
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

      {/* 树状视图与思维导图共用两次确认流程；笔记选择“是”后在右侧异步生成。 */}
      {editingNode && currentTreeId !== null && (
        <NodeEditDialog key={editingNode.id} node={editingNode}
          onClose={() => setEditingNodeId(null)}
          onSave={async (label, options) => {
            const treeId = currentTreeId;
            const nodeId = editingNode.id;
            if (label !== editingNode.label || options.regenerateNote) await updateNode(nodeId, treeId, { label });
            if (options.regenerateChildren) await regenerateChildren(nodeId, treeId);
            if (useKnowledgeStore.getState().currentTreeId !== treeId) return;
            setFocusNode(nodeId);
            if (options.regenerateNote) void generateNote(nodeId, treeId, true);
          }} />
      )}
      {/* 两种视图共用删除确认；“否”只关弹窗，“是”递归删除并同步节点状态。 */}
      {deletingNodeId !== null && currentTreeId !== null && (
        <NodeDeleteDialog key={deletingNodeId} onCancel={() => setDeletingNodeId(null)}
          onConfirm={async () => {
            await deleteNodeSubtree(deletingNodeId, currentTreeId);
            setDeletingNodeId(null);
          }} />
      )}
    </div>
  );
};
