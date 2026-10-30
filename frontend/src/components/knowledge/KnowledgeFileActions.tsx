import { useRef, useState } from 'react';
import { useKnowledgeStore } from '../../stores/useKnowledgeStore';
import { knowledgeApi } from '../../services/api';
import type { DbKnowledgeNode, KnowledgeTree } from '../../types';
import { buildTreeStructure } from '../../utils/knowledgeTreeUtils';

interface KnowledgeFileActionsProps {
  tree?: KnowledgeTree;
  nodes: DbKnowledgeNode[];
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

function openGraphPdf(tree: KnowledgeTree, nodes: DbKnowledgeNode[], mode: 'tree' | 'mindmap') {
  const roots = buildTreeStructure(nodes);
  const boxW = 220;
  const boxH = 64;
  const gapX = 100;
  const gapY = 26;
  const positioned: Array<{ node: (typeof roots)[number]; x: number; y: number; depth: number }> = [];
  let nextLeafY = 40;

  const place = (node: (typeof roots)[number], depth: number): number => {
    const children = node.children ?? [];
    const startY = nextLeafY;
    if (children.length) {
      children.forEach(child => place(child, depth + 1));
      const childPositions = positioned.filter(item => item.depth === depth + 1 && children.some(c => c.id === item.node.id));
      const first = childPositions[0];
      const last = childPositions[childPositions.length - 1];
      const y = first && last ? (first.y + last.y) / 2 : startY;
      positioned.push({ node, x: 40 + depth * (boxW + gapX), y, depth });
      return y;
    }
    const y = nextLeafY;
    nextLeafY += boxH + gapY;
    positioned.push({ node, x: 40 + depth * (boxW + gapX), y, depth });
    return y;
  };
  roots.forEach(root => place(root, 0));

  // Top-down tree uses leaf order for vertical placement; mind map centers the root against its branches.
  if (mode === 'tree') {
    const byId = new Map(positioned.map(item => [item.node.id, item]));
    const leaves = positioned.filter(item => !(item.node.children?.length));
    const leafX = new Map<number, number>();
    leaves.forEach((leaf, index) => leafX.set(leaf.node.id, 40 + index * (boxW + gapX)));
    const updateTopDown = (node: (typeof roots)[number], depth: number): number => {
      const children = node.children ?? [];
      const xs = children.map(child => updateTopDown(child, depth + 1));
      const x = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : leafX.get(node.id) ?? 40;
      const item = byId.get(node.id);
      if (item) { item.x = x; item.y = 40 + depth * (boxH + gapY); }
      return x;
    };
    roots.forEach(root => updateTopDown(root, 0));
  }

  const maxX = Math.max(1000, ...positioned.map(item => item.x + boxW + 40));
  const maxY = Math.max(500, ...positioned.map(item => item.y + boxH + 40));
  const byId = new Map(positioned.map(item => [item.node.id, item]));
  const esc = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!));
  const lines = (label: string) => {
    const chars = Array.from(label);
    const chunks: string[] = [];
    while (chars.length) chunks.push(chars.splice(0, 16).join(''));
    return chunks.slice(0, 3);
  };
  const edges = positioned.flatMap(item => (item.node.children ?? []).map(child => {
    const target = byId.get(child.id);
    if (!target) return '';
    if (mode === 'tree') {
      const x1 = item.x + boxW / 2;
      const y1 = item.y + boxH;
      const x2 = target.x + boxW / 2;
      const y2 = target.y;
      return `<path d="M ${x1} ${y1} C ${x1} ${y1 + 35}, ${x2} ${y2 - 35}, ${x2} ${y2}" fill="none" stroke="#7895c5" stroke-width="2"/>`;
    }
    const x1 = item.x + boxW;
    const y1 = item.y + boxH / 2;
    const x2 = target.x;
    const y2 = target.y + boxH / 2;
    return `<path d="M ${x1} ${y1} C ${x1 + 35} ${y1}, ${x2 - 35} ${y2}, ${x2} ${y2}" fill="none" stroke="#7895c5" stroke-width="2"/>`;
  })).join('');
  const boxes = positioned.map(({ node, x, y }) => {
    const labelLines = lines(node.title || '未命名节点');
    const status = node.is_learned ? '已学习' : '未学习';
    return `<g><rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="12" fill="${node.is_learned ? '#ecfdf5' : '#fff'}" stroke="${node.is_learned ? '#10b981' : '#5578b8'}" stroke-width="2"/><text x="${x + boxW / 2}" y="${y + 25 - (labelLines.length - 1) * 8}" text-anchor="middle" font-size="15" font-weight="600" fill="#20304a">${labelLines.map((line, index) => `<tspan x="${x + boxW / 2}" dy="${index === 0 ? 0 : 18}">${esc(line)}</tspan>`).join('')}</text><text x="${x + boxW / 2}" y="${y + 54}" text-anchor="middle" font-size="11" fill="#718097">${status}</text></g>`;
  }).join('');
  const title = esc(tree.root_topic || '知识图谱');
  const diagram = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxX} ${maxY}" role="img"><text x="40" y="28" font-size="22" font-weight="700" fill="#20304a">${title}</text>${edges}${boxes}</svg>`;
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.alert('浏览器阻止了新窗口。请允许本站弹出窗口后重试 PDF 导出。');
    return;
  }
  printWindow.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title} - ${mode === 'tree' ? '树状图' : '思维导图'}</title><style>@page{size:landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,"Microsoft YaHei",sans-serif}svg{display:block;width:100%;height:auto;max-height:180mm;page-break-inside:avoid}@media screen{body{padding:24px;background:#f3f6fc}svg{background:white;border:1px solid #dce5f3;box-shadow:0 4px 20px #20304a18}}</style></head><body>${diagram}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300))</script></body></html>`);
  printWindow.document.close();
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

export function KnowledgeFileActions({ tree, nodes }: KnowledgeFileActionsProps) {
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
    <div className="flex flex-wrap items-center gap-2">
      <input ref={inputRef} type="file" accept=".json,.pdf,.txt,.md" className="sr-only"
        aria-label="选择要导入的文件" onChange={event => void handleImport(event.target.files?.[0])} />
      <button type="button" className="mt-soft-button h-10 px-3 text-sm"
        disabled={isImporting} onClick={() => inputRef.current?.click()}>
        {isImporting ? '导入中…' : '导入文件'}
      </button>
      {tree && <div className="relative">
        <button type="button" className="mt-soft-button h-10 px-3 text-sm"
          onClick={() => setExportMenuOpen(open => !open)} disabled={!nodes.length} aria-expanded={exportMenuOpen}>导出图谱 ▾</button>
        {exportMenuOpen && <div className="mt-surface absolute right-0 top-full z-50 mt-2 flex min-w-48 flex-col gap-1 p-2 shadow-xl">
          <button type="button" className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            onClick={() => { setExportMenuOpen(false); openGraphPdf(tree, nodes, 'tree'); }}>导出树状图 PDF</button>
          <button type="button" className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            onClick={() => { setExportMenuOpen(false); openGraphPdf(tree, nodes, 'mindmap'); }}>导出思维导图 PDF</button>
          <button type="button" className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            onClick={() => { setExportMenuOpen(false); downloadGraph(tree, nodes); }}>导出 JSON 备份</button>
        </div>}
      </div>}
      {message && <span role="status" className="mt-muted max-w-56 text-xs">{message}</span>}
    </div>
  );
}
