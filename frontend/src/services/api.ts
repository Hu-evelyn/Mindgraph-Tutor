const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
import type { KnowledgeTree, DbKnowledgeNode} from '../types/index';
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
    apiRequest<{
      tree: KnowledgeTree;
      nodes: DbKnowledgeNode[];
      totalNodes: number;
    }>(`/tree/${treeId}`),

  // 删除知识树（包含所有节点）
  deleteTree: (treeId: number) =>
    apiRequest<{ success: boolean; message: string; deletedNodes: number }>(`/tree/${treeId}`, {
      method: 'DELETE',
    }),

  // 标记节点为已学习（需要后端支持）
  markAsLearned: (nodeId: number) =>
    apiRequest<{ success: boolean }>('/mark-learned', {
      method: 'POST',
      body: { nodeId } as any,
    }),
};
