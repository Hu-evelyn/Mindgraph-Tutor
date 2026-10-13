
// 知识节点类型（对应后端的 knowledge_nodes）
// export interface KnowledgeNode {
//   id: number;  // 改为 number 类型，对应数据库的 INTEGER PRIMARY KEY
//   tree_id: number;
//   parent_id: number | null;
//   label: string;
//   content: string;
//   is_learned: boolean;
//   created_at: string;
//   children?: KnowledgeNode[]; // 前端使用的扩展属性
//   isExpanded?: boolean; // 前端使用的扩展属性
//   isLoading?: boolean; // 前端使用的扩展属性
//   // 添加可能缺失的属性
//   title?: string; // 兼容前端使用的 title
//   description?: string; // 兼容 description
// }

// 1️⃣ 服务端原始扁平节点（数据库字段）
export interface DbKnowledgeNode {
  id: number; 
  tree_id: number;
  parent_id: number | null;
  label: string;
  content: string;
  is_learned: boolean;
  children_generated?: number;
  relation_type?: string;      
  importance?: string;          
  difficulty?: string;          
  estimated_time?: string;       
  is_boundary?: boolean;         
  is_core?: boolean;            
  created_at: string;
  children?: DbKnowledgeNode[]; // 前端使用的扩展属性
  isExpanded?: boolean; // 前端使用的扩展属性
  isLoading?: boolean; // 前端使用的扩展属性
  // 添加可能缺失的属性
  title?: string; // 兼容前端使用的 title
  description?: string; // 兼容 description
}

// 2️⃣ 前端树节点（渲染用）
export interface TreeKnowledgeNode {
  id: number;
  title: string;                 // ✅ 必填
  description: string;
  content:string;
  relation_type?: string;        
  importance?: string;          
  difficulty?: string;           
  estimated_time?: string;      
  is_boundary?: boolean;        
  is_core?: boolean;           
  children: TreeKnowledgeNode[];
  childrenGenerated: boolean;
  isExpanded: boolean;
  isLoading?: boolean;
}

// 知识树类型（对应后端的 knowledge_trees）
export interface KnowledgeTree {
  id: number;
  user_id: number;
  root_topic: string;
  created_at: string;
  node_count?: number; // 扩展字段，节点数量
}



// 应用状态
export interface AppState {
  trees: KnowledgeTree[]; 
  currentTreeId: number | null;
  currentFocusNodeId: number | null;
  isLoading: boolean;
  currentTreeNodes: DbKnowledgeNode[]; // 添加这个字段来存储当前树的节点
}
