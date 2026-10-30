import type { DbKnowledgeNode, KnowledgeTree } from '../../types';
import { buildTreeStructure } from '../../utils/knowledgeTreeUtils';

interface PdfPage {
  image: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  pageWidth: number;
  pageHeight: number;
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '_') || 'knowledge-graph';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function savePdfPages(pages: PdfPage[], filename: string) {
  const encoder = new TextEncoder();
  const encode = (value: string) => encoder.encode(value);
  const join = (parts: Uint8Array[]) => {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    parts.forEach(part => { result.set(part, offset); offset += part.length; });
    return result;
  };
  const objects: Uint8Array[] = [
    encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
    encode(`2 0 obj\n<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`),
  ];
  pages.forEach((page, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const content = encode(`q\n${page.pageWidth} 0 0 ${page.pageHeight} 0 0 cm\n/Im${index} Do\nQ\n`);
    objects.push(encode(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.pageWidth} ${page.pageHeight}] /Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`));
    objects.push(join([encode(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.image.length} >>\nstream\n`), page.image, encode('\nendstream\nendobj\n')]));
    objects.push(join([encode(`${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n`), content, encode('endstream\nendobj\n')]));
  });
  const parts: Uint8Array[] = [encode('%PDF-1.4\n')];
  const offsets: number[] = [];
  let offset = parts[0].length;
  objects.forEach(object => { offsets.push(offset); parts.push(object); offset += object.length; });
  const xrefOffset = offset;
  parts.push(encode(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(value => `${String(value).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  downloadBlob(new Blob(parts, { type: 'application/pdf' }), filename);
}

export async function downloadTreePdf(tree: KnowledgeTree, nodes: DbKnowledgeNode[]) {
  const roots = buildTreeStructure(nodes);
  const entries: Array<{ node: (typeof roots)[number]; depth: number }> = [];
  const visit = (node: (typeof roots)[number], depth: number) => {
    entries.push({ node, depth });
    (node.children ?? []).forEach(child => visit(child, depth + 1));
  };
  roots.forEach(root => visit(root, 0));
  if (!entries.length) throw new Error('当前知识树没有可导出的节点');

  const pageWidth = 595;
  const pageHeight = 842;
  const scale = 3;
  const margin = 42;
  const contentTop = 104;
  const contentBottom = 790;
  const font = '"SimSun", "宋体", "Microsoft YaHei", sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('无法创建 PDF 页面');
  measure.font = `14px ${font}`;
  const rows = entries.map(({ node, depth }) => {
    const indent = Math.min(depth, 12) * 18;
    const maxWidth = pageWidth - margin * 2 - indent;
    const lines: string[] = [];
    let line = '';
    Array.from(node.title || '未命名节点').forEach(char => {
      if (line && measure.measureText(line + char).width > maxWidth) { lines.push(line); line = char; }
      else line += char;
    });
    if (line) lines.push(line);
    const metadata = [node.is_core ? '核心' : '', node.importance === 'high' ? '重要' : '', `难度：${node.difficulty || '未设置'}`, node.is_learned ? '已学习' : '未学习'].filter(Boolean).join('  ·  ');
    return { node, indent, lines, metadata, height: Math.max(38, lines.length * 18 + 18) };
  });
  const pageRows: typeof rows[] = [];
  let current: typeof rows = [];
  let used = 0;
  rows.forEach(row => {
    if (current.length && used + row.height > contentBottom - contentTop) { pageRows.push(current); current = []; used = 0; }
    current.push(row);
    used += row.height;
  });
  if (current.length) pageRows.push(current);

  const pdfPages = await Promise.all(pageRows.map(async (items, pageIndex): Promise<PdfPage> => {
    const canvas = document.createElement('canvas');
    canvas.width = pageWidth * scale;
    canvas.height = pageHeight * scale;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建 PDF 页面');
    context.scale(scale, scale);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, pageWidth, pageHeight);
    context.fillStyle = '#20304a';
    context.font = `bold 20px ${font}`;
    context.fillText(tree.root_topic || '知识树', margin, 46, pageWidth - margin * 2);
    context.fillStyle = '#718097';
    context.font = `10px ${font}`;
    context.fillText(`共 ${entries.length} 个节点 · 树状列表`, margin, 70);
    context.textAlign = 'right';
    context.fillText(`${pageIndex + 1} / ${pageRows.length}`, pageWidth - margin, 70);
    context.textAlign = 'left';
    let y = contentTop;
    items.forEach((row, rowIndex) => {
      context.fillStyle = row.node.is_learned ? '#ecfdf5' : rowIndex % 2 ? '#f8faff' : '#fff';
      context.fillRect(margin, y, pageWidth - margin * 2, row.height);
      context.fillStyle = row.node.is_learned ? '#059669' : row.node.is_core ? '#ea580c' : '#20304a';
      context.font = `14px ${font}`;
      row.lines.forEach((text, lineIndex) => context.fillText(text, margin + row.indent, y + 17 + lineIndex * 18, pageWidth - margin * 2 - row.indent));
      context.fillStyle = '#718097';
      context.font = `9px ${font}`;
      context.fillText(row.metadata, margin + row.indent, y + row.height - 4, pageWidth - margin * 2 - row.indent);
      y += row.height;
    });
    context.fillStyle = '#94a3b8';
    context.font = `9px ${font}`;
    context.fillText(`MindGraph Tutor · ${safeFilename(tree.root_topic)}`, margin, pageHeight - 22);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PDF 页面生成失败')), 'image/jpeg', 0.94));
    const image = new Uint8Array(await blob.arrayBuffer());
    const result = { image, pixelWidth: canvas.width, pixelHeight: canvas.height, pageWidth, pageHeight };
    canvas.width = 0;
    canvas.height = 0;
    return result;
  }));
  await savePdfPages(pdfPages, `${safeFilename(tree.root_topic)}-树状视图.pdf`);
}

export function downloadMindmapSvg(tree: KnowledgeTree, nodes: DbKnowledgeNode[]) {
  const roots = buildTreeStructure(nodes);
  if (!roots.length) throw new Error('当前知识树没有可导出的节点');
  const nodeWidth = 280;
  const horizontalGap = 160;
  const verticalGap = 42;
  const marginX = 56;
  const marginY = 84;
  type Layout = { node: (typeof roots)[number]; depth: number; x: number; y: number; height: number; lines: string[] };
  const layouts: Layout[] = [];
  const wrap = (value: string) => {
    const chars = Array.from(value || '未命名节点');
    const lines: string[] = [];
    while (chars.length && lines.length < 3) lines.push(chars.splice(0, 13).join(''));
    if (chars.length && lines.length) lines[lines.length - 1] += '…';
    return lines;
  };
  const nodeHeight = (lines: string[]) => 58 + lines.length * 22;
  const subtreeHeight = (node: (typeof roots)[number]): number => {
    const children = node.children ?? [];
    if (!children.length) return nodeHeight(wrap(node.title));
    return Math.max(nodeHeight(wrap(node.title)), children.reduce((sum, child) => sum + subtreeHeight(child), 0) + verticalGap * (children.length - 1));
  };
  const place = (node: (typeof roots)[number], depth: number, top: number) => {
    const lines = wrap(node.title);
    const height = nodeHeight(lines);
    const children = node.children ?? [];
    if (!children.length) {
      layouts.push({ node, depth, x: marginX + depth * (nodeWidth + horizontalGap), y: top, height, lines });
      return;
    }
    const groupHeight = children.reduce((sum, child) => sum + subtreeHeight(child), 0) + verticalGap * (children.length - 1);
    let childTop = top + (Math.max(height, groupHeight) - groupHeight) / 2;
    children.forEach(child => { place(child, depth + 1, childTop); childTop += subtreeHeight(child) + verticalGap; });
    const descendants = layouts.filter(item => children.some(child => child.id === item.node.id));
    const first = descendants[0];
    const last = descendants[descendants.length - 1];
    const center = ((first.y + first.height / 2) + (last.y + last.height / 2)) / 2;
    layouts.push({ node, depth, x: marginX + depth * (nodeWidth + horizontalGap), y: center - height / 2, height, lines });
  };
  let nextY = marginY;
  roots.forEach(root => { place(root, 0, nextY); nextY += subtreeHeight(root) + verticalGap; });
  const width = Math.max(900, ...layouts.map(item => item.x + nodeWidth + marginX));
  const height = Math.max(500, nextY + marginY);
  const byId = new Map(layouts.map(item => [item.node.id, item]));
  const escapeXml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!));
  const connectors = layouts.flatMap(parent => (parent.node.children ?? []).map(child => {
    const target = byId.get(child.id);
    if (!target) return '';
    const x1 = parent.x + nodeWidth;
    const y1 = parent.y + parent.height / 2;
    const x2 = target.x;
    const y2 = target.y + target.height / 2;
    const control = (x1 + x2) / 2;
    return `<path d="M ${x1} ${y1} C ${control} ${y1}, ${control} ${y2}, ${x2} ${y2}" fill="none" stroke="#7895c5" stroke-width="3"/>`;
  })).join('');
  const cards = layouts.map(item => {
    const node = item.node;
    const titleY = item.y + 30 - (item.lines.length - 1) * 9;
    const title = item.lines.map((line, index) => `<tspan x="${item.x + nodeWidth / 2}" dy="${index ? 22 : 0}">${escapeXml(line)}</tspan>`).join('');
    const metadata = [node.is_core ? '核心' : '', node.importance === 'high' ? '重要' : '', `难度：${node.difficulty || '未设置'}`, node.is_learned ? '已学习' : '未学习'].filter(Boolean).join(' · ');
    return `<g><rect x="${item.x}" y="${item.y}" width="${nodeWidth}" height="${item.height}" rx="14" fill="${node.is_learned ? '#ecfdf5' : '#fff'}" stroke="${node.is_learned ? '#10b981' : node.is_core ? '#ea580c' : '#7895c5'}" stroke-width="3"/><text x="${item.x + nodeWidth / 2}" y="${titleY}" text-anchor="middle" font-family="Microsoft YaHei, SimSun, sans-serif" font-size="18" font-weight="600" fill="#20304a">${title}</text><text x="${item.x + nodeWidth / 2}" y="${item.y + item.height - 16}" text-anchor="middle" font-family="Microsoft YaHei, SimSun, sans-serif" font-size="12" fill="#718097">${escapeXml(metadata)}</text></g>`;
  }).join('');
  const title = escapeXml(tree.root_topic || '知识图谱');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}px" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="${marginX}" y="42" font-family="Microsoft YaHei, SimSun, sans-serif" font-size="28" font-weight="700" fill="#20304a">${title}</text>${connectors}${cards}</svg>`;
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${safeFilename(tree.root_topic)}-思维导图.svg`);
}
