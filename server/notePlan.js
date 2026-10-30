const { OutputValidationError } = require('./structuredOutput');
const VERSION = 'note-plan-v4';
function parseNotePlan(raw, { children = [], sources = [], hasParent = false } = {}) {
  let plan;
  try { plan = JSON.parse(raw); } catch { throw new OutputValidationError('讲解计划不是合法 JSON'); }
  const fail = message => { throw new OutputValidationError('讲解计划无效：' + message); };
  const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;
  if (!plan || !text(plan.focus, 600) || !Array.isArray(plan.points) || !plan.points.length || plan.points.length > 20) fail('缺少核心问题或讲解要点');
  if (plan.exampleGoal !== null && !text(plan.exampleGoal, 600)) fail('exampleGoal 必须为文本或 null');
  const ids = new Set(sources.map(s => s.id)), titles = new Set();
  const points = plan.points.map(p => {
    if (!p || !text(p.title, 150) || !text(p.question, 600) || !text(p.explanationGoal, 1200) || !Array.isArray(p.prerequisites) || p.prerequisites.length > 8 || p.prerequisites.some(v => !text(v, 200)) || !Array.isArray(p.sourceIds)) fail('要点字段不完整');
    if (titles.has(p.title.trim())) fail('要点标题重复');
    titles.add(p.title.trim());
    if (p.sourceIds.some(id => typeof id !== 'string' || !ids.has(id))) fail('引用了不存在的资料编号');
    if (p.needsMoreEvidence !== undefined && typeof p.needsMoreEvidence !== 'boolean') fail('needsMoreEvidence 必须为布尔值');
    if (p.evidenceQuery !== undefined && p.evidenceQuery !== null && !text(p.evidenceQuery, 200)) fail('evidenceQuery 必须为简短查询或 null');
    return { title: p.title.trim(), question: p.question.trim(), explanationGoal: p.explanationGoal.trim(), prerequisites: p.prerequisites.map(v => v.trim()), sourceIds: [...new Set(p.sourceIds)], needsMoreEvidence: p.needsMoreEvidence || false, evidenceQuery: p.evidenceQuery?.trim() || null };
  });
  if (children.length && (points.length !== children.length || points.some((p, i) => p.title !== children[i].label))) fail('必须沿用已保存子节点及顺序');
  let progression = null;
  if (hasParent || plan.progression != null) {
    const value = plan.progression;
    if (!value || !text(value.newLearning, 800) || !text(value.boundary, 800) || !Array.isArray(value.briefRecall) || value.briefRecall.length > 5 || value.briefRecall.some(v => !text(v, 300))) fail('需要明确父子衔接的新增学习目标、必要回顾与范围边界');
    progression = { newLearning: value.newLearning.trim(), boundary: value.boundary.trim(), briefRecall: value.briefRecall.map(v => v.trim()) };
  }
  return { focus: plan.focus.trim(), points, exampleGoal: plan.exampleGoal?.trim() || null, progression };
}
function selectPlanSources(plan, sources) {
  const selected = new Set(plan.points.flatMap(p => p.sourceIds));
  return sources.filter(s => selected.has(s.id));
}

async function supplementPlanSources(plan, sources, retrieve, { maxSources = 12, maxChars = 22000 } = {}) {
  const next = structuredClone(plan);
  const selected = selectPlanSources(next, sources);
  let budget = selected.reduce((n, s) => n + s.text.length, 0);
  const key = s => s.chunkId || s.sectionId || [s.documentId || s.file || s.title, s.page, s.heading, s.text].join(':');
  const known = new Map(selected.map(s => [key(s), s]));
  let number = Math.max(0, ...sources.map(s => Number(s.id?.match(/^资料(\d+)$/)?.[1]) || 0));
  for (const point of next.points) {
    if (point.sourceIds.length && !point.needsMoreEvidence) continue;
    point.supplementalSourceIds = [];
    if (selected.length >= maxSources || budget >= maxChars) continue;
    const result = await retrieve({ nodeLabel: point.evidenceQuery || [point.title, point.question].filter(Boolean).join(' '), children: [], limit: 2 });
    for (const candidate of result.sources.slice(0, 2)) {
      const existing = known.get(key(candidate));
      if (existing) {
        if (!point.sourceIds.includes(existing.id)) point.supplementalSourceIds.push(existing.id);
        continue;
      }
      if (selected.length >= maxSources || budget + candidate.text.length > maxChars) continue;
      const source = { ...candidate, id: '资料' + (++number) };
      selected.push(source);
      known.set(key(source), source);
      budget += source.text.length;
      point.supplementalSourceIds.push(source.id);
    }
  }
  return { plan: next, sources: selected };
}

async function generateNotePlan(client, prompt, context, model) {
  let previous;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.chat.completions.create({
      model, thinking: { type: 'disabled' }, temperature: 0.2, max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt + (previous ? '\n上次计划无效：' + previous.message + '。请重新输出完整 JSON。' : '') }],
    });
    try {
      const choice = response.choices?.[0];
      if (choice?.finish_reason !== 'stop') throw new OutputValidationError('讲解计划输出未正常结束');
      return parseNotePlan(choice?.message?.content, context);
    } catch (error) {
      if (!(error instanceof OutputValidationError)) throw error;
      previous = error;
    }
  }
  throw previous;
}
module.exports = { VERSION, parseNotePlan, selectPlanSources, supplementPlanSources, generateNotePlan };
