//单面板可调整大小组件
import { useState } from 'react';

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  direction?: 'horizontal' | 'vertical';
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  defaultWidth = 300,
  minWidth = 200,
  maxWidth = 500,
  direction = 'horizontal'
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = direction === 'horizontal' 
        ? startWidth + (e.clientX - startX)
        : width;
      
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      className={`relative ${direction === 'horizontal' ? 'flex' : 'block'}`}
      style={{ width: direction === 'horizontal' ? width : 'auto' }}
    >
      {children}
      <div
        className={`absolute top-0 bottom-0 cursor-col-resize hover:bg-blue-300 transition-colors ${
          direction === 'horizontal' ? 'right-0 w-2' : 'left-0 right-0 h-2'
        } ${isResizing ? 'bg-blue-400' : 'bg-transparent'}`}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
};