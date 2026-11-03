import { useState, type ReactNode } from 'react';
import { useKnowledgeStore } from '../../stores/useKnowledgeStore';
import { KnowledgeFileActions } from './KnowledgeFileActions';

interface NewKnowledgeTreeButtonProps {
  className?: string;
  children?: ReactNode;
}

export function NewKnowledgeTreeButton({
  className = 'mt-primary-button w-full px-4 py-2',
  children = '新建知识树',
}: NewKnowledgeTreeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { createNewTree, isLoading } = useKnowledgeStore();

  const createFromTopic = async () => {
    const topic = window.prompt('请输入学习主题，例如：机器学习、数据库、操作系统');
    if (!topic?.trim()) return;
    try {
      await createNewTree(topic.trim());
      setIsOpen(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '创建知识树失败');
    }
  };

  return (
    <div className="w-full">
      <button type="button" disabled={isLoading} onClick={() => setIsOpen(open => !open)} className={className}>
        {isLoading ? '创建中…' : children}
      </button>
      {isOpen && <div className="mt-surface mt-2 flex flex-col gap-2 p-3" aria-label="选择知识树创建方式">
        <p className="text-sm font-medium text-[var(--mt-ink)]">选择新建方式</p>
        <button type="button" disabled={isLoading} onClick={() => void createFromTopic()} className="mt-soft-button w-full px-3 py-2 text-sm">
          通过学习主题生成
        </button>
        <KnowledgeFileActions nodes={[]} mode="import" />
        <button type="button" onClick={() => setIsOpen(false)} className="mt-muted py-1 text-xs">取消</button>
      </div>}
    </div>
  );
}
