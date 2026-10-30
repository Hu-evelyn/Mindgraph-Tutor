import { useRef, useState } from 'react';
import { useKnowledgeStore } from '../../stores/useKnowledgeStore';
import { knowledgeApi } from '../../services/api';
import type { DbKnowledgeNode, KnowledgeTree } from '../../types';
import { downloadMindmapSvg, downloadTreePdf } from './knowledgeGraphExport';

interface KnowledgeFileActionsProps {
  tree?: KnowledgeTree;
  nodes: DbKnowledgeNode[];
  // 首页仍显示导入；工作台可分别把导入和导出放在对应面板。
  mode?: 'both' | 'import' | 'export';
}

function downloadGraph(tree: KnowledgeTree, nodes: DbKnowledgeNode[]) {
  const graph = {
    format: 'mindgraph-tutor-graph',
    version: 1,
    title: tree.root_topic,
    exportedAt: new Date().toISOString(),
    nodes: nodes.map(node => ({
      id: node.id,
      parentId: node.parent_id,
      label: node.label,
      content: node.content || '',
      is_learned: Boolean(node.is_learned),
      relation_type: node.relation_type || 'PART_OF',
      importance: node.importance || 'medium',
      difficulty: node.difficulty || 'medium',
      estimated_time: node.estimated_time || '30分钟',
      is_boundary: Boolean(node.is_boundary),
      is_core: Boolean(node.is_core),
    })),
  };
  const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${tree.root_topic.replace(/[\\/:*?"<>|]/g, '_') || 'knowledge-graph'}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

export function KnowledgeFileActions({ tree, nodes, mode = 'both' }: KnowledgeFileActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const { loadUserTrees, setCurrentTree } = useKnowledgeStore();

  const handleImport = async (file?: File) => {
    if (!file) return;
    setIsImporting(true);
    setMessage('');
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('文件不能超过 15 MB');
      let result: { treeId: number };
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'json') {
        const graph = JSON.parse(await file.text());
        result = await knowledgeApi.importTree(graph);
      } else if (['pdf', 'txt', 'md'].includes(extension || '')) {
        if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB');
        result = extension === 'pdf'
          ? await knowledgeApi.importDocument({ fileName: file.name, pdfBase64: await fileToBase64(file) })
          : await knowledgeApi.importDocument({ fileName: file.name, content: await file.text() });
      } else {
        throw new Error('支持导入本应用导出的 JSON 图谱，以及 PDF、TXT、Markdown 学习资料');
      }
      await loadUserTrees();
      setCurrentTree(result.treeId);
      setMessage('导入完成，已切换到新知识树');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导入失败，请检查文件后重试');
    } finally {
      setIsImporting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={mode === 'import' ? 'relative shrink-0' : 'flex flex-wrap items-center gap-2'}>
      {/* 导入入口与提问输入框同排，首页仍沿用原有导入按钮。 */}
      {mode !== 'export' && <>
        <input ref={inputRef} type="file" accept=".json,.pdf,.txt,.md" className="sr-only"
          aria-label="选择要导入的文件" onChange={event => void handleImport(event.target.files?.[0])} />
        <button type="button" className={`mt-soft-button px-3 text-sm whitespace-nowrap ${mode === 'import' ? 'h-[42px]' : 'h-10'}`}
          disabled={isImporting} onClick={() => inputRef.current?.click()}>
          {isImporting ? '导入中…' : '导入文件'}
        </button>
      </>}
      {mode !== 'import' && tree && <div className="relative">
        <button type="button" className="mt-soft-button h-10 px-3 text-sm"
          onClick={() => setExportMenuOpen(open => !open)} disabled={!nodes.length} aria-expanded={exportMenuOpen}>导出图谱 ▾</button>
        {exportMenuOpen && <div className="mt-surface absolute right-0 top-full z-50 mt-2 flex min-w-48 flex-col gap-1 p-2 shadow-xl">
          <button type="button" className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            onClick={() => { setExportMenuOpen(false); void downloadTreePdf(tree, nodes).catch(error => window.alert(error instanceof Error ? error.message : 'PDF export failed')); }}>导出树状视图 PDF</button>
          <button type="button" className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            onClick={() => {
              setExportMenuOpen(false);
              try { downloadMindmapSvg(tree, nodes); }
              catch (error) { window.alert(error instanceof Error ? error.message : 'SVG export failed'); }
            }}>导出思维导图 SVG</button>
          <button type="button" className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            onClick={() => { setExportMenuOpen(false); downloadGraph(tree, nodes); }}>导出 JSON 备份</button>
        </div>}
      </div>}
      {/* 对话输入行中的提示悬浮显示，避免导入反馈把输入框或发送按钮挤走。 */}
      {message && <span role="status" className={mode === 'import'
        ? 'mt-surface absolute bottom-full left-0 z-20 mb-2 w-56 max-w-[70vw] p-2 text-xs text-[var(--mt-ink)] shadow-lg'
        : 'mt-muted max-w-56 text-xs'}>{message}</span>}
    </div>
  );
}
