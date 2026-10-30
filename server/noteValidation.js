const { OutputValidationError } = require('./structuredOutput');

// 代码与公式中的 # 不是标题，规范化和校验均跳过这些区域。
function protectedLines(lines) {
  let fence = null, math = false;
  return lines.map(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker && !math) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return true;
    }
    if (fence) return true;
    if (/^\s*\$\$/.test(line)) {
      if (!/^\s*\$\$.*\$\$\s*$/.test(line)) math = !math;
      return true;
    }
    return math;
  });
}

function normalizeNote(text) {
  text = text.replace(/\r\n/g, '\n').trim();
  const wrapper = text.match(/^(\x60{3,}|~{3,})(?:markdown|md)?[ \t]*\n([\s\S]*?)\n\1[ \t]*$/i);
  if (wrapper) text = wrapper[2].trim();
  const lines = text.split('\n'), protectedMask = protectedLines(lines);
  const output = [];
  let numbers = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (protectedMask[i]) { output.push(line); continue; }
    const markdown = line.match(/^\s{0,3}(#{1,6})\s*(.+?)\s*$/);
    let candidate = markdown ? markdown[2] : line.trim();
    candidate = candidate.replace(/\s+#+$/, '').replace(/^\*\*(.*?)\*\*$/, '$1').trim();
    const numbered = candidate.match(/^(\d+(?:\.\d+){0,2})(?:[.、．：:]?\s+|[、．：:])(.+)$/);
    const title = (numbered ? numbered[2] : candidate).replace(/^\*\*(.*?)\*\*$/, '$1').trim();
    const standard = /^(核心定义|关键内容|示例|小结)$/.test(title);
    const boldHeading = /^\s*\*\*.+\*\*\s*$/.test(line) && numbered;
    if (!markdown && !boldHeading && !standard) { output.push(line); continue; }
    let depth;
    if (standard) depth = 1;
    else if (numbered) depth = numbered[1].split('.').length;
    else if (markdown) depth = Math.max(1, Math.min(3, markdown[1].length - 1));
    else { output.push(line); continue; }
    if (depth > numbers.length + 1) depth = numbers.length + 1;
    if (depth > 1 && !numbers[depth - 2]) { output.push(line); continue; }
    numbers = numbers.slice(0, depth);
    numbers[depth - 1] = (numbers[depth - 1] || 0) + 1;
    if (output.length && output.at(-1).trim()) output.push('');
    output.push('#'.repeat(depth + 1) + ' ' + numbers.join('.') + ' ' + title);
    if (i + 1 < lines.length && lines[i + 1].trim()) output.push('');
  }
  return output.join('\n').trim();
}

function validateNote(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 16000) throw new OutputValidationError('笔记内容为空或过长');
  const text = normalizeNote(raw);
  const lines = text.split('\n');
  const protectedMask = protectedLines(lines);
  const headings = [];
  let numbers = [];
  for (let i = 0; i < lines.length; i++) {
    if (protectedMask[i] || !/^\s*#/.test(lines[i])) continue;
    const match = /^(#{2,4}) (\d+(?:\.\d+)*) (\S.*)$/.exec(lines[i]);
    if (!match) throw new OutputValidationError('笔记标题无法识别（第 ' + (i + 1) + ' 行）：' + lines[i].slice(0, 100));
    const parts = match[2].split('.').map(Number);
    const depth = match[1].length - 1;
    if (parts.length !== depth || parts[depth - 1] !== (numbers[depth - 1] || 0) + 1 || parts.slice(0,-1).some((n,j) => n !== numbers[j])) throw new OutputValidationError('标题编号跳号或不属于父级');
    numbers = parts;
    if ((i > 0 && lines[i-1].trim()) || (i+1 < lines.length && lines[i+1].trim())) throw new OutputValidationError('标题与正文之间必须空一行');
    headings.push({ depth, title: match[3], index: i });
  }
  const sections = headings.filter(h => h.depth === 1);
  if (sections[0]?.title !== '核心定义' || sections[1]?.title !== '关键内容' || sections.at(-1)?.title !== '小结') throw new OutputValidationError('必须按顺序包含核心定义、关键内容和小结');
  if (!headings.some(h => h.depth === 2)) throw new OutputValidationError('关键内容需要分层要点');
  for (let i=0; i<headings.length; i++) {
    const h=headings[i]; const next=headings[i+1];
    if (next && next.depth > h.depth) continue;
    if (!lines.slice(h.index+1,next?.index).some(l => l.trim())) throw new OutputValidationError('标题下缺少正文');
  }
  if (/^\s*\x60{3}(?:markdown|md)?\s*\n/.test(text)) throw new OutputValidationError('笔记不能包裹外层代码围栏');
  return text;
}
module.exports = { validateNote, normalizeNote };
