import React from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onExpand: () => void;
  nodeTitle: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  onExpand,
  nodeTitle
}) => {
  const handleExpand = () => {
    onExpand();
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.context-menu')) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

// 视觉统一：右键菜单沿用工作台卡片和按钮样式，确认与取消行为不变。
  return (
    <div 
      className="context-menu mt-surface fixed z-50 p-4 min-w-64"
      style={{ left: x, top: y }}
    >
      <h4 className="font-semibold text-gray-800 mb-3">节点操作</h4>
      <p className="text-sm text-gray-600 mb-3">是否要展开节点 "{nodeTitle}"？</p>
      
      <div className="flex gap-2 justify-end">
        <button
          onClick={handleCancel}
          className="mt-soft-button px-3 py-1.5 text-sm"
        >
          否
        </button>
        <button
          onClick={handleExpand}
          className="mt-primary-button px-3 py-1.5 text-sm"
        >
          是
        </button>
      </div>
    </div>
  );
};
