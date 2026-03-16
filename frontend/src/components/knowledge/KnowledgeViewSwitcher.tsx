import React from 'react';
import { ChartBarIcon, MapIcon } from '@heroicons/react/24/outline';

export type KnowledgeViewMode = 'tree' | 'mindmap';

interface KnowledgeViewSwitcherProps {
  currentView: KnowledgeViewMode;
  onViewChange: (view: KnowledgeViewMode) => void;
}

export const KnowledgeViewSwitcher: React.FC<KnowledgeViewSwitcherProps> = ({
  currentView,
  onViewChange
}) => {
  const views = [
    { key: 'tree' as KnowledgeViewMode, label: '树状视图', icon: ChartBarIcon },
    { key: 'mindmap' as KnowledgeViewMode, label: '思维导图', icon: MapIcon }
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
      {views.map((view) => (
        <button
          key={view.key}
          onClick={() => onViewChange(view.key)}
          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            currentView === view.key
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <view.icon className="w-4 h-4" />
          {view.label}
        </button>
      ))}
    </div>
  );
};