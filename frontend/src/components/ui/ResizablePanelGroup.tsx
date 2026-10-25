//面板组，可调整大小
import React, { useState, useRef, useEffect } from 'react';

interface ResizablePanelGroupProps {
  children: React.ReactNode;
  direction?: 'horizontal' | 'vertical';
  className?: string;
  initialSizes?: number[];
  hideDivider?: boolean;
}

export const ResizablePanelGroup: React.FC<ResizablePanelGroupProps> = ({
  children,
  direction = 'horizontal',
  className = '',
  initialSizes,
  hideDivider = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeIndex, setResizeIndex] = useState<number | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [panelSizes, setPanelSizes] = useState<number[]>([]);
  const childrenCount = React.Children.count(children);

  // 只在面板数量或预设比例变化时初始化，避免节点切换时把用户拖动后的比例重置。
  useEffect(() => {
    if (childrenCount > 0) {
      setPanelSizes(initialSizes?.length === childrenCount
        ? [...initialSizes]
        : Array(childrenCount).fill(100 / childrenCount));
    }
  }, [childrenCount, initialSizes]);

  const handleMouseDown = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeIndex(index);
    setStartPos({
      x: e.clientX,
      y: e.clientY
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || resizeIndex === null || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerSize = direction === 'horizontal' ? containerRect.width : containerRect.height;
      
      const delta = direction === 'horizontal' 
        ? ((e.clientX - startPos.x) / containerSize) * 100
        : ((e.clientY - startPos.y) / containerSize) * 100;

      setPanelSizes(prevSizes => {
        const newSizes = [...prevSizes];
        const leftPanelIndex = resizeIndex;
        const rightPanelIndex = resizeIndex + 1;

        // 纵向对话默认缩至 20%，拖动下限相应降为 18%，避免小于旧下限后无法继续拖动。
        const minimumSize = direction === 'vertical' ? 18 : 10;
        if (newSizes[leftPanelIndex] + delta < minimumSize || newSizes[rightPanelIndex] - delta < minimumSize) {
          return prevSizes; // 防止面板过小
        }

        newSizes[leftPanelIndex] += delta;
        newSizes[rightPanelIndex] -= delta;

        return newSizes;
      });

      setStartPos({
        x: e.clientX,
        y: e.clientY
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeIndex(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resizeIndex, startPos, direction]);

  return (
    <div
      ref={containerRef}
      className={`flex ${direction === 'horizontal' ? 'flex-row' : 'flex-col'} ${className} ${
        isResizing ? 'select-none' : ''
      }`}
    >
      {React.Children.map(children, (child, index) => (
        <React.Fragment key={index}>
          {/* 面板 */}
          <div
            className={`min-w-0 min-h-0 ${direction === 'horizontal' ? 'h-full' : 'w-full'} ${
              isResizing && index === resizeIndex ? 'select-none' : ''
            }`}
            style={{
              [direction === 'horizontal' ? 'width' : 'height']: `${panelSizes[index] || 50}%`,
              flexShrink: 0
            }}
          >
            {child}
          </div>
          
          {/* 调整手柄（除了最后一个面板） */}
          {index < childrenCount - 1 && (
            <div
              // 分隔区始终可拖动；右侧上下卡片可隐藏可见线条，只保留透明热区。
              className={`mt-resize-handle relative group ${
                direction === 'horizontal' 
                  ? 'mt-resize-handle-horizontal w-2 cursor-col-resize'
                  : 'mt-resize-handle-vertical h-2 cursor-row-resize'
              }`}
              onMouseDown={(e) => handleMouseDown(index, e)}
            >
              {!hideDivider && (
                <div
                  className={`mt-resize-divider absolute ${
                    direction === 'horizontal'
                      ? 'w-px h-full left-1/2 -translate-x-1/2'
                      : 'h-px w-full top-1/2 -translate-y-1/2'
                  }`}
                />
              )}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
