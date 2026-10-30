const { createHash } = require('node:crypto');

// 从实际笔记提取覆盖范围；不把父节点的写作计划当作已讲过的正文。
function sectionsOf(content = '') {
  const result = [];
  let fence = null;
  for (const line of content.split(/\r?\n/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^#{2,4}\s+\d+(?:\.\d+)*\s+(.+)$/);
    if (heading) result.push({ title: heading[1].trim(), body: '' });
    else if (result.length) result.at(-1).body += line + '\n';
  }
  return result;
}
function buildContinuity(parent, siblings, nodeLabel) {
  const sections = sectionsOf(parent?.content);
  const normalize = text => text.normalize('NFKC').replace(/\s/g, '').toLowerCase();
  const related = sections.find(section => normalize(section.title) === normalize(nodeLabel));
  return {
    parent: parent ? {
      label: parent.label,
      hasNote: sections.length > 0,
      coveredSections: sections.slice(0, 24).map(s => ({ title: s.title, excerpt: s.body.trim().slice(0, 240) })),
      currentTopicExcerpt: related ? related.body.trim().slice(0, 1800) : '',
      summary: sections.length ? sections[0].body.trim().slice(0, 500) : (parent.content || '').slice(0, 500),
    } : null,
    siblingScopes: siblings.map(row => {
      const parts = sectionsOf(row.content);
      return {
        label: row.label,
        scope: parts.length ? parts[0].body.trim().slice(0, 350) : (row.content || '').slice(0, 350),
      };
    }),
    // 哈希基于完整输入，父笔记更新时子笔记缓存自动失效。
    version: createHash('sha256').update(JSON.stringify({ parent, siblings })).digest('hex'),
  };
}
module.exports = { buildContinuity, sectionsOf };
