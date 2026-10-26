const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const MATERIALS = path.join(__dirname, 'materials');
const INDEX = path.join(__dirname, '.rag', 'index.json');
const FORMAT = 1;
let cachedIndex;
function normalize(text) {
  return text.normalize('NFKC').replace(/[\uE000-\uF8FF]/g, ' ')
    .replace(/(?<=[\p{Script=Han}]) +(?=[\p{Script=Han}])/gu, '')
    .replace(/[ \t]+/g, ' ').trim();
}
function terms(text) {
  const normalized = normalize(text).toLowerCase();
  const result = normalized.match(/[a-z][a-z0-9-]*/g) || [];
  for (const run of normalized.match(/[\p{Script=Han}]+/gu) || []) {
    for (let i = 0; i < run.length - 1; i++) result.push(run.slice(i, i + 2));
  }
  return result;
}
const QUERY_EQUIVALENTS = [
    ['词嵌入', '词向量', 'word embedding'], ['独热', 'one-hot'],
    ['自注意力', 'self-attention'], ['多头注意力', 'multi-head attention'],
    ['上下文学习', 'in-context learning'], ['指令微调', 'instruction tuning'],
    ['分词', '词元化', 'tokenization'], ['词表', 'vocabulary'], ['位置编码', 'positional encoding'],
];
function expandQuery(text) {
  return text + ' ' + QUERY_EQUIVALENTS.filter(g => g.some(s => text.toLowerCase().includes(s))).flat().join(' ');
}
async function manifest() {
  const names = (await fs.readdir(MATERIALS)).filter(name => /\.pdf$/i.test(name)).sort();
  return Promise.all(names.map(async file => {
    const stat = await fs.stat(path.join(MATERIALS, file));
    return { file, size: stat.size, modified: stat.mtimeMs };
  }));
}
async function buildIndex() {
  const files = await manifest();
  if (!files.length) throw new Error('materials 中没有 PDF 资料');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const chunks = [], documents = [];
  for (const entry of files) {
    const task = getDocument({ data: new Uint8Array(await fs.readFile(path.join(MATERIALS, entry.file))), useSystemFonts: true });
    let pagesWithText = 0;
    try {
      const pdf = await task.promise;
      for (let page = 1; page <= pdf.numPages; page++) {
        const data = await (await pdf.getPage(page)).getTextContent();
        let previousY;
        const text = normalize(data.items.map(item => {
          if (!item.str) return '';
          const y = item.transform?.[5];
          const prefix = previousY !== undefined && Math.abs(y - previousY) > 3 ? '\n' : ' ';
          previousY = y;
          return prefix + item.str + (item.hasEOL ? '\n' : '');
        }).join(''));
        if (text.replace(/\s/g, '').length < 40) continue;
        pagesWithText++;
        const heading = text.split('\n').find(line => line.trim().length > 2)?.trim().slice(0, 100) || '';
        let start = 0;
        while (start < text.length) {
          let end = Math.min(start + 1600, text.length);
          if (end < text.length) {
            const boundary = text.lastIndexOf('\n', end);
            if (boundary > start + 800) end = boundary;
          }
          chunks.push({ file: entry.file, page, heading, text: text.slice(start, end) });
          if (end === text.length) break;
          start = end - 160;
        }
      }
      documents.push({ file: entry.file, pages: pdf.numPages, pagesWithText });
      console.log(entry.file + ': ' + pagesWithText + '/' + pdf.numPages + ' 页含可检索文字');
      if (!pagesWithText) throw new Error(entry.file + ' 未提取到文字，需要 OCR');
    } finally { await task.destroy(); }
  }
  const version = createHash('sha256').update(JSON.stringify(chunks)).digest('hex');
  const index = { format: FORMAT, version, files, documents, chunks };
  await fs.mkdir(path.dirname(INDEX), { recursive: true });
  await fs.writeFile(INDEX + '.tmp', JSON.stringify(index), 'utf8');
  await fs.rename(INDEX + '.tmp', INDEX);
  cachedIndex = null;
  return index;
}
async function loadIndex() {
  const stat = await fs.stat(INDEX).catch(() => { throw new Error('课件检索索引不存在，请在 server 目录运行 npm run rag:index'); });
  const current = await manifest();
  if (cachedIndex?.modified === stat.mtimeMs) {
    if (JSON.stringify(current) !== JSON.stringify(cachedIndex.index.files)) throw new Error('课件已变化，请运行 npm run rag:index 更新索引');
    return cachedIndex.index;
  }
  const index = JSON.parse(await fs.readFile(INDEX, 'utf8'));
  if (index.format !== FORMAT || !Array.isArray(index.chunks)) throw new Error('课件索引格式无效，请重新运行 npm run rag:index');
  if (JSON.stringify(current) !== JSON.stringify(index.files)) throw new Error('课件已变化，请运行 npm run rag:index 更新索引');
  const df = new Map();
  for (const chunk of index.chunks) {
    chunk.tokens = terms(chunk.text + ' ' + chunk.heading);
    chunk.counts = new Map();
    for (const token of chunk.tokens) chunk.counts.set(token, (chunk.counts.get(token) || 0) + 1);
    for (const token of chunk.counts.keys()) df.set(token, (df.get(token) || 0) + 1);
  }
  index.df = df;
  index.averageLength = index.chunks.reduce((sum, c) => sum + c.tokens.length, 0) / Math.max(1, index.chunks.length);
  cachedIndex = { modified: stat.mtimeMs, index };
  return index;
}
function score(index, chunk, query) {
  let value = 0;
  for (const token of new Set(terms(expandQuery(query)))) {
    const count = chunk.counts.get(token) || 0;
    if (!count) continue;
    const frequency = index.df.get(token) || 0;
    const idf = Math.log(1 + (index.chunks.length - frequency + 0.5) / (frequency + 0.5));
    value += idf * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * chunk.tokens.length / index.averageLength));
  }
  const compact = value => normalize(value).toLowerCase().replace(/\s/g, '');
  const body = compact(chunk.text);
  if (body.includes(compact(query))) value += 5;
  const heading = compact(chunk.heading);
  const subject = compact(query).replace(/(?:机制|编码|方法|模型)$/u, '');
  if (subject.length >= 2 && heading.includes(subject)) value += 12;
  if (/本讲|知识地图|课程|课后思考/.test(chunk.heading) && !/概述|绪论|基础|自然语言处理/.test(query)) value *= 0.25;
  return value * Math.min(1, Math.max(0.35, chunk.text.replace(/\s/g, '').length / 140));
}
// 原始主题须有足够覆盖，不能只靠“格式”“修复”等一个词命中。
function isRelevant(chunk, query) {
  if (/本讲主要内容|本讲知识点|本讲小结|课程知识地图|全课程知识地图/.test(chunk.heading)) return false;
  const compact = text => normalize(text).toLowerCase().replace(/\s/g, '');
  const body = compact(chunk.text);
  if (query.includes('文本') && !/文本|语料|文档|网页/.test(body)) return false;
  const subject = query.replace(/(?:基础|理论|机制|方法)$/u, '').replace(/[与和及、]/g, ' ');
  const keywords = [...new Set(terms(subject))];
  if (!keywords.length) return false;
  const covered = keywords.filter(token => body.includes(token)).length / keywords.length;
  if (covered >= 0.6) return true;
  // 中英文等价术语可直接匹配，但不把它拆成泛化的单词。
  return QUERY_EQUIVALENTS.some(group => group.some(term => compact(query).includes(compact(term)))
    && group.some(term => body.includes(compact(term))));
}
async function retrieveMaterials({ topic = '', nodeLabel, ancestors = [], children = [] }) {
  // 此目录当前只用于 NLP 课程，避免将资料强行用于其它课程。
  if (!/自然语言|\bnlp\b|语言模型|transformer|attention|词嵌入|词向量|分词|预训练|prompt|指令微调/i.test(topic)) {
    return { version: 'outside-nlp-course', sources: [] };
  }
  const index = await loadIndex();
  const queries = [nodeLabel, ...children.map(child => child.label)];
  const context = ancestors.slice(-2).join(' ');
  const candidates = queries.map(query => index.chunks.map((chunk, i) => ({
    chunk, i, score: score(index, chunk, query) + 0.12 * score(index, chunk, context),
    direct: score(index, chunk, query),
  })).filter(item => item.direct >= 4 && isRelevant(item.chunk, query)).sort((a, b) => b.score - a.score));
  const selected = [], used = new Set();
  // 各子主题先取一条，再补高分片段，最多六条。
  for (const list of candidates) {
    const item = list.find(item => !used.has(item.i));
    if (item && selected.length < 6) { selected.push(item); used.add(item.i); }
  }
  for (const item of candidates.flat().sort((a, b) => b.score - a.score)) {
    if (selected.length >= 6) break;
    if (!used.has(item.i)) { selected.push(item); used.add(item.i); }
  }
  return { version: index.version + ':retrieval-2', sources: selected.map(({ chunk }, i) => ({
    id: '资料' + (i + 1), file: chunk.file, page: chunk.page, heading: chunk.heading, text: chunk.text,
  })) };
}
function addSourceReferences(content, sources) {
  const allowed = new Set(sources.map(source => source.id));
  const cited = [...content.matchAll(/\[资料(\d+)\]/g)].map(match => '资料' + match[1]);
  if (cited.some(id => !allowed.has(id))) throw new Error('引用了本次未提供的资料编号');
  if (!cited.length) return sources.length
    ? content + '\n\n资料说明：本节未标注可核对的课件引用，补充内容需进一步核对。'
    : content;
  if (!sources.length) return content;
  const references = sources.filter(source => cited.includes(source.id));
  return content + '\n\n---\n\n参考资料（PDF 文件页码）：\n\n' + references.map(source =>
    '- [' + source.id + '] ' + String.fromCharCode(96) + source.file.replaceAll(String.fromCharCode(96), '') + String.fromCharCode(96) + '，第 ' + source.page + ' 页'
  ).join('\n');
}
module.exports = { buildIndex, retrieveMaterials, addSourceReferences };
if (require.main === module) {
  const operation = process.argv[2] === '--query'
    ? retrieveMaterials({ topic: '自然语言处理', nodeLabel: process.argv.slice(3).join(' ') }).then(result => console.log(JSON.stringify(result, null, 2)))
    : buildIndex().then(index => console.log('索引完成：' + index.chunks.length + ' 个片段'));
  operation.catch(error => { console.error(error.message); process.exitCode = 1; });
}
