import React, { useEffect, useRef, useState } from 'react';
import { useKnowledgeStore } from '../../../stores/useKnowledgeStore';
import type { TreeKnowledgeNode } from '../../../types';
import { buildTreeStructure } from '../../../utils/knowledgeTreeUtils';
import { ContextMenu } from '../ContextMenu';
import './MindMapVisualization.css';


interface MindMapVisualizationProps {
  onNodeClick?: (node: TreeKnowledgeNode) => void;
  onEditNode: (nodeId: number) => void;
  toolbar: React.ReactNode;
}

// 扩展 NodeLayout 接口，包含所有必需的属性
interface NodeLayout extends TreeKnowledgeNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MindMapVisualization: React.FC<MindMapVisualizationProps> = ({ 
  onNodeClick,
  onEditNode,
  toolbar,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{x: number; y: number; node: TreeKnowledgeNode} | null>(null);
  const [expansionError, setExpansionError] = useState<{nodeId: number; treeId: number; message: string} | null>(null);
  const [learningError, setLearningError] = useState('');
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 1000, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const panPoint = useRef<{ x: number; y: number } | null>(null);
  const lastCenteredNodeId = useRef<number | null>(null);
  const lastRevealVersion = useRef(0);
  const [zoom, setZoom] = useState(1);
  
  const {
    currentTreeId,
    currentTree,
    currentFocusNodeId,
    setFocusNode,
    getCurrentTreeNodes,
    expandNode,
    toggleNodeExpansion,
    markNodeLearned,
    revealVersion,
  } = useKnowledgeStore();

  const treeNodes = getCurrentTreeNodes();
  const tree = currentTree();

  useEffect(() => {
    setViewBox({ x: 0, y: 0, width: 1000, height: 600 });
    setZoom(1);
    lastCenteredNodeId.current = null;
  }, [currentTreeId]);

  // 自动调整思维导图大小以适应内容
  const calculateOptimalViewBox = (layout: NodeLayout[]) => {
    if (layout.length === 0) return { x: 0, y: 0, width: 1000, height: 600 };
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    layout.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    });
    
    // 添加边距
    const padding = 100;
    return {
      x: minX - padding,
      y: minY - padding,
      width: (maxX - minX) + padding * 2,
      height: (maxY - minY) + padding * 2
    };
  };

  // 鼠标拖动处理
  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('.mind-map-node-group')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panPoint.current = { x: event.clientX, y: event.clientY };
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!panPoint.current || !svgRef.current) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const point = panPoint.current;
    const dx = (event.clientX - point.x) * viewBox.width / Math.max(bounds.width, 1);
    const dy = (event.clientY - point.y) * viewBox.height / Math.max(bounds.height, 1);
    setViewBox(previous => ({ ...previous, x: previous.x - dx, y: previous.y - dy }));
    panPoint.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panPoint.current = null;
    setIsDragging(false);
  };

  // 滑块与加减按钮共用 30%–500% 的缩放范围。
  const handleZoomChange = (newZoom: number) => {
    const clampedZoom = Math.max(0.3, Math.min(5, newZoom));
    setZoom(clampedZoom);
  };

  // 缩放按钮处理
  const handleZoomIn = () => {
    handleZoomChange(zoom + 0.1);
  };

  const handleZoomOut = () => {
    handleZoomChange(zoom - 0.1);
  };

  useEffect(() => {
    if (lastRevealVersion.current !== revealVersion) {
      lastCenteredNodeId.current = null;
      lastRevealVersion.current = revealVersion;
    }
    if (svgRef.current) renderMindMap();
  }, [treeNodes, currentFocusNodeId, zoom, revealVersion]);

  const calculateLayout = (rootNodes: TreeKnowledgeNode[]): NodeLayout[] => {
    const layout: NodeLayout[] = [];
    const nodeWidth = 230;
    const horizontalSpacing = 145;
    const verticalSpacing = 28;
    const lineCapacity = 16;
    const nodeHeight = (node: TreeKnowledgeNode) => {
      const lines = Math.max(1, Math.ceil(Array.from(node.title || '').length / lineCapacity));
      return Math.max(72, 42 + lines * 18);
    };
    const childrenOf = (node: TreeKnowledgeNode) =>
      node.isExpanded ? (node.children ?? []) : [];
    const subtreeHeight = (node: TreeKnowledgeNode): number => {
      const children = childrenOf(node);
      if (!children.length) return nodeHeight(node);
      return Math.max(nodeHeight(node), children.reduce((sum, child) => sum + subtreeHeight(child), 0)
        + verticalSpacing * (children.length - 1));
    };

    const place = (node: TreeKnowledgeNode, depth: number, top: number) => {
      const height = nodeHeight(node);
      const children = childrenOf(node);
      const childrenHeight = children.length
        ? children.reduce((sum, child) => sum + subtreeHeight(child), 0) + verticalSpacing * (children.length - 1)
        : 0;
      const y = top + Math.max(0, (childrenHeight - height) / 2);
      layout.push({ ...node, x: 50 + depth * (nodeWidth + horizontalSpacing), y, width: nodeWidth, height });
      let childTop = top + Math.max(0, (height - childrenHeight) / 2);
      children.forEach(child => {
        place(child, depth + 1, childTop);
        childTop += subtreeHeight(child) + verticalSpacing;
      });
    };

    let rootTop = 50;
    rootNodes.forEach(node => {
      place(node, 0, rootTop);
      rootTop += subtreeHeight(node) + verticalSpacing;
    });

    return layout;
  };

  
  const handleNodeClick = async (node: TreeKnowledgeNode) => {
    setFocusNode(node.id);
    
    // 单纯切换展开/收缩状态，不生成新子节点
    toggleNodeExpansion(node.id);
    
    onNodeClick?.(node);
  };

  const drawConnections = (svg: SVGSVGElement, layout: NodeLayout[]) => {
    layout.forEach(node => {
      if (node.children && node.children.length > 0 && node.isExpanded) {
        node.children.forEach((child: TreeKnowledgeNode) => {
          const childLayout = layout.find(n => n.id === child.id);
          if (childLayout) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            // 获取关系类型
            const relationType = child.relation_type || 'PART_OF';

            // 创建曲线连接
            const startX = node.x + node.width;
            const startY = node.y + node.height / 2;
            const endX = childLayout.x;
            const endY = childLayout.y + childLayout.height / 2;
            const controlX1 = startX + (endX - startX) * 0.5;
            const controlX2 = endX - (endX - startX) * 0.5;
            
            const pathData = `M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`;
            
            line.setAttribute('d', pathData);
            line.setAttribute('stroke', getRelationColor(relationType));
            line.setAttribute('stroke-width', '2');
            line.setAttribute('fill', 'none');

            // 根据关系类型设置不同的虚线样式
            if (relationType === 'RELATED') {
              line.setAttribute('stroke-dasharray', '5,5');
            }
            
            // 添加箭头表示方向
            if (relationType === 'LEADS_TO' || relationType === 'PREREQUISITE') {
              line.setAttribute('marker-end', `url(#arrow-${relationType})`);
            }

            line.setAttribute('class', 'mind-map-connection');
            svg.appendChild(line);
          }
        });
      }
    });
    // 添加箭头标记定义
    addArrowMarkers(svg);
  };

  // 添加箭头标记
  function addArrowMarkers(svg: SVGSVGElement) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    const arrowTypes = [
      { id: 'arrow-PREREQUISITE', color: '#ef4444' },
      { id: 'arrow-LEADS_TO', color: '#10b981' }
    ];
    
    arrowTypes.forEach(arrow => {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', arrow.id);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '3');
      marker.setAttribute('markerWidth', '6');
      marker.setAttribute('markerHeight', '6');
      marker.setAttribute('orient', 'auto');
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0,0 L0,6 L9,3 z');
      path.setAttribute('fill', arrow.color);
      
      marker.appendChild(path);
      defs.appendChild(marker);
    });
    
    svg.appendChild(defs);
  }

  const drawNodes = (svg: SVGSVGElement, layout: NodeLayout[]) => {
    layout.forEach(node => {
      const isFocused = node.id === currentFocusNodeId;
      const isCore = node.is_core;
      const isBoundary = node.is_boundary;
      const importance = node.importance || 'medium';
      const relationType = node.relation_type || 'PART_OF';

       // 调试日志
      console.log('渲染节点:', {
        title: node.title,
        isCore,
        isBoundary,
        importance,
        relationType,
        difficulty: node.difficulty,
        
      });
      
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('transform', `translate(${node.x}, ${node.y})`);
      group.setAttribute('data-node-id', node.id.toString());
      group.setAttribute('class', 'mind-map-node-group');

      // 根据节点属性应用 CSS 类
      if (isCore) {
        group.classList.add('core-concept');
      }
      if (isBoundary) {
        group.classList.add('boundary-concept');
      }
      group.classList.add(`importance-${importance}`);

      {
        const learnedBadge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        badge.setAttribute('cx', (node.width - 15).toString());
        badge.setAttribute('cy', '15');
        badge.setAttribute('r', '8');
        badge.setAttribute('fill', node.is_learned ? '#059669' : 'white');
        badge.setAttribute('stroke', node.is_learned ? '#059669' : '#94a3b8');
        badge.setAttribute('stroke-width', '1.5');
        const check = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        check.setAttribute('x', (node.width - 15).toString());
        check.setAttribute('y', '19');
        check.setAttribute('text-anchor', 'middle');
        check.setAttribute('fill', 'white');
        check.setAttribute('font-size', '12');
        if (node.is_learned) check.textContent = '✓';
        learnedBadge.append(badge);
        if (node.is_learned) learnedBadge.appendChild(check);
        group.appendChild(learnedBadge);
      }

      //// 根据节点属性设置颜色
      let nodeColor = 'white';
      let borderColor = '#cbd5e1';
      
      if (isCore) {
        nodeColor = '#fff7ed'; // 核心概念橙色系
        borderColor = '#ea580c';
      } else if (isBoundary) {
        nodeColor = '#f0f9ff'; // 边界知识点蓝色系
        borderColor = '#0ea5e9';
      }
      
      // 根据重要性设置边框粗细
      const borderWidth = importance === 'high' ? '3' : importance === 'medium' ? '2' : '1';
      
      // 节点背景矩形
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', node.width.toString());
      rect.setAttribute('height', node.height.toString());
      rect.setAttribute('rx', '8');
      rect.setAttribute('fill', isFocused ? '#3b82f6' : nodeColor);
      rect.setAttribute('stroke', isFocused ? '#1d4ed8' : borderColor);
      rect.setAttribute('stroke-width', isFocused ? '3' : borderWidth);
      rect.setAttribute('class', 'mind-map-node');

      // 添加关系类型标识
      if (relationType !== 'PART_OF') {
        const relationIndicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        relationIndicator.setAttribute('cx', '10');
        relationIndicator.setAttribute('cy', '10');
        relationIndicator.setAttribute('r', '4');
        relationIndicator.setAttribute('fill', getRelationColor(relationType));
        group.appendChild(relationIndicator);
      }
      
      // 节点标题 - 添加元数据信息
      const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      titleText.setAttribute('x', (node.width / 2).toString());
      titleText.setAttribute('y', '22');
      titleText.setAttribute('text-anchor', 'middle');
      titleText.setAttribute('fill', isFocused ? 'white' : '#334155');
      titleText.setAttribute('font-size', '12');
      titleText.setAttribute('font-weight', '600');
      titleText.setAttribute('pointer-events', 'none');
      const titleChars = Array.from(node.title || '');
      const titleLines = titleChars.reduce<string[]>((lines, character) => {
        const last = lines[lines.length - 1];
        if (!last || Array.from(last).length >= 16) lines.push(character);
        else lines[lines.length - 1] = last + character;
        return lines;
      }, []);
      titleLines.forEach((line, index) => {
        const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        span.setAttribute('x', (node.width / 2).toString());
        span.setAttribute('dy', index === 0 ? '0' : '16');
        span.textContent = line;
        titleText.appendChild(span);
      });

      // 节点元数据（难度、时间）
      const metaText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      metaText.setAttribute('x', (node.width / 2).toString());
      metaText.setAttribute('y', (node.height - 12).toString());
      metaText.setAttribute('text-anchor', 'middle');
      metaText.setAttribute('fill', isFocused ? 'white' : '#6b7280');
      metaText.setAttribute('font-size', '10');
      metaText.textContent = `难度：${node.difficulty || '未设置'}`;
      
      group.appendChild(rect);
      group.appendChild(titleText);
      group.appendChild(metaText);
      svg.appendChild(group);
      
      // 添加点击事件
      group.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        handleNodeClick(node);  // 使用新的点击处理函数
      });
      
      // 添加右键菜单事件
      group.addEventListener('contextmenu', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const mouseEvent = e as MouseEvent;
        setContextMenu({
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
          node: node // 现在 node 包含所有必需的 TreeKnowledgeNode 属性
        });
      });
    });

    // 添加 SVG 背景点击关闭菜单
    svg.addEventListener('click', () => {
      setContextMenu(null);
    });
  };

  const renderMindMap = () => {
    const svg = svgRef.current;
    if (!svg) return;

    // 清空 SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const rootNodes = buildTreeStructure(treeNodes);
    
    if (rootNodes.length === 0) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '50%');
      text.setAttribute('y', '50%');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', '#6b7280');
      text.setAttribute('font-size', '16');
      text.textContent = '没有节点数据可显示';
      svg.appendChild(text);
      return;
    }
    
    const layout = calculateLayout(rootNodes);
    const optimalViewBox = calculateOptimalViewBox(layout);

    const isInitialView = viewBox.width === 1000 && viewBox.height === 600;
    const focusedNode = layout.find(node => node.id === currentFocusNodeId);
    if (isInitialView) setViewBox(optimalViewBox);
    if (focusedNode && lastCenteredNodeId.current !== focusedNode.id) {
      const base = isInitialView ? optimalViewBox : viewBox;
      setViewBox({
        ...base,
        x: focusedNode.x + focusedNode.width / 2 - base.width / 2,
        y: focusedNode.y + focusedNode.height / 2 - base.height / 2,
      });
      lastCenteredNodeId.current = focusedNode.id;
    }
    
    drawConnections(svg, layout);
    drawNodes(svg, layout);
  };

  const expandSelectedNode = async (nodeId: number, treeId: number) => {
    setExpansionError(null);
    try {
      await expandNode(nodeId, treeId);
      const refreshedNodes = useKnowledgeStore.getState().currentTreeNodes;
      setViewBox(calculateOptimalViewBox(calculateLayout(buildTreeStructure(refreshedNodes))));
    } catch (error) {
      setExpansionError({
        nodeId,
        treeId,
        message: error instanceof Error ? error.message : '扩展失败，请重试',
      });
    }
  };

  const handleExpandNode = () => {
    if (contextMenu && currentTreeId) {
      void expandSelectedNode(contextMenu.node.id, currentTreeId);
    }
    setContextMenu(null);
  };

  // 右键所指节点直接切换学习状态，不依赖工具栏中当前选中的节点。
  const handleToggleLearned = () => {
    if (!contextMenu) return;
    const { id, is_learned } = contextMenu.node;
    setContextMenu(null);
    setLearningError('');
    void markNodeLearned(id, !is_learned)
      .catch(error => setLearningError(error instanceof Error ? error.message : '请重试'));
  };

  // 辅助函数：根据关系类型获取颜色
  // 替换原来的 getRelationColor 函数
  function getRelationColor(relationType: string): string {
    const colors: Record<string, string> = {
      'PREREQUISITE': '#ef4444', // 红色-先修
      'LEADS_TO': '#10b981',     // 绿色-引导至
      'PART_OF': '#3b82f6',      // 蓝色-属于
      'RELATED': '#8b5cf6'       // 紫色-相关
    };
    return colors[relationType] || '#6b7280';
  }

  // 重置视图
  const resetView = () => {
    const rootNodes = buildTreeStructure(treeNodes);
    const layout = calculateLayout(rootNodes);
    const optimalViewBox = calculateOptimalViewBox(layout);
    setViewBox(optimalViewBox);
    setZoom(1);
  };

  if (!tree) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-lg">选择或创建知识树开始学习</p>
          <p className="text-sm">思维导图将在这里显示</p>
        </div>
      </div>
    );
  }

  return (
  <div className="mind-map-container" ref={containerRef}>
    {/* 视觉统一：导图工具栏复用柔和按钮样式，缩放及重置处理函数保持不变。 */}
    <div className="mind-map-controls-fixed">
      {/* 两行顺序调整：搜索、帮助、视图切换和导出在上，重置与缩放在下。 */}
      <div className="flex min-w-0 items-center">{toolbar}</div>
      <div className="mt-3 flex justify-between items-center gap-3">
    
        <div className="flex min-w-0 flex-wrap gap-4 items-center">
          <button
            onClick={resetView}
            className="mt-soft-button px-4 py-1.5 text-sm"
          >
            重置视图
          </button>
          {/* 编辑与学习状态操作已移入节点右键菜单，中间工具栏只保留视图控制。 */}
          <div className="flex items-center gap-3 text-sm text-gray-600">
            {/* 缩放控制按钮 */}
            <div className="mt-view-switcher flex items-center gap-1 p-1">
              <button
                onClick={handleZoomOut}
                className="mt-view-tab w-8 h-8 flex items-center justify-center transition-colors"
                title="缩小"
              >
                -
              </button>
              <span className="min-w-[60px] text-center text-xs font-medium">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="mt-view-tab w-8 h-8 flex items-center justify-center transition-colors"
                title="放大"
              >
                +
              </button>
            </div>
            {/* 缩放滑块 */}
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="30"
                max="500"
                value={zoom * 100}
                onChange={(e) => handleZoomChange(parseInt(e.target.value) / 100)}
                className="w-24 accent-[var(--mt-accent)]"
                title="缩放调整"
              />
            </div>
          </div>
        </div>
      </div>
      {expansionError && expansionError.treeId === currentTreeId && (
        <div role="alert" className="flex items-center gap-2 mt-2 text-sm text-red-700">
          <span>扩展失败：{expansionError.message}</span>
          <button
            type="button"
            className="underline"
            onClick={() => void expandSelectedNode(expansionError.nodeId, expansionError.treeId)}
          >
            重试
          </button>
        </div>
      )}
      {learningError && <div role="alert" className="mt-2 text-sm text-red-700">学习状态保存失败：{learningError}</div>}
    </div>

    
    {/* 思维导图内容区域 */}
    <div className="mind-map-content">
      <div 
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: '0 0',
          width: '100%',
          height: '100%'
        }}
      >
        <svg
          ref={svgRef}
          className="mind-map-svg"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        />
      </div>
    </div>

    {/* 操作提示 */}
    <div className="p-2 text-xs text-gray-500 text-center">
      提示: 拖动可移动视图 • 使用缩放按钮调整大小
    </div>

    {/* 右键菜单 */}
    {contextMenu && (
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={() => setContextMenu(null)}
        onExpand={handleExpandNode}
        onEdit={() => { onEditNode(contextMenu.node.id); setContextMenu(null); }}
        isLearned={Boolean(contextMenu.node.is_learned)}
        onToggleLearned={handleToggleLearned}
      />
    )}
  </div>
);
};
