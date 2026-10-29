import React from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onExpand: () => void;
  onEdit: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  onExpand,
  onEdit,
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

// 右键菜单直接列出三个操作，避免让“编辑节点”看起来像展开确认的一部分。
  return (
    <div 
      className="context-menu mt-surface fixed z-50 p-4 min-w-64"
      style={{ left: x, top: y }}
    >
      <h4 className="font-semibold text-gray-800 mb-3">节点操作</h4>
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" onClick={onEdit} className="mt-soft-button px-3 py-1.5 text-sm">编辑节点</button>
        {/* 三个操作采用同一浅色按钮样式，避免突出其中一个选项。 */}
        <button type="button" onClick={handleExpand} className="mt-soft-button px-3 py-1.5 text-sm">展开节点</button>
        <button type="button" onClick={handleCancel} className="mt-soft-button px-3 py-1.5 text-sm">取消</button>
      </div>
    </div>
  );
};
