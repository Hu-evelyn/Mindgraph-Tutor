const { OutputValidationError } = require('./structuredOutput');

function validateNote(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 16000) throw new OutputValidationError('笔记内容为空或过长');
  const text = raw.replace(/\r\n/g, '\n').trim();
  const lines = text.split('\n');
  const headings = [];
  let numbers = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*#/.test(lines[i])) continue;
    const match = /^(#{2,4}) (\d+(?:\.\d+)*) (\S.*)$/.exec(lines[i]);
    if (!match) throw new OutputValidationError('标题必须使用 ##、### 或 #### 和连续层级编号');
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
module.exports = { validateNote };
