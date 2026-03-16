import React, { useEffect, useRef, useState } from 'react';
import { useKnowledgeStore } from '../../../stores/useKnowledgeStore';
import type { TreeKnowledgeNode, DbKnowledgeNode } from '../../../types';
import { ContextMenu } from '../ContextMenu';
import './MindMapVisualization.css';


interface MindMapVisualizationProps {
  onNodeClick?: (node: TreeKnowledgeNode) => void;
}

// 扩展 NodeLayout 接口，包含所有必需的属性
interface NodeLayout extends TreeKnowledgeNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MindMapVisualization: React.FC<MindMapVisualizationProps> = ({ 
  onNodeClick 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{x: number; y: number; node: TreeKnowledgeNode} | null>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 1000, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  
  const {
    currentTreeId,
    currentTree,
    currentFocusNodeId,
    setFocusNode,
    getCurrentTreeNodes,
    expandNode,
    toggleNodeExpansion  
  } = useKnowledgeStore();

  const treeNodes = getCurrentTreeNodes();
  const tree = currentTree();

  // 构建树形结构
  const buildTreeStructure = (nodes: DbKnowledgeNode[]): TreeKnowledgeNode[] => {
    const nodeMap = new Map<number, TreeKnowledgeNode>();
    const rootNodes: TreeKnowledgeNode[] = [];

    nodes.forEach(node => {
      const treeNode: TreeKnowledgeNode = {
        id: node.id,
        title: node.label,
        description: node.content ? node.content.substring(0, 100) + '...' : '',
        content: node.content,
        children: [],
        isExpanded: node.isExpanded ?? true,
        isLoading: false,
        // 添加所有样式相关属性
        is_core: node.is_core || false,
        is_boundary: node.is_boundary || false,
        importance: node.importance || 'medium',
        relation_type: node.relation_type || 'PART_OF',
        difficulty: node.difficulty || 'medium',
        
      };
      nodeMap.set(node.id, treeNode);
    });

    nodes.forEach(node => {
      const treeNode = nodeMap.get(node.id)!;
      if (node.parent_id === null) {
        rootNodes.push(treeNode);
      } else {
        const parent = nodeMap.get(node.parent_id);
        if (parent) {
          parent.children.push(treeNode);
        }
      }
    });

    return rootNodes;
  };

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
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // 左键
      setIsDragging(true);
      setStartPan({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const dx = 2*(e.clientX - startPan.x) / zoom;
    const dy = 2*(e.clientY - startPan.y) / zoom;
    
    setViewBox(prev => ({
      ...prev,
      x: prev.x - dx,
      y: prev.y - dy
    }));
    
    setStartPan({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 滑块缩放处理
  const handleZoomChange = (newZoom: number) => {
    const clampedZoom = Math.max(0.3, Math.min(3, newZoom));
    setZoom(clampedZoom);
  };

  // 缩放按钮处理
  const handleZoomIn = () => {
    handleZoomChange(zoom + 0.1);
  };

  const handleZoomOut = () => {
    handleZoomChange(zoom - 0.1);
  };

  // 重置缩放
  const handleResetZoom = () => {
    setZoom(1);
  };



  useEffect(() => {
    if (svgRef.current && treeNodes.length > 0) {
      renderMindMap();
    }
  }, [treeNodes, currentFocusNodeId, zoom]);

  const calculateLayout = (rootNodes: TreeKnowledgeNode[]): NodeLayout[] => {
    const layout: NodeLayout[] = [];
    let currentY = 50;

    const traverse = (node: TreeKnowledgeNode, depth: number, index: number, parentY?: number) => {
      const nodeWidth = 120;
      const nodeHeight = 60;
      const horizontalSpacing = 200;
      const verticalSpacing = 80;

      let nodeX, nodeY;

      if (depth === 0) {
        // 根节点居中显示
        nodeX = 50;
        nodeY = currentY;
        currentY += nodeHeight + verticalSpacing;
      } else {
        nodeX = depth * horizontalSpacing + 50;
        nodeY = parentY! + (index * (nodeHeight + verticalSpacing));
      }

      const nodeLayout: NodeLayout = {
        ...node, // 复制所有 TreeKnowledgeNode 属性
        x: nodeX,
        y: nodeY,
        width: nodeWidth,
        height: nodeHeight
      };

      layout.push(nodeLayout);

      if (node.children && node.children.length > 0 && node.isExpanded) {
        node.children.forEach((child, childIndex) => {
          traverse(child, depth + 1, childIndex, nodeY);
        });
      }
    };

    rootNodes.forEach((node, index) => {
      traverse(node, 0, index);
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
      
      // 根据关系类型设置不同的节点形状或图标
      let nodeShape = 'rect';
      if (relationType === 'PREREQUISITE') {
        // 先修关系可以用特殊形状表示
        nodeShape = 'rect';
      } else if (relationType === 'LEADS_TO') {
        // 引导至关系
        nodeShape = 'rect';
      }
      
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
      titleText.setAttribute('y', (node.height / 2 - 8).toString());
      titleText.setAttribute('text-anchor', 'middle');
      titleText.setAttribute('fill', isFocused ? 'white' : '#334155');
      titleText.setAttribute('font-size', '12');
      titleText.setAttribute('font-weight', '600');
      titleText.textContent = node.title;

      // 节点元数据（难度、时间）
      const metaText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      metaText.setAttribute('x', (node.width / 2).toString());
      metaText.setAttribute('y', (node.height / 2 + 8).toString());
      metaText.setAttribute('text-anchor', 'middle');
      metaText.setAttribute('fill', isFocused ? 'white' : '#6b7280');
      metaText.setAttribute('font-size', '10');
      metaText.textContent = `importance : ${node.difficulty} `;
      
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
    
    // 首次渲染时设置最佳视图
    if (viewBox.width === 1000 && viewBox.height === 600) {
      setViewBox(optimalViewBox);
    }
    
    drawConnections(svg, layout);
    drawNodes(svg, layout);
  };

  const handleExpandNode = async () => {
    if (contextMenu && currentTreeId) {
      try {
        console.log('开始扩展节点:', contextMenu.node.title, 'ID:', contextMenu.node.id);
        await expandNode(contextMenu.node.id, currentTreeId);
      } catch (error) {
        console.error('扩展节点失败:', error);
        alert('扩展节点失败: ' + (error instanceof Error ? error.message : '未知错误'));
      }
    }
    setContextMenu(null);
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
    {/* 固定在顶部的控制栏 */}
    <div className="mind-map-controls-fixed">
      <div className="flex justify-between items-center">
    
        <div className="flex gap-20 items-center">
          <button
            onClick={resetView}
            className="px-5 py-1.5 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          >
            重置视图
          </button>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            {/* 缩放控制按钮 */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={handleZoomOut}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 transition-colors"
                title="缩小"
              >
                -
              </button>
              <span className="min-w-[60px] text-center text-xs font-medium">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 transition-colors"
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
                max="300"
                value={zoom * 100}
                onChange={(e) => handleZoomChange(parseInt(e.target.value) / 100)}
                className="w-24 accent-blue-500"
                title="缩放调整"
              />
            </div>
          </div>
        </div>
      </div>
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
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
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
        nodeTitle={contextMenu.node.title}
      />
    )}
  </div>
);
};