# MindGraph Tutor

知识树学习工具，支持节点展开、Markdown 分层笔记与本地 NLP 课件检索。

## 本地运行

需要 Node.js 22.13 或更高版本。前后端分别在独立终端中启动。

后端：

```powershell
cd server
npm ci
Copy-Item .env.example .env.local
# 在 .env.local 中填写自己的智谱 API Key
```

将 NLP 课件 PDF 放入 `server/materials/`，然后构建索引并启动：

```powershell
npm run rag:index
npm start
```

前端：

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

浏览器打开终端显示的前端地址，通常为 http://localhost:5173。

## 使用与资料更新

点击节点会先确定下一层结构，再按结构生成并保存学习笔记；展开按钮复用已保存的子节点。NLP 笔记会检索本地课件，并在有依据时附上引用文件名和 PDF 页码。检索使用本地关键词评分，尚未接入向量模型或 OCR。

增删或替换 PDF 后，在 `server` 目录重新运行 `npm run rag:index`。可以运行 `npm run rag:query -- Word2Vec` 检查检索结果。课件、索引、数据库、依赖目录和含密钥的配置文件不纳入 Git；数据库会在启动时自动创建。
