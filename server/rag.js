const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DATASET } = require('./mlCurriculum');
const BASE = __dirname, REVISION = 'section-rag-1';
const ALIASES = [
    ['线性回归', 'linear regression'], ['逻辑回归', 'logistic回归', 'logistic regression'],
    ['交叉熵', 'cross entropy', 'cross-entropy'], ['最大似然', 'maximum likelihood'],
    ['最小二乘', 'least squares'], ['均方误差', 'mean squared error', 'mse'],
    ['正则化', 'regularization'], ['权重衰减', 'weight decay'], ['岭回归', 'ridge regression'],
    ['套索回归', 'lasso'], ['过拟合', 'overfitting'], ['欠拟合', 'underfitting'],
    ['偏差', 'bias'], ['方差', 'variance'], ['交叉验证', 'cross validation', 'cross-validation'],
    ['梯度下降', 'gradient descent'], ['随机梯度下降', 'stochastic gradient descent', 'sgd'],
    ['支持向量机', 'support vector machine', 'svm'], ['主成分分析', 'principal component analysis', 'pca'],
    ['高斯混合模型', 'gaussian mixture model', 'gmm'], ['反向传播', 'backpropagation'],
    ['决策树', 'decision tree'], ['随机森林', 'random forest'], ['独热编码', 'one-hot'],
    ['softmax回归', 'softmax regression'], ['训练集', 'training set'], ['测试集', 'test set'],
    ['验证集', 'validation set'], ['损失函数', 'loss function'], ['概率', 'probability'],
];
const hash = value => createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const normalize = text => text.normalize('NFKC').replace(/[ \t]+/g, ' ').trim();
const compact = text => normalize(text).toLowerCase().replace(/\s/g, '');
function tokens(text) {
    const n = normalize(text).toLowerCase(), out = n.match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)*/g) || [];
    for (const run of n.match(/[\p{Script=Han}]+/gu) || [])
        for (let i = 0; i < run.length - 1; i++)
            out.push(run.slice(i, i + 2));
    return out.filter(t => !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'can', 'not', 'into', 'will', 'was', 'has', 'have'].includes(t));
}
function expandQuery(query) {
    return query + ' ' + ALIASES.filter(g => g.some(t => /[\p{Script=Han}]/u.test(t) ? compact(query).includes(compact(t)) : new RegExp('(^|[^a-z0-9])' + t + '($|[^a-z0-9])', 'i').test(query))).flat().join(' ');
}
function validId(id) { if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id))
    throw new Error('无效资料集 ID'); if (id !== DATASET) throw new Error('当前演示仅提供机器学习资料'); return id; }
