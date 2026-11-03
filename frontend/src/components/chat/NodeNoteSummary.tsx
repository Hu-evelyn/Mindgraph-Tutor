import { useEffect, useRef, useState } from 'react';
import { knowledgeApi } from '../../services/api';

interface NodeNoteSummaryProps {
  treeId: number;
  nodeId: number;
  label: string;
  content: string;
  noteLoading: boolean;
}

// 摘要跟随当前笔记版本；切换节点、改名或修改笔记后重新请求，旧请求不会覆盖新节点。
export function NodeNoteSummary({ treeId, nodeId, label, content, noteLoading }: NodeNoteSummaryProps) {
  const cache = useRef(new Map<string, { label: string; content: string; summary: string }>());
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const cacheKey = `${treeId}:${nodeId}`;
    if (noteLoading || !content.trim()) {
      setSummary('');
      setError('');
      setLoading(false);
      return;
    }
    const saved = cache.current.get(cacheKey);
    if (saved?.content === content && saved.label === label) {
      setSummary(saved.summary);
      setError('');
      setLoading(false);
      return;
    }

    let active = true;
    setSummary('');
    setError('');
    setLoading(true);
    void knowledgeApi.summarizeNote(treeId, nodeId)
      .then(result => {
        if (!active) return;
        cache.current.set(cacheKey, { label, content, summary: result.summary });
        setSummary(result.summary);
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : '摘要生成失败');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [treeId, nodeId, label, content, noteLoading, retry]);

  if (!content.trim() && !noteLoading) return null;

  return (
    <div className="mt-2 text-xs">
      <p className="mt-muted">笔记摘要{content.trim() ? ` · ${content.length} 字符` : ''}</p>
      {noteLoading ? (
        <p role="status" className="mt-muted mt-1">笔记生成后将显示摘要…</p>
      ) : loading ? (
        <p role="status" className="mt-muted mt-1">正在概括笔记…</p>
      ) : error ? (
        <p role="alert" className="mt-1 text-red-600">
          {error}
          <button type="button" onClick={() => setRetry(value => value + 1)}
            className="ml-2 underline underline-offset-2">重试</button>
        </p>
      ) : (
        <p className="mt-1 line-clamp-2 text-sm leading-snug text-[var(--mt-ink)]" title={summary}>{summary}</p>
      )}
    </div>
  );
}
