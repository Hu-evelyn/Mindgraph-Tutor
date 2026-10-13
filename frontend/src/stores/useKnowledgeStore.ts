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
  loadTree: (treeId: number, force?: boolean) => Promise<void>;//加载某树及其节点，存入currentTreeNodes中
  expandNode: (nodeId: number, treeId: number) => Promise<void>;//拓展节点
  setFocusNode: (nodeId: number | null) => void;//当前节点
  setCurrentTree: (treeId: number | null) => void;//当前树
  toggleNodeExpansion: (nodeId: number) => void;//节点折叠展开开关
  deleteTree: (treeId: number) => Promise<{ success: boolean; deletedNodes: number }>;// 删除知识树
  
}

let treeLoadVersion = 0;
let activeTreeLoad: { treeId: number; version: number; promise: Promise<void> } | null = null;

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
      // 只更新选择，树详情由 App 的选树监听加载一次。
      get().setCurrentTree(response.treeId);
      
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

  // 同一选择的重复调用共用请求；强制刷新用于节点扩展后的新数据。
  loadTree: (treeId: number, force = false) => {
    if (get().currentTreeId !== treeId) return Promise.resolve();
    if (!force && activeTreeLoad?.treeId === treeId && activeTreeLoad.version === treeLoadVersion) {
      return activeTreeLoad.promise;
    }

    const version = ++treeLoadVersion;
    set({ isLoading: true });
    const promise = knowledgeApi.getTree(treeId)
      .then(response => {
        // 只允许最新且仍被选中的树更新状态，防止慢请求覆盖新选择。
        if (version !== treeLoadVersion || get().currentTreeId !== treeId) return;
        if (!response.tree) throw new Error('知识树不存在');
        set(state => ({
          currentTreeNodes: response.nodes.map(node => ({
            ...node,
            isExpanded: state.currentTreeNodes.find(previous => previous.id === node.id)?.isExpanded,
          })),
          isLoading: false,
        }));
      })
      .catch(error => {
        if (version !== treeLoadVersion || get().currentTreeId !== treeId) return;
        set({ isLoading: false });
        throw error;
      })
      .finally(() => {
        if (activeTreeLoad?.version === version) activeTreeLoad = null;
      });
    activeTreeLoad = { treeId, version, promise };
    return promise;
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
      if (get().currentTreeId !== treeId) return;
      await get().loadTree(treeId, true);

      // 扩展期间若切到了别的树，不再改写新树的展开状态或焦点。
      set(state => state.currentTreeId !== treeId ? state : ({
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
      if (get().currentTreeId === treeId) set({ isLoading: false });
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
    if (get().currentTreeId === treeId) return;
    // 切换时使旧响应失效，并清除上一棵树的节点与焦点。
    treeLoadVersion++;
    activeTreeLoad = null;
    set({
      currentTreeId: treeId,
      currentFocusNodeId: null,
      currentTreeNodes: [],
      isLoading: treeId !== null,
    });
  },

  // 删除知识树（包含所有节点）
  deleteTree: async (treeId: number) => {
    set({ isLoading: true });
    
    try {
      const response = await knowledgeApi.deleteTree(treeId);
      
      const wasCurrentTree = get().currentTreeId === treeId;
      set(state => ({
        trees: state.trees.filter(tree => tree.id !== treeId),
        isLoading: false,
      }));
      if (wasCurrentTree) get().setCurrentTree(get().trees[0]?.id ?? null);
      
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



