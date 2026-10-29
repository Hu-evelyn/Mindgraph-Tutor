const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
import type { DbKnowledgeNode, KnowledgeTree, KnowledgeTreeResponse } from '../types/index';

// 对话历史只包含当前知识树/节点已完成的问答，供后端提供多轮上下文。
export interface TutorChatTurn {
  role: 'user' | 'assistant';
  content: string;
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

  const response = await fetch(url, config);
  
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(details?.error || `API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
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
  generateNote: (nodeId: number, treeId: number) =>
    apiRequest<{ success: boolean; content: string; cached: boolean }>('/generate-note', {
      method: 'POST', body: JSON.stringify({ nodeId, treeId }),
    }),
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
