import { useEffect, useState } from 'react';
import type { DbKnowledgeNode } from '../../types';

interface NodeEditDialogProps {
  node: DbKnowledgeNode;
  onClose: () => void;
  onSave: (label: string, options: { regenerateChildren: boolean; regenerateNote: boolean }) => Promise<void>;
}

// 两种视图共用此流程：先确认子节点，再确认笔记，最后才提交编辑。
export function NodeEditDialog({ node, onClose, onSave }: NodeEditDialogProps) {
  const [label, setLabel] = useState(node.label);
  const [step, setStep] = useState<'edit' | 'children' | 'note'>('edit');
  const [regenerateChildren, setRegenerateChildren] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextLabel = label.trim();
    if (!nextLabel || nextLabel.length > 100) {
      setError('节点名称须为 1–100 字符');
      return;
    }
    setError('');
    setStep('children');
  };

  const chooseNote = async (regenerateNote: boolean) => {
    setSaving(true);
    setError('');
    try {
      // 两项都选“否”且名称未变时无需请求；其余情况交给统一保存流程。
      if (label.trim() !== node.label || regenerateChildren || regenerateNote) {
        await onSave(label.trim(), { regenerateChildren, regenerateNote });
      }
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
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="node-edit-title"
        className="mt-surface w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
        {step === 'edit' ? <>
          <div>
            {/* 编辑节点弹窗只保留标题，移除标题下方的说明文字。 */}
            <h2 id="node-edit-title" className="text-lg font-semibold text-[var(--mt-ink)]">编辑节点</h2>
          </div>
          <label className="block text-sm font-medium text-[var(--mt-ink)]">
            节点名称
            <input autoFocus required maxLength={100} value={label} onChange={event => setLabel(event.target.value)}
              className="mt-input mt-2 w-full px-3 py-2 text-sm" />
          </label>
        </> : <>
          {/* 两个确认弹窗仅保留问题标题，省去标题下的解释文字。 */}
          <h2 id="node-edit-title" className="text-lg font-semibold text-[var(--mt-ink)]">
            {step === 'children' ? '是否重新生成子节点？' : '是否重新生成该节点笔记？'}
          </h2>
        </>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          {step === 'edit' ? <>
            <button type="button" disabled={saving} onClick={onClose} className="mt-soft-button px-4 py-2 text-sm">取消</button>
            <button type="submit" className="mt-primary-button px-4 py-2 text-sm">保存修改</button>
          </> : <>
            <button type="button" disabled={saving} onClick={() => {
              if (step === 'children') { setRegenerateChildren(false); setStep('note'); }
              else void chooseNote(false);
            }} className="mt-soft-button px-4 py-2 text-sm">否</button>
            <button type="button" disabled={saving} onClick={() => {
              if (step === 'children') { setRegenerateChildren(true); setStep('note'); }
              else void chooseNote(true);
            }} className="mt-primary-button px-4 py-2 text-sm">{saving ? '保存中...' : '是'}</button>
          </>}
        </div>
      </form>
    </div>
  );
}
