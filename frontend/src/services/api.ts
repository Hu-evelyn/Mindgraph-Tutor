const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
import type { DbKnowledgeNode, KnowledgeTree, KnowledgeTreeResponse } from '../types/index';

// 对话历史只包含当前知识树/节点已完成的问答，供后端提供多轮上下文。
export interface TutorChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// Errors created here carry user-facing messages only.
export class UserMessageError extends Error {}
function requestFailure(endpoint: string): string {
  if (endpoint === '/import-document') return '资料导入失败，请稍后重试';
  if (endpoint === '/import-tree') return '图谱导入失败，请稍后重试';
  if (endpoint === '/generate-tree') return '知识树生成失败，请稍后重试';
  if (endpoint === '/expand-node') return '节点展开失败，请稍后重试';
  if (endpoint === '/chat') return '暂时无法回答，请稍后重试';
  return '操作未完成，请稍后重试';
}
async function request(url: string, options: RequestInit): Promise<Response> {
  try { return await fetch(url, options); }
  catch (error) {
    console.error('请求连接失败:', error);
    throw new UserMessageError('连接失败，请检查网络后重试');
  }
}

// 通用请求函数
async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await request(url, config);
  
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    console.error('接口请求失败:', { endpoint, status: response.status, details });
    throw new UserMessageError(response.status < 500 && typeof details?.error === 'string' ? details.error : requestFailure(endpoint));
  }

  try { return await response.json(); }
  catch (error) { console.error('接口响应解析失败:', error); throw new UserMessageError(requestFailure(endpoint)); }
}

export type NoteStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'delta'; text: string }
  | { type: 'reset' };
interface NoteResult { success: boolean; content: string; cached: boolean }

// Buffer frames across network chunks; TextDecoder preserves split UTF-8 characters.
async function streamNote(nodeId: number, treeId: number, onEvent: (event: NoteStreamEvent) => void, force = false): Promise<NoteResult> {
  const response = await request(API_BASE_URL + '/generate-note', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ nodeId, treeId, force }),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    console.error('笔记请求失败:', { status: response.status, details });
    throw new UserMessageError('笔记生成失败，请稍后重试');
  }
  if (!response.body) throw new UserMessageError('暂时无法显示笔记，请刷新页面后重试');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        const event = JSON.parse(data);
        if (event.type === 'error') { console.error('笔记生成失败:', event.message); throw new UserMessageError('笔记生成失败，请稍后重试'); }
        if (event.type === 'done') return event as NoteResult;
        if (['status', 'delta', 'reset'].includes(event.type)) onEvent(event);
      }
      if (done) throw new UserMessageError('笔记连接已中断，请重试');
    }
  } catch (error) {
    if (error instanceof UserMessageError) throw error;
    console.error('笔记接收失败:', error);
    throw new UserMessageError('笔记接收中断，请重试');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// 知识树API
export const knowledgeApi = {
  // 名称与笔记分别保存；只提交本次修改的字段，避免改名时误覆盖笔记。
  updateNode: (treeId: number, nodeId: number, changes: { label?: string; content?: string }) =>
    apiRequest<{ node: DbKnowledgeNode; rootTopic: string | null }>(`/tree/${treeId}/node/${nodeId}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),
  // 节点 ID 可为空：未选节点时围绕整棵知识树提问，节点语境由后端查询。
  askTutor: (treeId: number, nodeId: number | null, question: string, history: TutorChatTurn[]) =>
    apiRequest<{ answer: string }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ treeId, nodeId, question, history }),
    }),
  // 流式生成也传递用户的重生成选择。
  generateNote: streamNote,
  // 摘要由后端依据数据库中当前版本的笔记生成；前端不发送可伪造的正文。
  summarizeNote: (treeId: number, nodeId: number) =>
    apiRequest<{ summary: string; cached: boolean }>(`/tree/${treeId}/node/${nodeId}/summary`, { method: 'POST' }),
  // 服务端先规划新子节点，再在事务内替换旧子树。
  regenerateChildren: (treeId: number, nodeId: number) =>
    apiRequest<{ success: boolean }>(`/tree/${treeId}/node/${nodeId}/regenerate-children`, { method: 'POST' }),
  // 删除节点及所有后代，返回实际删除的 ID 供两种视图立即同步。
  deleteNodeSubtree: (treeId: number, nodeId: number) =>
    apiRequest<{ success: boolean; deletedNodes: number; deletedNodeIds: number[]; deletedTree: boolean }>(
      `/tree/${treeId}/node/${nodeId}`, { method: 'DELETE' }),
  // 创建新知识树
  createTree: (userPrompt: string, userId: number = 1) =>
    apiRequest<{
      success: boolean;
      treeId: number;
      rootNode: { 
        id: number; 
        label: string; 
        content: string ;
        is_core?: boolean};
      nodes: Array<{ 
        label: string; 
        description: string ;
        relation_type?: string;  
        importance?: string;    
        difficulty?: string;    
        estimated_time?: string; 
        is_boundary?: boolean;    
        is_core?: boolean}>;     
    }>('/generate-tree', {
      method: 'POST',
      body: { userPrompt, userId } as any,
    }),

  // 只提交节点和树的 ID；标签由后端从数据库读取并校验归属。
  expandNode: (nodeId: number, treeId: number) =>
    apiRequest<{
      success: boolean;
      content: string;
      children: Array<{ 
        label: string; 
        description: string;
        relation_type?: string;   
        importance?: string;      
        difficulty?: string;      
        estimated_time?: string; 
        is_boundary?: boolean;    
        is_core?: boolean;        
      }>;
    }>('/expand-node', {
      method: 'POST',
      body: { nodeId, treeId } as any,
    }),

  // 获取用户的知识树列表
  getUserTrees: (userId: number = 1) =>
    apiRequest<{ trees: KnowledgeTree[] }>(`/my-trees/${userId}`),

  // 获取特定知识树的完整结构
  getTree: (treeId: number) =>
    apiRequest<KnowledgeTreeResponse>(`/tree/${treeId}`),

  // 删除知识树（包含所有节点）
  deleteTree: (treeId: number) =>
    apiRequest<{ success: boolean; message: string; deletedNodes: number }>(`/tree/${treeId}`, {
      method: 'DELETE',
    }),

  // 显式保存节点学习状态，避免重复点击时前后端状态不同步。
  markAsLearned: (nodeId: number, isLearned: boolean) =>
    apiRequest<{ success: boolean; is_learned: boolean }>('/mark-learned', {
      method: 'POST',
      body: { nodeId, isLearned } as any,
    }),
  importTree: (graph: unknown) =>
    apiRequest<{ success: boolean; treeId: number }>('/import-tree', {
      method: 'POST', body: JSON.stringify(graph),
    }),
  importDocument: (payload: { fileName: string; content?: string; pdfBase64?: string }) =>
    apiRequest<{ success: boolean; treeId: number; title: string }>('/import-document', {
      method: 'POST', body: JSON.stringify(payload),
    }),
};
