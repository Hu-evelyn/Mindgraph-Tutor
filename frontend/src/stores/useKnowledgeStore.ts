import { create } from 'zustand';
import type { KnowledgeTree, DbKnowledgeNode,AppState } from '../types/index';
import { knowledgeApi} from '../services/api';

interface KnowledgeState extends AppState {
  noteLoading: Record<number, boolean>;
  noteErrors: Record<number, string>;
  generateNote: (nodeId: number, treeId: number) => Promise<void>;
  updateNode: (nodeId: number, treeId: number, changes: { label?: string; content?: string }) => Promise<void>;
  markNodeLearned: (nodeId: number, isLearned: boolean) => Promise<void>;
  revealNode: (nodeId: number) => void;
  revealVersion: number;
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
let treeSelectionVersion = 0;
let activeTreeLoad: { treeId: number; version: number; promise: Promise<void> } | null = null;
// 编辑完成后丢弃较早发起的自动笔记响应，避免覆盖手工内容。
const noteEditVersions = new Map<string, number>();

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  // 初始状态
  noteLoading: {},
  noteErrors: {},
  revealVersion: 0,
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
          trees: state.trees.map(tree => tree.id === treeId ? { ...tree, ...response.tree } : tree),
          currentTreeNodes: response.nodes.map(node => ({
            ...node,
            is_learned: Boolean(node.is_learned),
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

  generateNote: async (nodeId, treeId) => {
    if (get().currentTreeId !== treeId || get().noteLoading[nodeId]) return;
    const selectionVersion = treeSelectionVersion;
    const editKey = `${treeId}:${nodeId}`;
    const editVersion = noteEditVersions.get(editKey) ?? 0;
    set(state => ({ noteLoading: { ...state.noteLoading, [nodeId]: true }, noteErrors: { ...state.noteErrors, [nodeId]: '' } }));
    try {
      const response = await knowledgeApi.generateNote(nodeId, treeId);
      if (get().currentTreeId !== treeId || selectionVersion !== treeSelectionVersion ||
          (noteEditVersions.get(editKey) ?? 0) !== editVersion) return;
      set(state => ({ currentTreeNodes: state.currentTreeNodes.map(node => node.id === nodeId ? { ...node, content: response.content } : node) }));
    } catch (error) {
      if (get().currentTreeId === treeId && selectionVersion === treeSelectionVersion &&
          (noteEditVersions.get(editKey) ?? 0) === editVersion) set(state => ({ noteErrors: { ...state.noteErrors, [nodeId]: error instanceof Error ? error.message : '笔记生成失败' } }));
    } finally {
      if (get().currentTreeId === treeId && selectionVersion === treeSelectionVersion) set(state => ({ noteLoading: { ...state.noteLoading, [nodeId]: false } }));
    }
  },

  // 按字段保存名称或笔记；两种视图和右侧详情仍共用同一份节点状态。
  updateNode: async (nodeId, treeId, changes) => {
    const response = await knowledgeApi.updateNode(treeId, nodeId, changes);
    const editKey = `${treeId}:${nodeId}`;
    noteEditVersions.set(editKey, (noteEditVersions.get(editKey) ?? 0) + 1);
    if (get().currentTreeId !== treeId) return;
    set(state => ({
      currentTreeNodes: state.currentTreeNodes.map(node => node.id === nodeId
        ? { ...node, ...response.node, isExpanded: node.isExpanded }
        : node),
      trees: response.rootTopic === null ? state.trees : state.trees.map(tree =>
        tree.id === treeId ? { ...tree, root_topic: response.rootTopic! } : tree),
      noteLoading: { ...state.noteLoading, [nodeId]: false },
      noteErrors: { ...state.noteErrors, [nodeId]: '' },
    }));
    // 若保存前已有树加载请求，启动更新后的加载，让旧响应不能把刚保存的节点刷回去。
    if (activeTreeLoad?.treeId === treeId) {
      void get().loadTree(treeId, true).catch(error => console.error('保存后刷新知识树失败:', error));
    }
  },

  // 设置聚焦节点
  setFocusNode: (nodeId: number | null) => {
    set({ currentFocusNodeId: nodeId });
    const treeId = get().currentTreeId;
    // 手工编辑过的笔记已是最终内容，选中时不再发起自动生成请求。
    const node = get().currentTreeNodes.find(item => item.id === nodeId);
    if (nodeId !== null && treeId !== null && !node?.note_is_manual) void get().generateNote(nodeId, treeId);
  },

  // 搜索命中后展开从根到目标节点的祖先，并切换焦点。
  revealNode: (nodeId: number) => {
    const nodes = get().currentTreeNodes;
    const target = nodes.find(node => node.id === nodeId);
    if (!target) return;
    const ancestors = new Set<number>();
    let parentId = target.parent_id;
    while (parentId !== null) {
      ancestors.add(parentId);
      parentId = nodes.find(node => node.id === parentId)?.parent_id ?? null;
    }
    set(state => ({
      currentTreeNodes: state.currentTreeNodes.map(node =>
        ancestors.has(node.id) ? { ...node, isExpanded: true } : node
      ),
      revealVersion: state.revealVersion + 1,
    }));
    get().setFocusNode(nodeId);
  },

  // 学习状态由数据库持久化，成功后同步当前树状态。
  markNodeLearned: async (nodeId: number, isLearned: boolean) => {
    const treeId = get().currentTreeId;
    if (treeId === null || !get().currentTreeNodes.some(node => node.id === nodeId)) return;
    await knowledgeApi.markAsLearned(nodeId, isLearned);
    if (get().currentTreeId !== treeId) return;
    set(state => ({
      currentTreeNodes: state.currentTreeNodes.map(node =>
        node.id === nodeId ? { ...node, is_learned: isLearned } : node
      ),
    }));
  },

  // 设置当前知识树
  setCurrentTree: (treeId: number | null) => {
    if (get().currentTreeId === treeId) return;
    treeSelectionVersion++;
    // 切换时使旧响应失效，并清除上一棵树的节点与焦点。
    treeLoadVersion++;
    activeTreeLoad = null;
    set({
      currentTreeId: treeId,
      currentFocusNodeId: null,
      currentTreeNodes: [],
      noteLoading: {},
      noteErrors: {},
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



