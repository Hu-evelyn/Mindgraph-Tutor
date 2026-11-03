import type { DbKnowledgeNode, KnowledgeTree } from '../../types';
import { buildTreeStructure, hasKnowledgeNodeStar } from '../../utils/knowledgeTreeUtils';

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
    // 与界面一样，仅显示名称、重点星标和学习状态；为右侧状态徽标留出空间。
    const maxWidth = pageWidth - margin * 2 - indent - 92;
    const lines: string[] = [];
    let line = '';
    Array.from(`${node.title || '未命名节点'}${hasKnowledgeNodeStar(node) ? ' ⭐' : ''}`).forEach(char => {
      if (line && measure.measureText(line + char).width > maxWidth) { lines.push(line); line = char; }
      else line += char;
    });
    if (line) lines.push(line);
    return { node, depth, indent, lines, height: Math.max(38, lines.length * 18 + 14) };
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
    context.fillText('树状视图', margin, 70);
    context.textAlign = 'right';
    context.fillText(`${pageIndex + 1} / ${pageRows.length}`, pageWidth - margin, 70);
    context.textAlign = 'left';
    let y = contentTop;
    items.forEach((row, rowIndex) => {
      // 已学习不再把整行或标题染绿；PDF 与界面一样只保留绿色状态小标。
      context.fillStyle = rowIndex % 2 ? '#f8faff' : '#fff';
      context.fillRect(margin, y, pageWidth - margin * 2, row.height);
      // 导出树状视图沿用屏幕上的虚线层级和右侧状态徽标。
      context.save();
      context.setLineDash([3, 3]);
      context.strokeStyle = '#cbd5e1';
      for (let depth = 1; depth <= Math.min(row.depth, 12); depth += 1) {
        const x = margin + depth * 18 - 9;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + row.height);
        context.stroke();
      }
      context.restore();
      context.fillStyle = '#20304a';
      context.font = `${row.depth === 0 ? 'bold ' : ''}14px ${font}`;
      row.lines.forEach((text, lineIndex) => context.fillText(text, margin + row.indent, y + 17 + lineIndex * 18, pageWidth - margin * 2 - row.indent));
      context.fillStyle = row.node.is_learned ? '#d1fae5' : '#f1f5f9';
      context.beginPath();
      context.roundRect(pageWidth - margin - 75, y + (row.height - 22) / 2, 75, 22, 11);
      context.fill();
      context.fillStyle = row.node.is_learned ? '#047857' : '#475569';
      context.font = `10px ${font}`;
      context.textAlign = 'center';
      context.fillText(row.node.is_learned ? '✓ 已学习' : '○ 未学习', pageWidth - margin - 37.5, y + row.height / 2 + 3);
      context.textAlign = 'left';
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
  // 导出完整节点结构，并复用当前导图的节点尺寸、间距和文字换行规则。
  const nodeWidth = 230;
  const horizontalGap = 145;
  const verticalGap = 28;
  const marginX = 50;
  const marginY = 50;
  type Layout = { node: (typeof roots)[number]; depth: number; x: number; y: number; height: number; lines: string[] };
  const layouts: Layout[] = [];
  const wrap = (value: string) => {
    const chars = Array.from(value || '未命名节点');
    const lines: string[] = [];
    while (chars.length) lines.push(chars.splice(0, 11).join(''));
    return lines;
  };
  const nodeHeight = (lines: string[]) => Math.max(72, 46 + lines.length * 18);
  const subtreeHeight = (node: (typeof roots)[number]): number => {
    const children = node.children ?? [];
    if (!children.length) return nodeHeight(wrap(node.title));
    return Math.max(nodeHeight(wrap(node.title)), children.reduce((sum, child) => sum + subtreeHeight(child), 0) + verticalGap * (children.length - 1));
  };
  const place = (node: (typeof roots)[number], depth: number, top: number) => {
    const lines = wrap(node.title);
    const height = nodeHeight(lines);
    const children = node.children ?? [];
    const groupHeight = children.length
      ? children.reduce((sum, child) => sum + subtreeHeight(child), 0) + verticalGap * (children.length - 1)
      : 0;
    const y = top + Math.max(0, (groupHeight - height) / 2);
    layouts.push({ node, depth, x: marginX + depth * (nodeWidth + horizontalGap), y, height, lines });
    let childTop = top + Math.max(0, (height - groupHeight) / 2);
    children.forEach(child => { place(child, depth + 1, childTop); childTop += subtreeHeight(child) + verticalGap; });
  };
  let nextY = marginY;
  roots.forEach(root => { place(root, 0, nextY); nextY += subtreeHeight(root) + verticalGap; });
  const width = Math.max(900, ...layouts.map(item => item.x + nodeWidth + marginX));
  const height = Math.max(500, ...layouts.map(item => item.y + item.height + marginY));
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
    const relation = child.relation_type || 'PART_OF';
    const dash = relation === 'RELATED' ? ' stroke-dasharray="5 5"' : '';
    const arrow = relation === 'LEADS_TO' || relation === 'PREREQUISITE' ? ' marker-end="url(#arrow)"' : '';
    return `<path d="M ${x1} ${y1} C ${control} ${y1}, ${control} ${y2}, ${x2} ${y2}" fill="none" stroke="#3b82f6" stroke-width="2"${dash}${arrow}/>`;
  })).join('');
  const cards = layouts.map(item => {
    const node = item.node;
    const hasStar = hasKnowledgeNodeStar(node);
    const title = item.lines.map((line, index) => `<tspan x="${nodeWidth / 2}" dy="${index ? 18 : 0}">${escapeXml(line)}</tspan>`).join('');
    const status = node.is_learned ? '已学习' : '未学习';
    const fill = hasStar ? '#fff8e6' : '#f0f4f8';
    const borderWidth = node.importance === 'high' ? 3 : node.importance === 'medium' ? 2 : 1;
    const badgeFill = node.is_learned ? '#059669' : '#fff7ed';
    const badgeStroke = node.is_learned ? '#059669' : '#f59e0b';
    // 导出与界面一致：未学习只画一个圆，不再叠加圆形字符。
    const badgeText = node.is_learned ? '✓' : '';
    const badgeX = nodeWidth / 2 - 19;
    const statusY = item.height - 13;
    const star = hasStar
      ? `<text x="${nodeWidth - 18}" y="${item.height / 2 + 5}" text-anchor="middle" font-family="Microsoft YaHei, SimSun, sans-serif" font-size="16">⭐</text>`
      : '';
    const relationDot = node.relation_type && node.relation_type !== 'PART_OF'
      ? '<circle cx="10" cy="10" r="4" fill="#3b82f6"/>' : '';
    // 与屏幕导图同步：稍小的圆标、更大的状态文字及更宽松的标题间距。
    return `<g transform="translate(${item.x} ${item.y})"><rect width="${nodeWidth}" height="${item.height}" rx="8" fill="${fill}" stroke="#3b82f6" stroke-width="${borderWidth}"/>${relationDot}<text x="${nodeWidth / 2}" y="${item.height - 40 - (item.lines.length - 1) * 18}" text-anchor="middle" font-family="Microsoft YaHei, SimSun, sans-serif" font-size="15" font-weight="600" fill="#24334f">${title}</text>${star}<circle cx="${badgeX}" cy="${item.height - 17}" r="5.5" fill="${badgeFill}" stroke="${badgeStroke}" stroke-width="1.5"/><text x="${badgeX}" y="${statusY}" text-anchor="middle" font-family="Microsoft YaHei, SimSun, sans-serif" font-size="9" fill="${node.is_learned ? '#fff' : '#b45309'}">${badgeText}</text><text x="${nodeWidth / 2 - 8}" y="${statusY}" text-anchor="start" font-family="Microsoft YaHei, SimSun, sans-serif" font-size="13" fill="${node.is_learned ? '#047857' : '#64748b'}">${status}</text></g>`;
  }).join('');
  const title = escapeXml(tree.root_topic || '知识图谱');
  // 导出画布统一为纯白，避免 SVG 边界内外出现浅蓝与白色的分界。
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}px" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L0 6 L9 3 Z" fill="#3b82f6"/></marker></defs><rect width="100%" height="100%" fill="#fff"/><text x="${marginX}" y="34" font-family="Microsoft YaHei, SimSun, sans-serif" font-size="20" font-weight="700" fill="#20304a">${title}</text>${connectors}${cards}</svg>`;
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${safeFilename(tree.root_topic)}-思维导图.svg`);
}
