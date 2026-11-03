const { parseModelJson, OutputValidationError } = require('./structuredOutput');
const VERSION = 'note-plan-v5';
function childKey(child) { return child.id ?? child.label; }
function defaultPoint(child, nodeLabel = '当前知识点') {
  return { title: child.label, childIds: [childKey(child)],
    question: '这一部分如何构成' + nodeLabel + '，其作用和条件是什么？',
    explanationGoal: (child.summary || child.description || '解释' + child.label + '的作用、机制及与其他组成部分的联系。').slice(0, 1200),
    prerequisites: [], sourceIds: [], needsMoreEvidence: true, evidenceQuery: [child.label, child.summary || child.description].filter(Boolean).join(' ').slice(0, 200) };
}
function coverChildren(points, children, nodeLabel) {
  // Missing associations are filled from saved structure, never guessed from semantic similarity.
  for (const child of children) {
    const id = childKey(child);
    if (points.some(point => point.childIds.includes(id))) continue;
    const sameTitle = points.find(point => point.title === child.label);
    if (sameTitle) sameTitle.childIds.push(id);
    else points.push(defaultPoint(child, nodeLabel));
  }
  return points;
}
function fallbackPlan(context = {}) {
  const { children = [], nodeLabel = '当前知识点', hasParent = false } = context;
  const points = children.length ? children.map(child => defaultPoint(child, nodeLabel)) : [{
    title: nodeLabel, childIds: [], question: '其含义、必要条件和作用机制是什么？',
    explanationGoal: '依据当前资料解释' + nodeLabel + '的定义、条件、机制或操作过程。',
    prerequisites: [], sourceIds: [], needsMoreEvidence: true, evidenceQuery: [nodeLabel, context.currentSummary].filter(Boolean).join(' ').slice(0, 200),
  }];
  return { focus: '理解' + nodeLabel, points, exampleGoal: null,
    progression: hasParent ? { briefRecall: [], newLearning: '进一步解释' + nodeLabel + '的机制与必要条件。', boundary: '围绕当前节点和已保存的子节点展开，必要背景就地说明。' } : null };
}

function parseNotePlan(raw, { children = [], sources = [], hasParent = false, nodeLabel } = {}) {
  let plan;
  try { plan = parseModelJson(raw); } catch { throw new OutputValidationError('讲解计划不是合法 JSON'); }
  const fail = message => { throw new OutputValidationError('讲解计划无效：' + message); };
  const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;
  if (!plan || !text(plan.focus, 600) || !Array.isArray(plan.points) || !plan.points.length || plan.points.length > 20) fail('缺少核心问题或讲解要点');
  if (plan.exampleGoal !== null && !text(plan.exampleGoal, 600)) fail('exampleGoal 必须为文本或 null');
  const ids = new Set(sources.map(s => s.id)), titles = new Set();
  const childIds = new Set(children.map(childKey));
  const points = plan.points.map(p => {
    if (!p || !text(p.title, 150) || !text(p.question, 600) || !text(p.explanationGoal, 1200) || !Array.isArray(p.prerequisites) || p.prerequisites.length > 8 || p.prerequisites.some(v => !text(v, 200)) || !Array.isArray(p.sourceIds)) fail('要点字段不完整');
    if (titles.has(p.title.trim())) fail('要点标题重复');
    titles.add(p.title.trim());
    if (p.sourceIds.some(id => typeof id !== 'string' || !ids.has(id))) fail('引用了不存在的资料编号');
    if (p.needsMoreEvidence !== undefined && typeof p.needsMoreEvidence !== 'boolean') fail('needsMoreEvidence 必须为布尔值');
    if (p.evidenceQuery !== undefined && p.evidenceQuery !== null && !text(p.evidenceQuery, 200)) fail('evidenceQuery 必须为简短查询或 null');
    if (p.childIds !== undefined && (!Array.isArray(p.childIds) || p.childIds.some(id => !childIds.has(id)))) fail('关联了不属于当前节点的子节点');
    const linked = p.childIds === undefined ? children.filter(child => child.label === p.title.trim()).map(childKey) : [...new Set(p.childIds)];
    return { childIds: linked, title: p.title.trim(), question: p.question.trim(), explanationGoal: p.explanationGoal.trim(), prerequisites: p.prerequisites.map(v => v.trim()), sourceIds: [...new Set(p.sourceIds)], needsMoreEvidence: p.needsMoreEvidence || false, evidenceQuery: p.evidenceQuery?.trim() || null };
  });
  coverChildren(points, children, nodeLabel);
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
  console.warn('讲解计划连续校验失败，使用已保存结构组织计划:', previous?.message);
  return fallbackPlan(context);
}
module.exports = { VERSION, parseNotePlan, selectPlanSources, supplementPlanSources, generateNotePlan, fallbackPlan };
