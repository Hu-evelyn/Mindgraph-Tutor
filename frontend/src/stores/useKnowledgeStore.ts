import { create } from 'zustand';
import type { KnowledgeTree, DbKnowledgeNode,AppState } from '../types/index';
import { knowledgeApi} from '../services/api';

interface KnowledgeState extends AppState {
  noteLoading: Record<number, boolean>;
  noteErrors: Record<number, string>;
  noteDrafts: Record<number, string>;
  noteStatuses: Record<number, string>;
  generateNote: (nodeId: number, treeId: number, force?: boolean) => Promise<void>;
  updateNode: (nodeId: number, treeId: number, changes: { label?: string; content?: string }) => Promise<void>;
  regenerateChildren: (nodeId: number, treeId: number) => Promise<void>;
  deleteNodeSubtree: (nodeId: number, treeId: number) => Promise<void>;
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
const learningVersions = new Map<string, number>();

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  // 初始状态
  noteLoading: {},
  noteErrors: {},
  noteDrafts: {},
  noteStatuses: {},
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

  generateNote: async (nodeId, treeId, force = false) => {
    if (get().currentTreeId !== treeId || (!force && get().noteLoading[nodeId])) return;
    const selectionVersion = treeSelectionVersion;
    const editKey = `${treeId}:${nodeId}`;
    // 显式重生成优先于仍在进行的自动生成，旧响应不能覆盖此次选择。
    if (force) noteEditVersions.set(editKey, (noteEditVersions.get(editKey) ?? 0) + 1);
    const editVersion = noteEditVersions.get(editKey) ?? 0;
    const isCurrent = () => get().currentTreeId === treeId && selectionVersion === treeSelectionVersion &&
      (noteEditVersions.get(editKey) ?? 0) === editVersion;
    let draft = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      if (isCurrent()) set(state => ({ noteDrafts: { ...state.noteDrafts, [nodeId]: draft } }));
    };
    set(state => ({
      noteLoading: { ...state.noteLoading, [nodeId]: true },
      noteErrors: { ...state.noteErrors, [nodeId]: '' },
      noteDrafts: { ...state.noteDrafts, [nodeId]: '' },
      noteStatuses: { ...state.noteStatuses, [nodeId]: '正在准备笔记…' },
    }));
    try {
      const response = await knowledgeApi.generateNote(nodeId, treeId, event => {
        if (!isCurrent()) return;
        if (event.type === 'status') set(state => ({ noteStatuses: { ...state.noteStatuses, [nodeId]: event.message } }));
        if (event.type === 'delta') {
          draft += event.text;
          if (!timer) timer = setTimeout(flush, 80);
        }
        if (event.type === 'reset') {
          clearTimeout(timer); timer = undefined; draft = ''; flush();
        }
      }, force);
      if (!isCurrent()) return;
      // 强制重生成成功后同步服务端清除的手工/暂停标记。
      set(state => ({ currentTreeNodes: state.currentTreeNodes.map(node => node.id === nodeId
        ? { ...node, content: response.content, ...(force && !response.cached ? { note_is_manual: 0, note_generation_paused: 0 } : {}) }
        : node) }));
    } catch (error) {
      if (isCurrent()) set(state => ({ noteErrors: { ...state.noteErrors, [nodeId]: error instanceof Error ? error.message : '笔记生成失败' } }));
    } finally {
      clearTimeout(timer);
      if (isCurrent()) set(state => ({
        noteLoading: { ...state.noteLoading, [nodeId]: false },
        noteDrafts: { ...state.noteDrafts, [nodeId]: '' },
        noteStatuses: { ...state.noteStatuses, [nodeId]: '' },
      }));
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
      // 手工编辑使旧流失效，也清除旧流的草稿与状态提示。
      noteDrafts: { ...state.noteDrafts, [nodeId]: '' },
      noteStatuses: { ...state.noteStatuses, [nodeId]: '' },
    }));
    // 若保存前已有树加载请求，启动更新后的加载，让旧响应不能把刚保存的节点刷回去。
    if (activeTreeLoad?.treeId === treeId) {
      void get().loadTree(treeId, true).catch(error => console.error('保存后刷新知识树失败:', error));
    }
  },

  // 重生成第一层后强制刷新扁平节点列表，两种视图都会同步移除旧子树。
  regenerateChildren: async (nodeId, treeId) => {
    await knowledgeApi.regenerateChildren(treeId, nodeId);
    if (get().currentTreeId === treeId) await get().loadTree(treeId, true);
  },

  // 删除响应携带整棵子树的 ID；先同步移除节点和笔记焦点，再刷新数据库中的父节点状态。
  deleteNodeSubtree: async (nodeId, treeId) => {
    const response = await knowledgeApi.deleteNodeSubtree(treeId, nodeId);
    const deletedIds = new Set(response.deletedNodeIds);
    for (const id of deletedIds) {
      const key = `${treeId}:${id}`;
      noteEditVersions.set(key, (noteEditVersions.get(key) ?? 0) + 1);
    }
    set(state => {
      const parentId = state.currentTreeId === treeId
        ? state.currentTreeNodes.find(node => node.id === nodeId)?.parent_id : null;
      const remaining = state.currentTreeId === treeId
        ? state.currentTreeNodes.filter(node => !deletedIds.has(node.id)) : state.currentTreeNodes;
      const noteLoading = { ...state.noteLoading };
      const noteErrors = { ...state.noteErrors };
      const noteDrafts = { ...state.noteDrafts };
      const noteStatuses = { ...state.noteStatuses };
      for (const id of deletedIds) {
        delete noteLoading[id]; delete noteErrors[id]; delete noteDrafts[id]; delete noteStatuses[id];
      }
      return {
        trees: response.deletedTree
          ? state.trees.filter(tree => tree.id !== treeId)
          : state.trees.map(tree => tree.id === treeId
            ? { ...tree, node_count: Math.max(0, (tree.node_count ?? state.currentTreeNodes.length) - response.deletedNodes) }
            : tree),
        ...(state.currentTreeId === treeId ? {
          currentTreeNodes: remaining.map(node => node.id === parentId && !remaining.some(child => child.parent_id === parentId)
            ? { ...node, children_generated: 0, note_generation_paused: 1 } : node),
          currentFocusNodeId: state.currentFocusNodeId !== null && deletedIds.has(state.currentFocusNodeId)
            ? null : state.currentFocusNodeId,
          noteLoading,
          noteErrors,
          noteDrafts,
          noteStatuses,
        } : {}),
      };
    });
    if (get().currentTreeId !== treeId) return;
    if (response.deletedTree) get().setCurrentTree(get().trees[0]?.id ?? null);
    else void get().loadTree(treeId, true).catch(error => console.error('删除后刷新知识树失败:', error));
  },

  // 设置聚焦节点
  setFocusNode: (nodeId: number | null) => {
    set({ currentFocusNodeId: nodeId });
    const treeId = get().currentTreeId;
    // 手工笔记和明确保留的笔记都不再因重新选中节点而自动生成。
    const node = get().currentTreeNodes.find(item => item.id === nodeId);
    if (nodeId !== null && treeId !== null && !node?.note_is_manual && !node?.note_generation_paused) void get().generateNote(nodeId, treeId);
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
    const nodes = get().currentTreeNodes;
    if (treeId === null || !nodes.some(node => node.id === nodeId)) return;
    const affectedIds = new Set<number>([nodeId]);
    const childrenByParent = new Map<number, number[]>();
    nodes.forEach(node => {
      if (node.parent_id === null) return;
      const siblings = childrenByParent.get(node.parent_id) ?? [];
      siblings.push(node.id);
      childrenByParent.set(node.parent_id, siblings);
    });
    const pending = [nodeId];
    while (pending.length) {
      const parentId = pending.pop()!;
      for (const childId of childrenByParent.get(parentId) ?? []) {
        if (affectedIds.has(childId)) continue;
        affectedIds.add(childId);
        pending.push(childId);
      }
    }
    const previousLearned = new Map(nodes
      .filter(node => affectedIds.has(node.id))
      .map(node => [node.id, Boolean(node.is_learned)]));
    const requestVersions = new Map<number, number>();
    affectedIds.forEach(id => {
      const key = `${treeId}:${id}`;
      const version = (learningVersions.get(key) ?? 0) + 1;
      learningVersions.set(key, version);
      requestVersions.set(id, version);
    });
    set(state => ({
      currentTreeNodes: state.currentTreeNodes.map(node =>
        affectedIds.has(node.id) ? { ...node, is_learned: isLearned } : node
      ),
    }));
    try {
      await knowledgeApi.markAsLearned(nodeId, isLearned);
    } catch (error) {
      if (get().currentTreeId === treeId) {
        set(state => ({
          currentTreeNodes: state.currentTreeNodes.map(node =>
            affectedIds.has(node.id) && learningVersions.get(`${treeId}:${node.id}`) === requestVersions.get(node.id)
              ? { ...node, is_learned: previousLearned.get(node.id) ?? false }
              : node
          ),
        }));
      }
      throw error;
    }
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
      noteDrafts: {},
      noteStatuses: {},
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



