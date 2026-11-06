# RAG 开发与维护说明

本文说明教材检索、导入文件的资料使用方式，以及索引维护和评测命令。项目介绍、安装和启动步骤见[根目录 README](../README.md)。以下命令均在 server 目录执行，环境变量配置在 .env.local 中。

## 1. 资料如何参与生成

| 场景 | 资料来源与处理方式 |
| --- | --- |
| 通过机器学习主题创建知识树 | 标准节点采用 mlCurriculum.js 中的课程骨架；需要模型规划的节点和学习笔记结合教材索引生成 |
| 通过其他学习主题创建知识树 | 由模型结合主题和节点上下文生成，不使用机器学习教材索引 |
| 通过文件导入创建知识树 | 保存原文与片段，围绕该文件生成知识树；后续展开和笔记继续在该文件中检索 |


## 2. 教材资料与索引

资料目录配置在 datasets/machine-learning.json，记录文件名、书名、版本、语言、章节和下载来源。

| 资料 | 配置范围 |
| --- | --- |
| 《动手学深度学习》 | 线性回归、Softmax 回归、欠拟合与过拟合、权重衰减、反向传播、随机梯度下降六个中文章节 |
| Mathematics for Machine Learning | 第 8–12 章 |
| An Introduction to Statistical Learning with Applications in Python | 第 3–6 章，作为可选资料 |

首次准备资料：

~~~powershell
npm run rag:fetch -- machine-learning
npm run rag:index -- machine-learning
npm run rag:query -- machine-learning 线性回归
~~~

- 原文保存在 materials/machine-learning/，下载记录保存在其中的 receipts.json。
- 文本索引保存在 .rag/machine-learning.json，记录资料哈希、章节、片段和来源位置。
- 下载脚本复用已有文件；可选资料下载失败时会跳过，必需资料下载失败时会结束。
- 原文和索引均由本地准备，不纳入 Git。实际片段数量和可选资料是否可用，以本次索引输出为准。

### 更新资料

增删资料时，先修改 datasets/machine-learning.json，并准备对应原文，再运行索引命令。替换已有文件时直接更新本地原文；下载脚本不会覆盖已存在的文件。

~~~powershell
npm run rag:index -- machine-learning
~~~

索引加载会检查资料配置、文件状态和切分版本。出现“资料/切分配置已更新”或“资料文件已变化”提示时，重新建索引即可。使用语义或混合检索时，还需重建向量。

Markdown 按标题和段落切分，尽量保留公式和代码块；PDF 按配置章节提取文字，保存书签路径和页码。检索命中后会补充同一小节的相邻内容，并按小节去重。PDF 公式的提取效果取决于原文件，必要时需核对原文。

## 3. 检索模式

通过 RAG_RETRIEVAL_MODE 配置教材检索方式，默认使用 keyword。

| 模式 | 说明 |
| --- | --- |
| keyword | 关键词评分，包含中英文术语别名扩展 |
| baseline | 不扩展术语别名的关键词检索，用于对照 |
| semantic | 调用嵌入服务，按向量余弦相似度检索 |
| hybrid | 合并关键词与语义检索的排序结果 |
| none | 不提供教材摘录，用于无 RAG 对照 |

### 启用语义或混合检索

在 .env.local 中配置：

~~~dotenv
RAG_EMBEDDING_MODEL=embedding-3
RAG_RETRIEVAL_MODE=hybrid
~~~

嵌入服务默认复用 ZHIPU_BASE_URL 和 ZHIPU_API_KEY。使用其他兼容服务时，可单独设置 RAG_EMBEDDING_BASE_URL 和 RAG_EMBEDDING_API_KEY。

~~~powershell
npm run rag:embed -- machine-learning
~~~

向量保存在 .rag/machine-learning.vectors.json。重建文本索引、更换嵌入模型或服务地址后，需要重新生成向量；修改配置后重启后端。语义和混合检索会额外调用在线嵌入服务。

## 4. 导入文件与笔记生成

文件导入后，程序提取正文并切分为片段，保留章节或 PDF 页码。短文件直接用于知识结构规划，长文件先分批归纳再汇总。节点生成后，程序根据节点名称和说明匹配原文片段，用于后续展开和笔记检索。

相关数据保存在 SQLite 中：

| 数据表 | 内容 |
| --- | --- |
| imported_documents | 文件名、提取原文、内容哈希和正文片段 |
| imported_document_summaries | 长文分批归纳结果及对应片段编号 |
| node_document_sources | 节点与原文片段的关联 |

导入文件无需运行 rag:index 或 rag:embed。删除整棵知识树时会清理关联资料。较早版本创建、未保存原文的文件知识树，需要重新导入原文件才能使用持续检索。

笔记生成依次完成以下步骤：

1. 读取当前节点、子节点及父节点和同级节点的讲解内容。
2. 从教材索引或关联文件中检索资料，生成讲解计划。
3. 针对计划中需要更多依据的要点补充检索。
4. 流式生成笔记，校验标题结构和引用编号，保存正文、计划与来源信息。

讲解计划通过子节点 ID 关联已有知识范围，允许合并要点和调整讲解顺序。计划校验连续失败时，使用已有节点组织备用计划继续生成。参考清单由程序根据实际引用的资料生成，展示书名或文件名、章节和页码。

笔记缓存结合提示词、课程版本、讲解计划版本、节点结构、父级与同级内容以及资料版本判断是否复用。手工保存或用户明确选择保留的笔记，继续按原内容展示。

## 5. 测试与评测

主要回归测试覆盖教材检索、课程结构、文件导入、计划生成、笔记校验和流式输出：

~~~powershell
npm run test:rag
~~~

接口测试使用模拟模型和临时或内存数据库；部分教材检索测试需要已构建的本地索引。

开发集配置位于 evaluation/questions.json。可先比较无需嵌入服务的检索模式：

~~~powershell
npm run rag:eval -- --modes=none,baseline,keyword
~~~

生成部分问题的回答用于人工检查：

~~~powershell
npm run rag:eval -- --generate --ids=softmax,pca --modes=none,baseline,keyword
~~~

准备好向量后，可在 --modes 中加入 semantic、hybrid，也可用 --limit 限制问题数量。--generate 会调用实际文本生成服务。

结果写入 evaluation/ 下的 retrieval-results 或 generation-results 文件，分别提供 JSON、Markdown 和过程 checkpoint；再次运行会覆盖同名输出。脚本记录 Hit@1、Hit@3、Hit@6、无证据问题的检索表现和耗时。Hit@k 表示前 k 条结果是否存在符合预标注来源、章节及关键词的片段；生成内容的正确性和引用支持程度通过问题中的检查项人工复核。

## 6. 主要维护位置

| 文件 | 职责 |
| --- | --- |
| rag.js | 教材解析、索引构建、关键词与向量检索、参考清单 |
| datasets/machine-learning.json | 教材目录、来源和章节范围 |
| scripts/fetch-materials.js | 资料下载及哈希记录 |
| importedDocuments.js、documentSummary.js | 导入文件切分、归纳和文件内检索 |
| notePrompts.js、notePlan.js、noteContext.js | 写作提示词、讲解计划、补检索及上下文衔接 |
| mlCurriculum.js | 预置课程结构与学习单元 |
| scripts/evaluate-rag.js | 开发集检索与生成评测 |

排查生成失败时先查看后端日志。部分结构化输出失败会在项目根目录的 tmp/ai-output-diagnostics/ 中保存模型响应，便于定位格式或来源编号问题。
