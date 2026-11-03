import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useKnowledgeStore } from '../../../stores/useKnowledgeStore';
import type { TreeKnowledgeNode } from '../../../types';
import { buildTreeStructure } from '../../../utils/knowledgeTreeUtils';
import { ContextMenu } from '../ContextMenu';
import './MindMapVisualization.css';


interface MindMapVisualizationProps {
  onNodeClick?: (node: TreeKnowledgeNode) => void;
  onEditNode: (nodeId: number) => void;
  onDeleteNode: (nodeId: number) => void;
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
  onDeleteNode,
  toolbar,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const pendingZoomScroll = useRef<{ left: number; top: number } | null>(null);
  const wheelZoomFrame = useRef<number | null>(null);
  const pendingWheelZoom = useRef<{ deltaY: number; clientX: number; clientY: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{x: number; y: number; node: TreeKnowledgeNode} | null>(null);
  const [expansionError, setExpansionError] = useState<{nodeId: number; treeId: number; message: string} | null>(null);
  const [learningError, setLearningError] = useState('');
  const [celebratingNodeId, setCelebratingNodeId] = useState<number | null>(null);
  const celebrationTimer = useRef<number | null>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 1000, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const panPoint = useRef<{ x: number; y: number } | null>(null);
  const lastCenteredNodeId = useRef<number | null>(null);
  const lastRevealVersion = useRef(0);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const zoomChangeRef = useRef<(newZoom: number, clientX?: number, clientY?: number) => void>(() => {});
  zoomRef.current = zoom;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const nextSize = {
        width: Math.max(1, viewport.clientWidth),
        height: Math.max(1, viewport.clientHeight),
      };
      setViewportSize(previous => previous.width === nextSize.width && previous.height === nextSize.height
        ? previous
        : nextSize);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // Apply the anchor correction after React updates the canvas size but before the browser paints.
  // Deferring this to a second animation frame made the diagram visibly jump between frames.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const pending = pendingZoomScroll.current;
    pendingZoomScroll.current = null;
    if (!viewport || !pending) return;
    viewport.scrollLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, pending.left));
    viewport.scrollTop = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, pending.top));
  }, [zoom, viewportSize]);

  // Native non-passive listener is required so Ctrl+wheel can cancel browser page zoom.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleNativeWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const pending = pendingWheelZoom.current;
      pendingWheelZoom.current = {
        deltaY: (pending?.deltaY ?? 0) + event.deltaY,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      // Trackpads can emit many wheel events per frame. Apply one zoom update per paint
      // and use the latest pointer location as the anchor for that batch.
      if (wheelZoomFrame.current === null) {
        wheelZoomFrame.current = requestAnimationFrame(() => {
          wheelZoomFrame.current = null;
          const wheel = pendingWheelZoom.current;
          pendingWheelZoom.current = null;
          if (!wheel) return;
          zoomChangeRef.current(
            zoomRef.current * Math.exp(-wheel.deltaY * 0.002),
            wheel.clientX,
            wheel.clientY,
          );
        });
      }
    };
    viewport.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleNativeWheel);
  }, []);
  
  const {
    currentTreeId,
    currentTree,
    currentFocusNodeId,
    setFocusNode,
    getCurrentTreeNodes,
    expandNode,
    markNodeLearned,
    toggleNodeExpansion,
    revealVersion,
  } = useKnowledgeStore();

  const treeNodes = getCurrentTreeNodes();
  const tree = currentTree();

  useEffect(() => {
    setViewBox({ x: 0, y: 0, width: 1000, height: 600 });
    zoomRef.current = 1;
    setZoom(1);
    if (wheelZoomFrame.current !== null) window.cancelAnimationFrame(wheelZoomFrame.current);
    pendingZoomScroll.current = null;
    wheelZoomFrame.current = null;
    pendingWheelZoom.current = null;
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
      viewportRef.current.scrollTop = 0;
    }
    lastCenteredNodeId.current = null;
  }, [currentTreeId]);

  useEffect(() => () => {
    if (celebrationTimer.current !== null) window.clearTimeout(celebrationTimer.current);
    if (wheelZoomFrame.current !== null) window.cancelAnimationFrame(wheelZoomFrame.current);
  }, []);

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
    if (!panPoint.current || !viewportRef.current) return;
    const point = panPoint.current;
    viewportRef.current.scrollLeft -= event.clientX - point.x;
    viewportRef.current.scrollTop -= event.clientY - point.y;
    panPoint.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panPoint.current = null;
    setIsDragging(false);
  };

  // 放大时扩展实际 SVG 画布尺寸，从而让视口出现可拖动的上下/左右滚动条。
  // 计算缩放前鼠标所在的画布比例，缩放后调整 scrollLeft/Top，保持该位置锚定在鼠标下。
  const handleZoomChange = (newZoom: number, clientX?: number, clientY?: number) => {
    // 保留 main 已确定的 500% 上限，同时使用新分支的滚轮锚点缩放。
    const clampedZoom = Math.max(0.3, Math.min(5, newZoom));
    if (clampedZoom === zoomRef.current) return;
    const viewport = viewportRef.current;
    const svg = svgRef.current;
    const viewportBounds = viewport?.getBoundingClientRect();
    const svgBounds = svg?.getBoundingClientRect();
    const localX = viewportBounds ? (clientX ?? viewportBounds.left + viewportBounds.width / 2) - viewportBounds.left : 0;
    const localY = viewportBounds ? (clientY ?? viewportBounds.top + viewportBounds.height / 2) - viewportBounds.top : 0;
    const ratioX = viewport && svgBounds
      ? Math.max(0, Math.min(1, (localX - svgBounds.left + (viewportBounds?.left ?? 0)) / Math.max(svgBounds.width, 1)))
      : 0.5;
    const ratioY = viewport && svgBounds
      ? Math.max(0, Math.min(1, (localY - svgBounds.top + (viewportBounds?.top ?? 0)) / Math.max(svgBounds.height, 1)))
      : 0.5;
    const nextWidth = viewportSize.width * clampedZoom;
    const nextHeight = viewportSize.height * clampedZoom;
    const nextLeft = Math.max(0, (viewportSize.width - nextWidth) / 2);
    const nextTop = Math.max(0, (viewportSize.height - nextHeight) / 2);
    zoomRef.current = clampedZoom;
    setZoom(clampedZoom);
    pendingZoomScroll.current = {
      left: ratioX * nextWidth + nextLeft - localX,
      top: ratioY * nextHeight + nextTop - localY,
    };
  };

  // 缩放按钮处理
  const handleZoomIn = () => {
    handleZoomChange(zoom + 0.1);
  };

  const handleZoomOut = () => {
    handleZoomChange(zoom - 0.1);
  };
  zoomChangeRef.current = handleZoomChange;

  useEffect(() => {
    if (lastRevealVersion.current !== revealVersion) {
      lastCenteredNodeId.current = null;
      lastRevealVersion.current = revealVersion;
    }
    if (svgRef.current) renderMindMap();
  }, [treeNodes, currentFocusNodeId, revealVersion, celebratingNodeId]);

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
      group.classList.add(node.is_learned ? 'node-learned' : 'node-unlearned');
      const hasStarTag = Boolean(isCore || isBoundary || importance === 'high' || relationType !== 'PART_OF');
      const nodeTitle = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      nodeTitle.textContent = `${node.title} · ${node.is_learned ? '已学习' : '未学习'}`;
      group.appendChild(nodeTitle);

      const learnedBadge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      {
        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        badge.setAttribute('cx', (node.width - 15).toString());
        badge.setAttribute('cy', '15');
        badge.setAttribute('r', '8');
        badge.setAttribute('fill', node.is_learned ? '#059669' : '#fff7ed');
        badge.setAttribute('stroke', node.is_learned ? '#059669' : '#f59e0b');
        badge.setAttribute('stroke-width', '1.5');
        const check = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        check.setAttribute('x', (node.width - 15).toString());
        check.setAttribute('y', '19');
        check.setAttribute('text-anchor', 'middle');
        check.setAttribute('fill', node.is_learned ? 'white' : '#b45309');
        check.setAttribute('font-size', '12');
        check.textContent = node.is_learned ? '✓' : '○';
        learnedBadge.append(badge);
        learnedBadge.appendChild(check);
        // 右键菜单继续提供编辑、展开、删除；状态圆标可直接切换学习状态。
        learnedBadge.setAttribute('role', 'button');
        learnedBadge.setAttribute('tabindex', '0');
        learnedBadge.setAttribute('aria-label', node.is_learned ? `标记${node.title}为未学习` : `标记${node.title}为已学习`);
        learnedBadge.style.cursor = 'pointer';
        learnedBadge.addEventListener('click', event => {
          event.stopPropagation();
          void toggleLearned(node);
        });
        learnedBadge.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault(); event.stopPropagation();
          void toggleLearned(node);
        });
      }

      //// 根据节点属性设置颜色
      let nodeColor = 'white';
      let borderColor = '#cbd5e1';
      
      if (node.is_learned) {
        nodeColor = '#ecfdf5';
        borderColor = '#10b981';
      } else if (isCore) {
        nodeColor = '#fff7ed'; // 核心概念橙色系
        borderColor = '#ea580c';
      } else if (isBoundary) {
        nodeColor = '#f0f9ff'; // 边界知识点蓝色系
        borderColor = '#0ea5e9';
      } else {
        nodeColor = '#f8fafc';
        borderColor = '#94a3b8';
      }
      
      // 根据重要性设置边框粗细
      const borderWidth = importance === 'high' ? '3' : importance === 'medium' ? '2' : '1';
      
      // 节点背景矩形
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', node.width.toString());
      rect.setAttribute('height', node.height.toString());
      rect.setAttribute('rx', '8');
      rect.setAttribute('fill', isFocused && !node.is_learned ? '#3b82f6' : nodeColor);
      rect.setAttribute('stroke', isFocused ? '#1d4ed8' : borderColor);
      rect.setAttribute('stroke-width', isFocused ? '3' : borderWidth);
      rect.setAttribute('class', node.is_learned && celebratingNodeId === node.id
        ? 'mind-map-node mind-map-node-learning-complete'
        : 'mind-map-node');

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
      titleText.setAttribute('fill', isFocused && !node.is_learned ? 'white' : '#334155');
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
      metaText.setAttribute('fill', isFocused && !node.is_learned ? 'white' : '#6b7280');
      metaText.setAttribute('font-size', '10');
      metaText.textContent = `难度：${node.difficulty || '未设置'} · ${node.is_learned ? '已学习' : '未学习'}${hasStarTag ? ' · ⭐' : ''}`;
      
      group.appendChild(rect);
      group.appendChild(titleText);
      group.appendChild(metaText);
      // SVG 后绘制的元素在上层，状态圆标需盖在节点背景上才能点击。
      group.appendChild(learnedBadge);
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

  const toggleLearned = async (node: TreeKnowledgeNode) => {
    setLearningError('');
    try {
      await markNodeLearned(node.id, !node.is_learned);
      if (!node.is_learned) {
        setCelebratingNodeId(node.id);
        if (celebrationTimer.current !== null) window.clearTimeout(celebrationTimer.current);
        celebrationTimer.current = window.setTimeout(() => setCelebratingNodeId(null), 850);
      }
    } catch (error) {
      setLearningError(error instanceof Error ? error.message : '更新学习状态失败，请重试');
    }
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
    zoomRef.current = 1;
    setZoom(1);
    pendingZoomScroll.current = null;
    if (wheelZoomFrame.current !== null) window.cancelAnimationFrame(wheelZoomFrame.current);
    wheelZoomFrame.current = null;
    pendingWheelZoom.current = null;
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
      viewportRef.current.scrollTop = 0;
    }
  };

  const svgWidth = Math.max(1, viewportSize.width * zoom);
  const svgHeight = Math.max(1, viewportSize.height * zoom);
  const surfaceWidth = Math.max(viewportSize.width, svgWidth);
  const surfaceHeight = Math.max(viewportSize.height, svgHeight);
  const svgLeft = Math.max(0, (surfaceWidth - svgWidth) / 2);
  const svgTop = Math.max(0, (surfaceHeight - svgHeight) / 2);

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
      {/* 两行顺序调整：搜索、视图切换和导出在上，重置与缩放在下。 */}
      <div className="flex min-w-0 items-center">{toolbar}</div>
      <div className="mt-3 flex justify-between items-center gap-3">
    
        <div className="flex min-w-0 flex-wrap gap-4 items-center">
          <button
            onClick={resetView}
            className="mt-soft-button px-4 py-1.5 text-sm"
          >
            重置视图
          </button>
          {/* 节点操作位于右键菜单，中间工具栏只保留视图控制。 */}
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
      {learningError && <p role="alert" className="mt-2 text-sm text-red-700">{learningError}</p>}
    </div>

    
    {/* 思维导图内容区域 */}
    <div ref={viewportRef} className="mind-map-content">
      <div className="mind-map-scroll-surface" style={{ width: surfaceWidth, height: surfaceHeight }}>
        <svg
          ref={svgRef}
          className="mind-map-svg"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            position: 'absolute',
            left: svgLeft,
            top: svgTop,
            width: svgWidth,
            height: svgHeight,
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
        />
      </div>
    </div>

    {/* 操作提示 */}
    <div className="p-2 text-xs text-gray-500 text-center">
      提示: 拖动可移动视图 • 按住 Ctrl 并滚动可缩放，也可使用缩放按钮
    </div>

    {/* 右键菜单 */}
    {contextMenu && (
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={() => setContextMenu(null)}
        onExpand={handleExpandNode}
        onEdit={() => { onEditNode(contextMenu.node.id); setContextMenu(null); }}
        onDelete={() => { onDeleteNode(contextMenu.node.id); setContextMenu(null); }}
      />
    )}
  </div>
);
};
