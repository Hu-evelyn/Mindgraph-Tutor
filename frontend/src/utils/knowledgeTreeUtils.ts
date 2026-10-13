// src/utils/knowledgeTreeUtils.ts
import type { TreeKnowledgeNode, DbKnowledgeNode } from '../types';

export const buildTreeStructure = (nodes: DbKnowledgeNode[]): TreeKnowledgeNode[] => {
  
  // 添加调试日志
  console.log('构建树结构，输入节点:', nodes);
  
  const nodeMap = new Map<number, TreeKnowledgeNode>();
  const rootNodes: TreeKnowledgeNode[] = [];

  if (!nodes || nodes.length === 0) {
    console.log('没有节点数据可构建');
    return [];
  }
  // 第一步：初始化所有节点
  nodes.forEach(node => {
    const treeNode: TreeKnowledgeNode = {
      id: node.id,
      title: node.label,
      description: node.content ? node.content.substring(0, 100) + '...' : '',
      content: node.content,
      relation_type: node.relation_type,        // 新增
      importance: node.importance,              // 新增
      difficulty: node.difficulty,              // 新增
      estimated_time: node.estimated_time,      // 新增
      is_boundary: node.is_boundary,            // 新增
      is_core: node.is_core,                    // 新增
      children: [],
      childrenGenerated: Boolean(node.children_generated),
      isExpanded: node.isExpanded ?? true, // 默认展开
      isLoading: true,
    };
    nodeMap.set(node.id, treeNode);
  });

  // 第二步：构建树结构
  nodes.forEach(node => {
    const treeNode = nodeMap.get(node.id)!;
    if (node.parent_id === null) {
      rootNodes.push(treeNode);
    } else {
      const parent = nodeMap.get(node.parent_id);
      if (parent) {
        parent.children.push(treeNode);
      }
    }
  });

  return rootNodes;
};
