//面板组，可调整大小
import React, { useState, useRef, useEffect } from 'react';

interface ResizablePanelGroupProps {
  children: React.ReactNode;
  direction?: 'horizontal' | 'vertical';
  className?: string;
}

export const ResizablePanelGroup: React.FC<ResizablePanelGroupProps> = ({
  children,
  direction = 'horizontal',
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeIndex, setResizeIndex] = useState<number | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [panelSizes, setPanelSizes] = useState<number[]>([]);

  // 初始化面板大小
  useEffect(() => {
    const childrenCount = React.Children.count(children);
    if (childrenCount > 0) {
      const equalSize = 100 / childrenCount;
      setPanelSizes(Array(childrenCount).fill(equalSize));
    }
  }, [children]);

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

        if (newSizes[leftPanelIndex] + delta < 10 || newSizes[rightPanelIndex] - delta < 10) {
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
            className={`${direction === 'horizontal' ? 'h-full' : 'w-full'} ${
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
          {index < React.Children.count(children) - 1 && (
            <div
              className={`relative group ${
                direction === 'horizontal' 
                  ? 'w-2 cursor-col-resize' 
                  : 'h-2 cursor-row-resize'
              }`}
              onMouseDown={(e) => handleMouseDown(index, e)}
            >
              <div
                className={`absolute inset-0 bg-transparent transition-colors ${
                  direction === 'horizontal' 
                    ? 'group-hover:bg-blue-300 w-1 left-1/2 -translate-x-1/2' 
                    : 'group-hover:bg-blue-300 h-1 top-1/2 -translate-y-1/2'
                } ${isResizing && resizeIndex === index ? 'bg-blue-400' : ''}`}
              />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};