# MindGraph Tutor

MindGraph Tutor 是面向课程自学的 Web 应用，将知识结构、学习笔记和 AI 答疑整合在同一工作台中。学生可以输入学习主题或导入课程资料创建知识树，逐步展开知识点、阅读和整理笔记，并围绕当前学习内容提问。

## 主要功能

- **知识树生成与浏览**：通过学习主题或 PDF、TXT、Markdown 资料创建知识树，支持树状视图与思维导图切换、节点展开与收起、内容搜索，以及导图缩放和拖动。
- **学习笔记生成与整理**：围绕所选知识点生成笔记和简介，正文逐步显示；支持 Markdown、数学公式、字号调整和手工编辑保存。
- **AI 学习答疑**：结合当前主题、节点笔记、近期对话和上传附件回答问题，支持围绕同一知识点继续追问。
- **文件知识补充**：上传文件并勾选“同时把文件中的新增知识补充到左侧知识树”，将尚未覆盖的知识点加入当前知识树。
- **学习内容管理**：保存、搜索、切换和删除知识树；修改节点名称，选择是否重新生成子节点和笔记；标记学习状态并查看进度。
- **图谱导入与导出**：支持导入 MindGraph-Tutor 格式的 JSON 图谱，将树状视图导出为 PDF、思维导图导出为 SVG。

## 技术栈

| 部分 | 主要技术 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite、Tailwind CSS、Zustand |
| 笔记与公式展示 | React Markdown、KaTeX |
| 后端 | Node.js、Express 5 |
| 数据存储 | SQLite |
| 模型服务 | 智谱 API，默认使用 glm-4.5-flash |
| 资料处理 | PDF.js、文本切分与检索增强生成（RAG） |

## 本地运行

需要 Node.js 22.19.0 或更高版本（建议使用 Node.js 24）、npm 和可用的智谱 API Key。前后端分别在独立终端中运行。以下命令以 Windows PowerShell 为例，项目路径可按实际位置替换。

### 1. 安装依赖

~~~powershell
cd D:\Mindgraph-Tutor\server
npm ci

cd D:\Mindgraph-Tutor\frontend
npm ci
~~~

### 2. 配置模型服务

首次配置时，在 server 目录复制模板：

~~~powershell
cd D:\Mindgraph-Tutor\server
Copy-Item .env.example .env.local
~~~

编辑 server/.env.local，填写自己的密钥。已有配置时直接修改该文件。

~~~dotenv
PORT=3000
ZHIPU_API_KEY=你的智谱API密钥
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
ZHIPU_MODEL=glm-4.5-flash
RAG_RETRIEVAL_MODE=keyword
~~~

### 3. 准备机器学习教材资料

使用机器学习主题前，在 server 目录下载教材资料并构建索引：

~~~powershell
npm run rag:fetch -- machine-learning
npm run rag:index -- machine-learning
~~~

资料下载至 server/materials/machine-learning/，索引保存在 server/.rag/，两者均不纳入 Git。已有有效索引时可直接使用；更新资料后重新运行索引命令即可。

### 4. 启动前后端

后端终端：

~~~powershell
cd D:\Mindgraph-Tutor\server
npm start
~~~

前端终端：

~~~powershell
cd D:\Mindgraph-Tutor\frontend
npm run dev
~~~

浏览器打开前端终端显示的地址，通常为 http://localhost:5173。后端默认地址为 http://localhost:3000，启动时会自动创建数据库。

前端默认请求 http://localhost:3000/api。 如需修改，在 frontend/.env.local 中设置以下变量，并重启前端：

~~~dotenv
VITE_API_BASE_URL=http://localhost:3000/api
~~~

配置地址时保留 /api 后缀；当前 frontend/.env.example 中的示例需要补上这一后缀。

## 使用方式

1. 点击“新建知识树”，输入学习主题，或选择“导入文件生成知识树”。
2. 在树状视图或思维导图中选择节点，查看学习笔记；右键节点可展开、编辑或删除。
3. 使用“编辑笔记”补充自己的理解并保存。修改节点名称时，可分别选择是否重新生成子节点和笔记。
4. 在对话框中提问，或上传文件辅助答疑；需要补充知识树时，勾选对应选项后发送。
5. 标记“已学习”或“未学习”，查看学习进度，并通过“导出图谱”保存学习框架。

知识树、笔记和学习状态保存在 server/database.db 中。对话按知识树和节点分别保留在当前页面会话中，刷新后会清空。

## 内容生成方式

| 来源 | 生成方式 |
| --- | --- |
| 机器学习主题 | 使用预置课程骨架，结合本地教材检索生成笔记及需要模型规划的节点 |
| 其他学习主题 | 由模型结合主题和节点上下文生成 |
| 导入学习资料 | 根据文件内容创建知识树，后续节点展开和笔记生成继续参考该文件 |

笔记围绕当前节点及其子节点组织内容，并参考父节点和同级节点，衔接已有讲解。后端先生成讲解计划，再按需补充检索、流式生成正文，校验后保存，并根据实际使用的资料生成来源信息。手工保存的笔记会保留，不会因再次选择节点而被自动生成覆盖。

## 核心代码结构

| 路径 | 说明 |
| --- | --- |
| frontend/src/components/ | 工作台布局、知识树与思维导图、笔记编辑和 AI 对话 |
| frontend/src/stores/useKnowledgeStore.ts | 知识树、节点、学习状态和笔记的状态管理 |
| frontend/src/services/api.ts | 后端接口请求和流式笔记接收 |
| server/index.js | API 路由、数据库初始化及生成流程 |
| server/mlCurriculum.js | 机器学习课程骨架 |
| server/notePrompts.js、notePlan.js、noteContext.js | 提示词、讲解计划和节点上下文 |
| server/noteValidation.js、structuredOutput.js、noteStream.js | 输出校验与流式任务管理 |
| server/importedDocuments.js、documentSummary.js | 文件切分、长文归纳和文件内检索 |
| server/rag.js、datasets/ | 教材索引、检索和资料配置 |
| server/scripts/、test/、evaluation/ | 资料下载、自动化测试和评测 |


## 测试与构建

后端测试（部分检索测试需要先准备教材索引）：

~~~powershell
cd D:\Mindgraph-Tutor\server
node --test chat.test.js nodeEdit.test.js test/*.test.js
~~~

前端构建：

~~~powershell
cd D:\Mindgraph-Tutor\frontend
npm run build
~~~

## 使用说明

当前版本主要处理文本资料。AI 答疑使用当前节点笔记、近期对话和附件中的相关内容；较长文本可能只使用其中一部分。

节点编辑、笔记保存、图谱导出和学习状态修改通过界面完成。本地 Demo 默认采用单用户模式。

启动或生成失败时，可查看后端终端日志。若提示索引已更新或过期，在 server 目录重新执行 npm run rag:index -- machine-learning。