async function catalog(id) { return JSON.parse(await fs.readFile(path.join(BASE, 'datasets', validId(id) + '.json'), 'utf8')); }
// 标题建立父节，代码块及独占行公式作为完整块保存。
function markdownSections(text, doc) {
    const sections = [], stack = [];
    let blocks = [], pending = [], fence = null;
    function block() { if (pending.length)
        blocks.push(pending.join('\n')); pending = []; }
    function flush() { block(); if (blocks.length)
        sections.push({ heading: stack.at(-1) || doc.chapter, headingPath: [doc.title, ...stack], blocks }); blocks = []; }
    for (const line of text.replace(/\r/g, '').split('\n')) {
        if (/^\s*(\x60{3,}|~{3,})/.test(line)) {
            const mark = line.trim()[0];
            if (fence === mark)
                fence = null;
            else if (!fence)
                fence = mark;
            pending.push(line);
            continue;
        }
        if (/^\s*\$\$\s*$/.test(line)) {
            fence = fence === '$' ? null : fence || '$';
            pending.push(line);
            continue;
        }
        const h = !fence && line.match(/^(#{1,6})\s+(.+)/);
        if (h) {
            flush();
            stack.length = h[1].length - 1;
            stack[h[1].length - 1] = h[2];
            continue;
        }
        if (!fence && /^\s*:(label|numref|eqlabel):/.test(line))
            continue;
        if (!line.trim() && !fence)
            block();
        else
            pending.push(line);
    }
    flush();
    return sections;
}
async function pdfSections(bytes, doc) {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    try {
        const pdf = await task.promise, marks = [];
        async function visit(items, parents = []) { for (const item of items || []) {
            const dest = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
            if (dest?.[0] !== undefined) {
                const page = typeof dest[0] === 'number' ? dest[0] + 1 : await pdf.getPageIndex(dest[0]) + 1;
                marks.push({ page, title: item.title, path: [...parents, item.title] });
            }
            await visit(item.items, [...parents, item.title]);
        } }
        await visit(await pdf.getOutline());
        marks.sort((a, b) => a.page - b.page);
        const labels = await pdf.getPageLabels(), sections = [], skippedPages = [];
        let current = null;
        for (let page = 1; page <= pdf.numPages; page++) {
            const mark = marks.filter(m => m.page <= page).at(-1), chapter = (mark?.path.find(t => /^\s*(?:chapter\s+)?\d+\b/i.test(t)) || '').match(/^\s*(?:chapter\s+)?(\d+)\b/i)?.[1];
            if (doc.chapters?.length && !doc.chapters.includes(chapter))
                continue;
            const data = await (await pdf.getPage(page)).getTextContent();
            let y;
            const text = normalize(data.items.map(item => { const next = item.transform?.[5], br = y !== undefined && Math.abs(next - y) > 3 ? '\n' : ' '; y = next; return br + (item.str || '') + (item.hasEOL ? '\n' : ''); }).join(''));
            if (text.replace(/\s/g, '').length < 40) {
                skippedPages.push(page);
                continue;
            }
            const heading = mark?.title || doc.chapter;
            if (!current || current.heading !== heading) {
                current = { heading, headingPath: [doc.title, ...(mark?.path || [doc.chapter])], blocks: [], pages: [] };
                sections.push(current);
            }
            current.blocks.push(...text.split(/\n\s*\n/).filter(Boolean).map(t => ({ text: t, page, printedPage: labels?.[page - 1] || null })));
            current.pages.push(page);
        }
        if (!sections.length)
            throw new Error(doc.id + ': 所选章节没有文字，请检查 PDF 书签或 OCR');
        return { sections, report: { pages: pdf.numPages, indexedPages: sections.flatMap(s => s.pages), skippedPages, formulaQuality: 'PDF 公式须人工核对，提取文字不保证数学排版完整' } };
    }
    finally {
        await task.destroy();
    }
}
function chunkSections(sections, doc) {
    const chunks = [], parents = [];
    sections.forEach((s, si) => {
        const sectionId = doc.id + ':' + si, blocks = s.blocks.map(b => typeof b === 'string' ? { text: b } : b);
        parents.push({ id: sectionId, headingPath: s.headingPath, blocks });
        let group = [], length = 0;
        const emit = () => { if (!group.length)
            return; const start = group[0].i, end = group.at(-1).i, text = group.map(x => x.text).join('\n\n'); chunks.push({ chunkId: sectionId + ':' + chunks.length, sectionId, startBlock: start, endBlock: end, heading: s.heading, headingPath: s.headingPath, text, page: group.find(x => x.page)?.page || null, pageEnd: [...group].reverse().find(x => x.page)?.page || null, printedPage: group.find(x => x.printedPage)?.printedPage || null, documentId: doc.id, file: doc.file, title: doc.title, edition: doc.version, language: doc.language, url: doc.url }); group = []; length = 0; };
        blocks.forEach((b, i) => { const pieces = b.text.length > 1800 && !/\$\$|^\s*\x60{3}/m.test(b.text) ? b.text.match(/[^。！？.!?\n]+[。！？.!?\n]*/g) || [b.text] : [b.text]; for (const text of pieces) {
            if (length + text.length > 1000)
                emit();
            group.push({ ...b, text, i });
            length += text.length;
        } });
        emit();
    });
    return { chunks, parents };
}
const cache = new Map();
async function buildIndex(id = DATASET) {
    const c = await catalog(id), chunks = [], parents = [], documents = [], missing = [];
    for (const doc of c.documents) {
        if (path.basename(doc.file) !== doc.file)
            throw new Error('资料文件名不能包含路径');
        const bytes = await fs.readFile(path.join(BASE, 'materials', id, doc.file)).catch(e => { if (e.code === 'ENOENT' && doc.optional)
            return null; throw e; });
        if (!bytes) {
            missing.push(doc.id);
            continue;
        }
        const parsed = doc.format === 'markdown' ? { sections: markdownSections(bytes.toString('utf8'), doc), report: {} } : await pdfSections(bytes, doc), split = chunkSections(parsed.sections, doc);
        chunks.push(...split.chunks);
        parents.push(...split.parents);
        documents.push({ ...doc, sha256: hash(bytes), ...parsed.report });
    }
    if (!chunks.length)
        throw new Error('资料集没有可检索正文');
    const index = { format: 2, datasetId: id, revision: REVISION, catalogHash: hash(c), documents, missing, chunks, parents, fileState: await fileState(c) };
    index.version = hash(index);
    await fs.mkdir(path.join(BASE, '.rag'), { recursive: true });
    const dest = path.join(BASE, '.rag', id + '.json');
    await fs.writeFile(dest + '.tmp', JSON.stringify(index));
    await fs.rename(dest + '.tmp', dest);
    cache.delete(id);
    return index;
}
async function fileState(c) {
    const rows = [];
    for (const d of c.documents) {
        const stat = await fs.stat(path.join(BASE, 'materials', c.id, d.file)).catch(e => { if (e.code === 'ENOENT')
            return null; throw e; });
        rows.push([d.file, stat?.size || null, stat?.mtimeMs || null]);
    }
    return rows;
}
async function loadIndex(id) {
    const c = await catalog(id), file = path.join(BASE, '.rag', id + '.json'), stat = await fs.stat(file).catch(() => { throw new Error('请先运行 npm run rag:index -- ' + id); });
    const state = hash(await fileState(c));
    if (cache.get(id)?.mtime === stat.mtimeMs && cache.get(id).catalogHash === hash(c)) {
        if (state !== hash(cache.get(id).index.fileState))
            throw new Error('资料文件已变化，请重建索引');
        return cache.get(id).index;
    }
    const ix = JSON.parse(await fs.readFile(file, 'utf8'));
    if (ix.format !== 2 || ix.revision !== REVISION || ix.catalogHash !== hash(c) || state !== hash(ix.fileState))
        throw new Error('资料/切分配置已更新，请重建 ' + id + ' 索引');
    ix.df = new Map();
    ix.chunks.forEach(c => { c.counts = new Map(); const ts = tokens(c.text + ' ' + c.headingPath.join(' ')); c.length = ts.length; for (const t of ts)
        c.counts.set(t, (c.counts.get(t) || 0) + 1); for (const t of c.counts.keys())
        ix.df.set(t, (ix.df.get(t) || 0) + 1); });
    ix.avg = ix.chunks.reduce((a, c) => a + c.length, 0) / ix.chunks.length;
    cache.set(id, { mtime: stat.mtimeMs, catalogHash: hash(c), index: ix });
    return ix;
}
function lexicalScore(ix, c, query, aliases = true) {
    const q = aliases ? expandQuery(query) : query;
    let score = 0;
    for (const t of new Set(tokens(q))) {
        const tf = c.counts.get(t) || 0;
        if (!tf)
            continue;
        const df = ix.df.get(t) || 0;
        score += Math.log(1 + (ix.chunks.length - df + .5) / (df + .5)) * tf * 2.2 / (tf + 1.2 * (.25 + .75 * c.length / ix.avg));
    }
    const phrases = aliases ? [query, ...ALIASES.filter(g => g.some(t => compact(query).includes(compact(t)))).flat()] : [query];
    if (phrases.some(p => compact(c.heading).includes(compact(p))))
        score += 12;
    return score;
}
function cosine(a, b) { if (a.length !== b.length)
    throw new Error('向量维度不匹配'); let dot = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
} return aa && bb ? dot / Math.sqrt(aa * bb) : 0; }
async function embed(texts) {
    const base = process.env.RAG_EMBEDDING_BASE_URL || process.env.ZHIPU_BASE_URL, key = process.env.RAG_EMBEDDING_API_KEY || process.env.ZHIPU_API_KEY, model = process.env.RAG_EMBEDDING_MODEL;
    if (!base || !key || !model)
        throw new Error('语义检索需要 RAG_EMBEDDING_BASE_URL/API_KEY/MODEL');
    const response = await require('undici').fetch(base.replace(/\/$/, '') + '/embeddings', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input: texts, encoding_format: 'float' }), signal: AbortSignal.timeout(60000) });
    if (!response.ok)
        throw new Error('Embedding 服务 HTTP ' + response.status);
    const result = await response.json(), data = result.data?.slice().sort((a, b) => a.index - b.index);
    if (data?.length !== texts.length || data.some((x, i) => x.index !== i || !Array.isArray(x.embedding) || !x.embedding.length || x.embedding.some(n => !Number.isFinite(n))))
        throw new Error('Embedding 返回无效向量');
    return data.map(x => x.embedding);
}
function embeddingSignature() { return hash([process.env.RAG_EMBEDDING_BASE_URL || process.env.ZHIPU_BASE_URL, process.env.RAG_EMBEDDING_MODEL]); }
async function buildEmbeddings(id = DATASET) { const ix = await loadIndex(id), vectors = []; for (let i = 0; i < ix.chunks.length; i += 8) {
    vectors.push(...await embed(ix.chunks.slice(i, i + 8).map(c => c.headingPath.join(' > ') + '\n' + c.text)));
    console.log('向量 ' + Math.min(i + 8, ix.chunks.length) + '/' + ix.chunks.length);
} const dest = path.join(BASE, '.rag', id + '.vectors.json'); await fs.writeFile(dest + '.tmp', JSON.stringify({ indexVersion: ix.version, signature: embeddingSignature(), vectors })); await fs.rename(dest + '.tmp', dest); }
async function retrieveMaterials({ datasetId = DATASET, nodeLabel = '', ancestors = [], children = [], mode = process.env.RAG_RETRIEVAL_MODE || 'keyword', limit = 6 }) {
    if (mode === 'none')
        return { version: REVISION + ':none', sources: [], mode: 'none' };
    validId(datasetId);
    if (!['keyword', 'baseline', 'semantic', 'hybrid'].includes(mode))
        throw new Error('无效检索模式');
    const documents = (await catalog(datasetId)).documents;
    const ix = await loadIndex(datasetId), queries = [nodeLabel, ...children.map(c => c.label)].filter(Boolean);
    let vectors, queryVectors;
    if (mode === 'semantic' || mode === 'hybrid') {
        const v = JSON.parse(await fs.readFile(path.join(BASE, '.rag', datasetId + '.vectors.json'), 'utf8').catch(() => { throw new Error('请先运行 npm run rag:embed -- ' + datasetId); }));
        if (v.indexVersion !== ix.version || v.signature !== embeddingSignature() || v.vectors.length !== ix.chunks.length)
            throw new Error('向量索引过期或模型已变化，请重建');
        vectors = v.vectors;
        queryVectors = await embed(queries);
    }
    const lists = queries.map((q, qi) => { const lexical = ix.chunks.map((chunk, i) => ({ chunk, i, score: lexicalScore(ix, chunk, q, mode !== 'baseline') })).filter(x => x.score > 0).sort((a, b) => b.score - a.score); if (!vectors)
        return lexical; const semantic = ix.chunks.map((chunk, i) => ({ chunk, i, score: cosine(vectors[i], queryVectors[qi]) })).filter(x => x.score >= Number(process.env.RAG_SEMANTIC_MIN_SCORE || .3)).sort((a, b) => b.score - a.score); if (mode === 'semantic')
        return semantic; const merged = new Map(); for (const list of [lexical.slice(0, 30), semantic.slice(0, 30)])
        list.forEach((x, r) => { const old = merged.get(x.i); merged.set(x.i, { ...x, score: (old?.score || 0) + 1 / (61 + r) }); }); return [...merged.values()].sort((a, b) => b.score - a.score); });
    const picked = [], used = new Set();
    let budget = 0;
    const take = item => { if (!item || used.has(item.chunk.sectionId) || picked.length >= limit)
        return; const parent = ix.parents.find(p => p.id === item.chunk.sectionId), from = Math.max(0, item.chunk.startBlock - 1), to = Math.min(parent.blocks.length, item.chunk.endBlock + 2); let text = parent.blocks.slice(from, to).map(b => b.text).join('\n\n'), expanded = true; if (text.length > 4500 || budget + text.length > 14000) {
        text = item.chunk.text;
        expanded = false;
    } if (budget + text.length > 14000)
        return; const pages = expanded ? parent.blocks.slice(from, to).map(b => b.page).filter(Boolean) : []; const { counts, length, ...chunk } = item.chunk; picked.push({ ...chunk, text, matchedText: chunk.text, page: pages.length ? Math.min(...pages) : chunk.page, pageEnd: pages.length ? Math.max(...pages) : chunk.pageEnd, score: item.score }); used.add(chunk.sectionId); budget += text.length; };
    for (const list of lists)
        take(list.find(x => !used.has(x.chunk.sectionId)));
    for (const item of lists.flat().sort((a, b) => b.score - a.score))
        take(item);
    return { version: ix.version + ':' + REVISION + ':' + mode + ':' + (vectors ? embeddingSignature() : ''), mode, sources: picked.map((s, i) => ({ ...s, sourceUrl: documents.find(d => d.id === s.documentId)?.source, id: '资料' + (i + 1) })) };
}
function addSourceReferences(content, sources) {
    // 参考清单只由元数据生成，模型不得自行编造链接或重复清单。
    content = content.replace(/\n(?:---\s*\n+)?(?:#{1,6}\s*)?参考资料[：:]?\s*\n[\s\S]*$/, '').trim();
    const ids = [...content.matchAll(/\[资料(\d+)\]/g)].map(m => '资料' + m[1]);
    if (ids.some(id => !sources.some(s => s.id === id))) throw new Error('引用了本次未提供的资料编号');
    if (!ids.length) {
        if (sources.length && !/资料不足|资料覆盖不足|资料未覆盖|未检索到相关|摘录不足|摘录无法支持/.test(content))
            throw new Error('已提供参考摘录但正文没有引用；请在直接受支持的论断后标注资料编号，或明确说明资料不足及缺少什么依据，不能牵强引用');
        return content;
    }
    const safe = t => String(t || '').replace(/[\r\n\[\]\x60]/g, ' ').replace(/\$/g, '');
    const validUrl = value => { try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u : null; } catch { return null; } };
    const groups = [], byKey = new Map(), numbers = new Map();
    for (const id of new Set(ids)) {
        const source = sources.find(s => s.id === id);
        const url = validUrl(source.url);
        const pdf = validUrl(source.sourceUrl);
        const direct = pdf && /\.pdf$/i.test(pdf.pathname) ? pdf : url;
        if (direct) direct.hash = '';
        // 同一网页合并小节；PDF 保留不同页的独立出处。
        const key = (direct?.href || source.documentId || source.file || source.title || id) + (source.page ? ':' + source.page : '');
        let group = byKey.get(key);
        if (!group) { group = { source, headings: [], number: groups.length + 1 }; groups.push(group); byKey.set(key, group); }
        const heading = safe(source.headingPath?.at(-1) || source.heading);
        if (heading && !group.headings.includes(heading)) group.headings.push(heading);
        numbers.set(id, group.number);
    }
    const body = content.replace(/\[资料(\d+)\]/g, (_, n) => '[资料' + numbers.get('资料' + n) + ']').replace(/(\[资料\d+\])(?:\1)+/g, '$1');
    const references = groups.map(({ source, headings, number }) => {
        const location = source.printedPage ? '，书内第 ' + safe(source.printedPage) + ' 页' : source.page ? '，PDF 第 ' + source.page + (source.pageEnd && source.pageEnd !== source.page ? '–' + source.pageEnd : '') + ' 页' : '';
        return '- [资料' + number + '] ' + safe(source.title || source.file) + ' · ' + headings.join('、') + location;
    });
    return body + '\n\n---\n\n参考资料：\n\n' + references.join('\n');
}
module.exports = { buildIndex, buildEmbeddings, retrieveMaterials, addSourceReferences, expandQuery, markdownSections, chunkSections, cosine, lexicalScore };
if (require.main === module) {
    require('dotenv').config({ path: path.join(BASE, '.env.local') });
    require('dotenv').config({ path: path.join(BASE, '.env') });
    const a = process.argv.slice(2);
    let task;
    if (a[0] === '--query')
        task = retrieveMaterials({ datasetId: a.length === 2 ? DATASET : a[1], nodeLabel: a.slice(a.length === 2 ? 1 : 2).join(' ') }).then(x => console.log(JSON.stringify(x, null, 2)));
    else if (a[0] === '--embed')
        task = buildEmbeddings(a[1]);
    else
        task = buildIndex(a[0] || DATASET).then(x => console.log('索引完成：' + x.chunks.length + ' 个片段；缺失可选资料：' + (x.missing || []).join(',')));
    task.catch(e => { console.error(e.message); process.exitCode = 1; });
}
