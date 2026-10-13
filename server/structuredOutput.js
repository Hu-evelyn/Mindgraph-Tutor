// 限制单次生成的宽度，防止异常模型输出让知识树一次膨胀过多。
const MAX_ROOT_CHILDREN = 6;
const MAX_EXPAND_CHILDREN = 5;
const RELATIONS = new Set(['PART_OF', 'RELATED', 'PREREQUISITE', 'LEADS_TO']);
const IMPORTANCE = new Set(['low', 'medium', 'high']);
const DIFFICULTY = new Set(['easy', 'medium', 'hard']);

class OutputValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OutputValidationError';
    this.status = 502;
  }
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OutputValidationError(`${field} 必须是对象`);
  }
  return value;
}

function requiredText(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new OutputValidationError(`${field} 必须是 1-${maxLength} 字符的文本`);
  }
  return value.trim();
}

function enumValue(value, field, allowed, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new OutputValidationError(`${field} 取值无效`);
  }
  return value;
}

function optionalBoolean(value, field) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new OutputValidationError(`${field} 必须是布尔值`);
  return value;
}

// 当前接口只持久化一层子节点；拒绝更深层输出，避免静默丢失数据。
function validateChild(value, index) {
  const child = object(value, `children[${index}]`);
  if (child.children !== undefined && (!Array.isArray(child.children) || child.children.length !== 0)) {
    throw new OutputValidationError(`children[${index}] 不能包含下一层节点`);
  }
  return {
    label: requiredText(child.label, `children[${index}].label`, 80),
    description: requiredText(child.description, `children[${index}].description`, 2000),
    relation: enumValue(child.relation, `children[${index}].relation`, RELATIONS),
    importance: enumValue(child.importance, `children[${index}].importance`, IMPORTANCE, 'medium'),
    difficulty: enumValue(child.difficulty, `children[${index}].difficulty`, DIFFICULTY, 'medium'),
    estimated_time: child.estimated_time === undefined
      ? '30分钟'
      : requiredText(child.estimated_time, `children[${index}].estimated_time`, 40),
    is_boundary: optionalBoolean(child.is_boundary, `children[${index}].is_boundary`),
    is_core: optionalBoolean(child.is_core, `children[${index}].is_core`),
  };
}

// JSON 模式仅保证格式倾向，写库前仍须校验节点数量、关系类型和必填字段。
function parseGeneratedOutput(raw, kind) {
  if (typeof raw !== 'string' || !raw.trim()) throw new OutputValidationError('AI 返回空内容');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OutputValidationError('AI 返回的不是合法 JSON');
  }
  object(parsed, '根对象');
  if (!Array.isArray(parsed.children)) throw new OutputValidationError('children 必须是数组');

  const maxChildren = kind === 'tree' ? MAX_ROOT_CHILDREN : MAX_EXPAND_CHILDREN;
  if (parsed.children.length > maxChildren) {
    throw new OutputValidationError(`子节点数不能超过 ${maxChildren}`);
  }
  if (kind === 'tree' && parsed.children.length === 0) {
    throw new OutputValidationError('新知识树至少需要一个一级节点');
  }
  const children = parsed.children.map(validateChild);
  const labels = children.map(child => child.label.normalize('NFKC').toLocaleLowerCase());
  if (new Set(labels).size !== labels.length) throw new OutputValidationError('子节点名称重复');

  if (kind === 'tree') {
    return { children };
  }
  if (kind !== 'expand') throw new Error('未知生成类型');

  const content = requiredText(parsed.content, 'content', 10000);
  if (children.length === 0) {
    // 空结果必须明确表示无法再拆分，不能把模型漏生成误判为成功。
    if (parsed.terminal !== true) throw new OutputValidationError('空子节点必须明确声明 terminal=true');
    requiredText(parsed.reason, 'reason', 200);
  } else if (parsed.terminal === true) {
    throw new OutputValidationError('terminal=true 不能同时包含子节点');
  }
  return { content, children, terminal: children.length === 0 };
}

module.exports = { parseGeneratedOutput, OutputValidationError, MAX_ROOT_CHILDREN, MAX_EXPAND_CHILDREN };
