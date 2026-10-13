import { create } from 'zustand';
import type { KnowledgeTree, DbKnowledgeNode,AppState } from '../types/index';
import { knowledgeApi} from '../services/api';

interface KnowledgeState extends AppState {
  // 计算属性
  currentTree: () => KnowledgeTree | undefined;
  currentFocusNode: () => DbKnowledgeNode | undefined;
  getCurrentTreeNodes: () => DbKnowledgeNode[]; // 添加获取当前树节点的方法
  
  // 动作
  createNewTree: (userPrompt: string, userId?: number) => Promise<number>;//建新树
  loadUserTrees: () => Promise<void>;//加载某用户所有树
  loadTree: (treeId: number) => Promise<void>;//加载某树及其节点，存入currentTreeNodes中
  expandNode: (nodeId: number, treeId: number) => Promise<void>;//拓展节点
  setFocusNode: (nodeId: number | null) => void;//当前节点
  setCurrentTree: (treeId: number | null) => void;//当前树
  toggleNodeExpansion: (nodeId: number) => void;//节点折叠展开开关
  deleteTree: (treeId: number) => Promise<{ success: boolean; deletedNodes: number }>;// 删除知识树
  
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  // 初始状态
  trees: [],
  currentTreeId: null,
  currentFocusNodeId: null,
  isLoading: false,
  currentTreeNodes: [],
  // 计算属性
  currentTree: () => {
    const state = get();
    return state.trees.find(t => t.id === state.currentTreeId);
  },

  currentFocusNode: () => {
    const state = get();
    const currentTree = state.currentTree();
    if (!currentTree || !state.currentFocusNodeId) return undefined;
    
    // 需要从当前树的节点中查找
    const nodes = state.getCurrentTreeNodes();
    return findNodeById(nodes, state.currentFocusNodeId);
  },

  // 获取当前树的节点
  getCurrentTreeNodes: () => {
    return get().currentTreeNodes;
  },

  // 创建新知识树
  createNewTree: async (userPrompt: string, userId: number = 1) => {
    set({ isLoading: true });
    
    try {
      const response = await knowledgeApi.createTree(userPrompt, userId);
      
      // 重新加载用户的知识树列表
      await get().loadUserTrees();
      await get().loadTree(response.treeId);
      
      set({ 
        currentTreeId: response.treeId,
        isLoading: false 
      });
      
      return response.treeId;
    } catch (error) {
      console.error('创建知识树失败:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  // 加载用户的知识树列表
  loadUserTrees: async () => {
    set({ isLoading: true });
    
    try {
      const response = await knowledgeApi.getUserTrees(1);
      set({ trees: response.trees, isLoading: false });
    } catch (error) {
      console.error('加载知识树列表失败:', error);
      set({ isLoading: false });
    }
  },

  // 加载特定知识树
  loadTree: async (treeId: number) => {
    set({ isLoading: true });
    
    try {
      const response = await knowledgeApi.getTree(treeId);
      
      console.log('加载树数据:', {
      treeId,
      nodesCount: response.nodes?.length,
      nodes: response.nodes // 调试日志
      });
      // 这里需要处理节点数据，可以存储在状态中或使用缓存
      set(state => ({
        currentTreeId: treeId,
        currentTreeNodes: (response.nodes || []).map(node => ({
          ...node,
          isExpanded: state.currentTreeId === treeId
            ? state.currentTreeNodes.find(previous => previous.id === node.id)?.isExpanded
            : undefined,
        })),
        isLoading: false,
      }));
    } catch (error) {
      console.error('加载知识树失败:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  // 扩展节点
  expandNode: async (nodeId: number, treeId: number) => {
    set({ isLoading: true });
    
    try {
      // 先确认当前树中有此节点；后端仍会独立校验节点归属。
      const nodes = get().currentTreeNodes;
      const node = nodes.find(n => n.id === nodeId);
      if (!node) throw new Error('节点不存在');

      await knowledgeApi.expandNode(nodeId, treeId);
      await get().loadTree(treeId);

      set(state => ({
        currentTreeNodes: state.currentTreeNodes.map(n => 
          n.id === nodeId ? { 
            ...n, 
            isExpanded: true,
          } : n
        ),
        currentFocusNodeId: nodeId,
        isLoading: false,
      }));
      
    } catch (error) {
      console.error('扩展节点失败:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  toggleNodeExpansion: (nodeId: number) => {
  set(state => ({
    currentTreeNodes: state.currentTreeNodes.map(n =>
      n.id === nodeId ? { ...n, isExpanded: !(n.isExpanded ?? true) } : n
    ),
  }));
  },

  // 设置聚焦节点
  setFocusNode: (nodeId: number | null) => {
    set({ currentFocusNodeId: nodeId });
  },

  // 设置当前知识树
  setCurrentTree: (treeId: number | null) => {
    set({ 
      currentTreeId: treeId,
      currentFocusNodeId: null,
    });
  },

  // 删除知识树（包含所有节点）
  deleteTree: async (treeId: number) => {
    set({ isLoading: true });
    
    try {
      const response = await knowledgeApi.deleteTree(treeId);
      
      // 更新状态
      set(state => {
        const newTrees = state.trees.filter(tree => tree.id !== treeId);
        const isDeletingCurrentTree = state.currentTreeId === treeId;
        
        return {
          trees: newTrees,
          currentTreeId: isDeletingCurrentTree ? (newTrees[0]?.id || null) : state.currentTreeId,
          currentFocusNodeId: isDeletingCurrentTree ? null : state.currentFocusNodeId,
          currentTreeNodes: isDeletingCurrentTree ? [] : state.currentTreeNodes,
          isLoading: false
        };
      });
      
      return { success: true, deletedNodes: response.deletedNodes || 0 };
      
    } catch (error) {
      console.error('删除知识树失败:', error);
      set({ isLoading: false });
      throw error;
    }
  },

}));

// 辅助函数
function findNodeById(nodes: DbKnowledgeNode[], nodeId: number): DbKnowledgeNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.children) {
      const found = findNodeById(node.children, nodeId);
      if (found) return found;
    }
  }
  return undefined;
}



