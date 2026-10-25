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
    // 视觉统一：两个视图按钮共享同一分段控件外观，切换行为不变。
    <div className="mt-view-switcher flex items-center gap-1 p-1">
      {views.map((view) => (
        <button
          key={view.key}
          onClick={() => onViewChange(view.key)}
          className={`mt-view-tab flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
            currentView === view.key
              ? 'mt-view-tab-active'
              : ''
          }`}
        >
          <view.icon className="w-4 h-4" />
          {view.label}
        </button>
      ))}
    </div>
  );
};
