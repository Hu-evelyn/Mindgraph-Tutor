import { useEffect, useState } from 'react';

interface NodeDeleteDialogProps {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

// 树状视图和思维导图共用同一个确认框；仅点“是”才执行递归删除。
export function NodeDeleteDialog({ onCancel, onConfirm }: NodeDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [deleting, onCancel]);

  const confirm = async () => {
    setDeleting(true);
    setError('');
    try {
      await onConfirm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败，请重试');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={event => { if (event.target === event.currentTarget && !deleting) onCancel(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="node-delete-title"
        className="mt-surface w-full max-w-md p-5 space-y-4">
        <h2 id="node-delete-title" className="text-lg font-semibold text-[var(--mt-ink)]">
          确认删除该节点及之后的所有子节点？
        </h2>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={deleting} onClick={onCancel} className="mt-soft-button px-4 py-2 text-sm">否</button>
          <button type="button" disabled={deleting} onClick={() => void confirm()}
            className="mt-primary-button px-4 py-2 text-sm">{deleting ? '删除中...' : '是'}</button>
        </div>
      </div>
    </div>
  );
}
