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

//展开节点显示对话
  return (
    <div 
      className="context-menu fixed z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-4 min-w-64"
      style={{ left: x, top: y }}
    >
      <h4 className="font-semibold text-gray-800 mb-3">节点操作</h4>
      <p className="text-sm text-gray-600 mb-3">是否要展开节点 "{nodeTitle}"？</p>
      
      <div className="flex gap-2 justify-end">
        <button
          onClick={handleCancel}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          否
        </button>
        <button
          onClick={handleExpand}
          className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          是
        </button>
      </div>
    </div>
  );
};