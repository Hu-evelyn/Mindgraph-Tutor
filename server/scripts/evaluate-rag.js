const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const BASE = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(BASE, '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(BASE, '.env'), quiet: true });
const { retrieveMaterials, addSourceReferences } = require('../rag');
const { buildNotePrompt } = require('../notePrompts');
async function evaluate({ modes = ['none', 'baseline', 'keyword', 'semantic', 'hybrid'], generate = false, limit = Infinity, ids = null } = {}) {
    const suite = JSON.parse(await fs.readFile(path.join(BASE, 'evaluation/questions.json'), 'utf8'));
    const provenance = { model: process.env.ZHIPU_MODEL || 'glm-4.5-flash', temperature: .3, generationMaxTokens: 6000, promptSha256: createHash('sha256').update(await fs.readFile(path.join(BASE, 'notePrompts.js'))).digest('hex'), indexVersion: JSON.parse(await fs.readFile(path.join(BASE, '.rag/machine-learning.json'), 'utf8')).version };
    const report = { provenance, createdAt: new Date().toISOString(), datasetId: 'machine-learning', questionVersion: suite.version, notes: ['baseline = 同一资料、同一切分、同一排序但不扩展别名；不是旧版 NLP 全流程对比', 'hit@k = 前k条中存在同时满足预标注来源、章节和证据关键词的片段；不是完整召回率', '引用编号合法性不代表引用内容得到支持；正文质量须按检查项人工复核'], modes: {} };
    for (const mode of modes) {
        if (['semantic', 'hybrid'].includes(mode) && !process.env.RAG_EMBEDDING_MODEL) {
            report.modes[mode] = { status: 'skipped', reason: '未配置向量模型' };
            continue;
        }
        const rows = [];
        let failed = false;
        for (const q of suite.cases.filter(q => !ids || ids.includes(q.id)).slice(0, limit)) {
            let retrieval;
            const start = Date.now();
            try {
                retrieval = await retrieveMaterials({ datasetId: 'machine-learning', nodeLabel: q.nodeLabel, mode });
            }
            catch (error) {
                report.modes[mode] = { status: 'failed', reason: error.message };
                failed = true;
                break;
            }
            const relevant = s => [q, ...(q.alternatives || [])].some(g => s.documentId === g.document && new RegExp(g.heading, 'i').test(s.headingPath.join(' ')) && new RegExp(g.evidence, 'i').test(s.text));
            const row = { id: q.id, question: q.question, nodeLabel: q.nodeLabel, noEvidence: !!q.noEvidence, latencyMs: Date.now() - start, hitAt1: q.noEvidence ? null : retrieval.sources.slice(0, 1).some(relevant), hitAt3: q.noEvidence ? null : retrieval.sources.slice(0, 3).some(relevant), hitAt6: q.noEvidence ? null : retrieval.sources.some(relevant), correctAbstention: q.noEvidence ? retrieval.sources.length === 0 : null, sources: retrieval.sources, review: { status: 'pending-human-review', checks: q.checks, citationSupport: null, explanationQuality: null } };
            if (generate) {
                try {
                    const { OpenAI } = require('openai'), client = new OpenAI({ baseURL: process.env.ZHIPU_BASE_URL, apiKey: process.env.ZHIPU_API_KEY, timeout: 90000, maxRetries: 1 });
                    const response = await client.chat.completions.create({ model: process.env.ZHIPU_MODEL || 'glm-4.5-flash', thinking: { type: 'disabled' }, messages: [{ role: 'user', content: buildNotePrompt({ nodeLabel: q.nodeLabel, topic: '机器学习', currentSummary: '本次重点回答：' + q.question, sources: retrieval.sources }) }], temperature: .3, max_tokens: 6000 });
                    const choice = response.choices?.[0];
                    if (choice?.finish_reason !== 'stop' || !choice.message?.content)
                        throw new Error('生成未正常完成');
                    row.rawAnswer = choice.message.content;
                    try { require('../noteValidation').validateNote(row.rawAnswer); row.structureValid = true; } catch (error) { row.structureValid = false; row.structureError = error.message; }
                    try {
                        row.answer = addSourceReferences(row.rawAnswer, retrieval.sources);
                        row.citationIdsValid = true;
                    }
                    catch (error) {
                        row.citationIdsValid = false;
                        row.citationError = error.message;
                        row.answer = row.rawAnswer;
                    }
                    row.claimsForReview = row.rawAnswer.split(/\n\s*\n/).filter(p => /\[资料\d+\]/.test(p)).map(paragraph => ({ paragraph, evidence: retrieval.sources.filter(s => paragraph.includes('[' + s.id + ']')).map(s => ({ id: s.id, text: s.text })), supported: null }));
                }
                catch (error) {
                    row.generationError = error.message;
                }
            }
            rows.push(row);
            await fs.writeFile(path.join(BASE, 'evaluation', generate ? 'generation-checkpoint.json' : 'retrieval-checkpoint.json'), JSON.stringify({ mode, rows }, null, 2));
            console.log(mode + ' ' + q.id + ': ' + (q.noEvidence ? 'abstain=' + row.correctAbstention : 'hit@3=' + row.hitAt3));
        }
        if (failed)
            continue;
        const positive = rows.filter(r => !r.noEvidence), negative = rows.filter(r => r.noEvidence), mean = key => positive.length ? positive.filter(r => r[key]).length / positive.length : null;
        report.modes[mode] = { status: 'completed', summary: { questions: rows.length, hitAt1: mean('hitAt1'), hitAt3: mean('hitAt3'), hitAt6: mean('hitAt6'), negativeCorrect: negative.filter(r => r.correctAbstention).length, negativeTotal: negative.length, generated: rows.filter(r => r.answer).length, humanReviewed: 0 }, rows };
    }
    const dest = path.join(BASE, 'evaluation', generate ? 'generation-results.json' : 'retrieval-results.json');
    await fs.writeFile(dest, JSON.stringify(report, null, 2));
    const md = ['# 机器学习 RAG 开发集评测', '', ...report.notes.map(n => '- ' + n), '', '| 模式 | 状态 | Hit@1 | Hit@3 | Hit@6 | 已生成 / 已人工复核 |', '|---|---|---|---|---|---|'];
    for (const [mode, r] of Object.entries(report.modes)) {
        const s = r.summary, fmt = x => x == null ? '—' : (100 * x).toFixed(1) + '%';
        md.push('| ' + [mode, r.status + (r.reason ? '：' + r.reason : ''), fmt(s?.hitAt1), fmt(s?.hitAt3), fmt(s?.hitAt6), s ? s.generated + ' / ' + s.humanReviewed : '—'].join(' | ') + ' |');
    }
    await fs.writeFile(dest.replace('.json', '.md'), md.join('\n') + '\n');
    return report;
}
module.exports = { evaluate };
if (require.main === module) {
    const a = process.argv.slice(2), mode = a.find(x => x.startsWith('--modes=')), limit = a.find(x => x.startsWith('--limit=')), ids = a.find(x => x.startsWith('--ids='));
    evaluate({ generate: a.includes('--generate'), ...(ids ? { ids: ids.split('=')[1].split(',') } : {}), ...(mode ? { modes: mode.split('=')[1].split(',') } : {}), ...(limit ? { limit: Number(limit.split('=')[1]) } : {}) }).catch(e => { console.error(e.message); process.exitCode = 1; });
}
