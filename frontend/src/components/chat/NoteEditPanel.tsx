import { useState } from 'react';

interface NoteEditPanelProps {
  content: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
}

// 笔记只在右侧知识点详情中编辑，保存区与原笔记卡片保持相同的位置和圆角。
export function NoteEditPanel({ content, onSave, onCancel }: NoteEditPanelProps) {
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (draft === content) { onCancel(); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
      onCancel();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存笔记失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={event => void submit(event)} className="mt-detail-card h-full flex flex-col min-h-0 overflow-hidden">
      <label htmlFor="note-edit-input" className="px-5 pt-4 pb-2 text-sm font-medium text-[var(--mt-ink)]">
        编辑笔记（支持 Markdown 和 LaTeX）
      </label>
      <textarea id="note-edit-input" autoFocus value={draft} maxLength={50000}
        onChange={event => setDraft(event.target.value)}
        className="mt-input flex-1 min-h-0 mx-5 mb-3 px-3 py-2 text-sm resize-none" />
      <p className="mt-muted px-5 pb-2 text-xs">保存后，手工笔记不会被自动生成覆盖。</p>
      {error && <p role="alert" className="px-5 pb-2 text-xs text-red-600">{error}</p>}
      <div className="border-t border-[var(--mt-border)] px-5 py-2 flex justify-end gap-2">
        <button type="button" disabled={saving} onClick={onCancel} className="mt-soft-button px-3 py-1.5 text-sm">取消</button>
        <button type="submit" disabled={saving} className="mt-primary-button px-3 py-1.5 text-sm">
          {saving ? '保存中...' : '保存笔记'}
        </button>
      </div>
    </form>
  );
}
