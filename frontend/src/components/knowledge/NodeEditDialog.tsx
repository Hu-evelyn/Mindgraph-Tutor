import { useEffect, useState } from 'react';
import type { DbKnowledgeNode } from '../../types';

interface NodeEditDialogProps {
  node: DbKnowledgeNode;
  onClose: () => void;
  onSave: (label: string) => Promise<void>;
}

// 两种知识视图只负责修改节点名称；具体笔记在右侧知识点详情中编辑。
export function NodeEditDialog({ node, onClose, onSave }: NodeEditDialogProps) {
  const [label, setLabel] = useState(node.label);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextLabel = label.trim();
    if (!nextLabel || nextLabel.length > 100) {
      setError('节点名称须为 1–100 字符');
      return;
    }
    if (nextLabel === node.label) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(nextLabel);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form onSubmit={event => void submit(event)} role="dialog" aria-modal="true" aria-labelledby="node-edit-title"
        className="mt-surface w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div>
          <h2 id="node-edit-title" className="text-lg font-semibold text-[var(--mt-ink)]">编辑节点</h2>
          <p className="mt-muted text-xs mt-1">节点名称会同步显示在两种视图和右侧详情中。</p>
        </div>
        <label className="block text-sm font-medium text-[var(--mt-ink)]">
          节点名称
          <input autoFocus required maxLength={100} value={label} onChange={event => setLabel(event.target.value)}
            className="mt-input mt-2 w-full px-3 py-2 text-sm" />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={onClose} className="mt-soft-button px-4 py-2 text-sm">取消</button>
          <button type="submit" disabled={saving} className="mt-primary-button px-4 py-2 text-sm">
            {saving ? '保存中...' : '保存修改'}
          </button>
        </div>
      </form>
    </div>
  );
}
