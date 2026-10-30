// 右侧面板 - 上方显示节点详情，下方通过后端 AI 接口进行问答；页面内按节点保留消息。
import React, { useEffect, useState } from 'react';
import { useKnowledgeStore } from '../../stores/useKnowledgeStore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
// 为笔记中的 LaTeX 公式加载 KaTeX 字体与排版样式。
import 'katex/dist/katex.min.css';
import { BrandGraphIcon } from '../ui/BrandGraphIcon';
import { ResizablePanelGroup } from '../ui/ResizablePanelGroup';
import { ConversationPanel } from './ConversationPanel';
import { NoteEditPanel } from './NoteEditPanel';
import { LearningPath } from '../knowledge/LearningPath';

// 按参考图设置默认比例：详情约占四分之三、提问区约占四分之一；仍可拖动调整。
const RIGHT_PANEL_INITIAL_SIZES = [75, 25];
// 首次提问后为回答留出更多空间；只扩大到至少 40%，之后仍可手动拖动分界。
const CHAT_EXPANDED_PERCENT = 40;

// 笔记以 15px 为 100%，每次调整 10%，范围 20%–300%；百分比单独存储以免误读旧的 px 设置。
const NOTE_FONT_BASE_PX = 15;
const NOTE_FONT_PERCENT_KEY = 'mt-note-font-percent';
const NOTE_FONT_PERCENT_DEFAULT = 100;
const NOTE_FONT_PERCENT_MIN = 20;
const NOTE_FONT_PERCENT_MAX = 300;
const NOTE_FONT_PERCENT_STEP = 10;

// 笔记中的行内 \frac 过于紧凑，会使分母贴近分数线；只在渲染时采用间距更大的 \dfrac。
// 不修改已保存的笔记文本，公式的整体字号仍由 index.css 中的 .mt-note-markdown .katex 控制。
const NOTE_KATEX_OPTIONS = { macros: { '\\frac': '\\dfrac' } };

export const ChatPanel: React.FC = () => {
  const { currentFocusNode, currentTree, getCurrentTreeNodes, revealNode, noteLoading, noteErrors, generateNote, updateNode } = useKnowledgeStore();
  const [hasStartedConversation, setHasStartedConversation] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteFontPercent, setNoteFontPercent] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem(NOTE_FONT_PERCENT_KEY));
      return Number.isInteger(saved) && saved >= NOTE_FONT_PERCENT_MIN && saved <= NOTE_FONT_PERCENT_MAX
        ? saved : NOTE_FONT_PERCENT_DEFAULT;
    } catch {
      return NOTE_FONT_PERCENT_DEFAULT;
    }
  });
  useEffect(() => {
    // 浏览器禁用本地存储时仍可在当前页面调整字号。
    try {
      window.localStorage.setItem(NOTE_FONT_PERCENT_KEY, String(noteFontPercent));
    } catch {
      // 忽略存储限制，保留当前组件中的字号状态。
    }
  }, [noteFontPercent]);
  const focusNode = currentFocusNode();
  const tree = currentTree();
  const treeNodes = getCurrentTreeNodes();
  // 切换知识节点时退出旧笔记的编辑状态，避免在新节点上显示旧草稿。
  useEffect(() => setEditingNoteId(null), [focusNode?.id]);

  return (
    // 视觉统一：右侧详情面板沿用工作台标题、内容卡片和空状态样式，内容渲染不变。
    <div className="flex-1 flex flex-col bg-white min-w-0 h-full">
      {/* 头部显示当前节点信息 */}
      {/* 顶部对齐：详情区也分成 56px 标题栏和节点标题区，与左、中两列的线对齐。 */}
      <div className="mt-panel-header mt-detail-header border-b flex-shrink-0 flex flex-col">
        <div className="mt-topbar h-14 px-5 border-b flex items-center gap-3">
          <p className="mt-kicker">知识点详情</p>
        </div>
        <div className="flex-1 px-5 py-4">
          {/* 学习路径紧邻当前节点或知识树标题，切换主题后仍在标题右侧。 */}
          <div className="flex min-w-0 items-center gap-3">
            {/* 右侧当前标题与中间面板主题标题使用同一字号。 */}
            <h3 className="min-w-0 font-bold text-xl md:text-2xl tracking-tight text-[var(--mt-ink)] break-words">
              {focusNode ? focusNode.label : (tree?.root_topic || 'AI学习助手')}
            </h3>
            {tree && <div className="shrink-0"><LearningPath nodes={treeNodes} onSelect={revealNode} /></div>}
          </div>
          {focusNode?.content && (
            <p className="mt-muted text-xs mt-1">
              节点内容 ({focusNode.content.length} 字符)
            </p>
          )}
        </div>
      </div>
      
      {/* 上下两张卡片共用左右边距；去掉可见横线，卡片间的透明区域仍可拖动。 */}
      <ResizablePanelGroup
        direction="vertical"
        initialSizes={RIGHT_PANEL_INITIAL_SIZES}
        expandLastPanelTo={hasStartedConversation ? CHAT_EXPANDED_PERCENT : undefined}
        hideDivider
        className="flex-1 min-h-0 bg-[var(--mt-canvas)]"
      >
      <div className="h-full min-h-0 px-5 pt-5 pb-2">
        {focusNode && editingNoteId === focusNode.id ? (
          <NoteEditPanel key={focusNode.id} content={focusNode.content ?? ''}
            onCancel={() => setEditingNoteId(null)}
            onSave={content => updateNode(focusNode.id, focusNode.tree_id, { content })} />
        ) : focusNode && noteLoading[focusNode.id] ? (
          <div className="mt-detail-card h-full p-5 text-sm text-gray-500" role="status">正在生成并保存学习笔记...</div>
        ) : focusNode && noteErrors[focusNode.id] ? (
          <div className="mt-detail-card h-full flex flex-col min-h-0 overflow-hidden" role="alert">
            <div className="flex-1 p-5 text-sm text-red-700 overflow-auto">
              {noteErrors[focusNode.id]}
              <button className="mt-soft-button ml-2 px-3 py-1" onClick={() => tree && void generateNote(focusNode.id, tree.id)}>重试</button>
            </div>
            {/* 自动生成失败时，左侧底栏仍保留相同的笔记编辑入口。 */}
            <div className="border-t border-[var(--mt-border)] px-5 py-2 flex items-center">
              <button type="button" onClick={() => setEditingNoteId(focusNode.id)}
                className="mt-soft-button px-3 py-1.5 text-xs">编辑笔记</button>
            </div>
          </div>
        ) : focusNode ? (
          <div className="mt-detail-card h-full flex flex-col min-h-0 overflow-hidden">
            {/* Markdown内容区域 */}
            <div className="flex-1 overflow-auto p-5">
              {/* 正文、标题和公式共用可调字号；只作用于笔记内容，不改动原始 Markdown。 */}
              {focusNode.content ? (
                <div className="prose prose-sm max-w-none mt-note-markdown" style={{ fontSize: `${NOTE_FONT_BASE_PX * noteFontPercent / 100}px` }}>
                {/* 将 $...$ 和独占一行的 $$...$$ 解析并渲染为公式，保留原有 Markdown 样式。 */}
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[[rehypeKatex, NOTE_KATEX_OPTIONS]]}
                  components={{
                    // 自定义Markdown组件样式
                    h1: ({node, ...props}) => <h1 className="font-bold mt-4 mb-3 text-gray-800" {...props} />,
                    h2: ({node, ...props}) => <h2 className="font-semibold mt-3 mb-2 text-gray-800" {...props} />,
                    h4: ({node, ...props}) => <h4 className="font-semibold mt-2 mb-2 text-gray-800" {...props} />,
                    h3: ({node, ...props}) => <h3 className="font-medium mt-2 mb-2 text-gray-800" {...props} />,
                    p: ({node, ...props}) => <p className="mb-2 text-gray-700 leading-relaxed" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc list-inside mb-2 space-y-1" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />,
                    li: ({node, ...props}) => <li className="text-gray-700" {...props} />,
                    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-300 pl-3 italic text-gray-600 my-2" {...props} />,
                    code: ({node, className, children, ...props}) => {
                      // 通过 className 判断是否是行内代码
                      const isInline = !className;
                      return isInline ? (
                        <code className="bg-gray-200 px-1 py-0.5 rounded font-mono" {...props}>
                          {children}
                        </code>
                      ) : (
                        <code className="block bg-gray-200 p-2 rounded font-mono my-2 overflow-x-auto" {...props}>
                          {children}
                        </code>
                      );
                    },
                    pre: ({node, ...props}) => <pre className="bg-gray-200 p-2 rounded font-mono my-2 overflow-x-auto" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-semibold text-gray-800" {...props} />,
                    em: ({node, ...props}) => <em className="italic text-gray-700" {...props} />,
                    a: ({node, ...props}) => <a className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                  }}
                >
                  {focusNode.content}
                </ReactMarkdown>
                </div>
              ) : (
                <p className="mt-muted text-sm">此节点暂无笔记，可点击下方“编辑笔记”添加内容。</p>
              )}
            </div>
            
            {/* 左侧用编辑笔记按钮替代原“Markdown格式”文字，右侧字号控件保持原位。 */}
            <div className="border-t border-[var(--mt-border)] bg-white px-5 py-2 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setEditingNoteId(focusNode.id)}
                className="mt-soft-button px-3 py-1.5 text-xs whitespace-nowrap">编辑笔记</button>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div role="group" aria-label="笔记字号" className="flex items-center gap-1">
                  <button type="button" onClick={() => setNoteFontPercent(percent => Math.max(NOTE_FONT_PERCENT_MIN, percent - NOTE_FONT_PERCENT_STEP))}
                    disabled={noteFontPercent === NOTE_FONT_PERCENT_MIN} aria-label="缩小笔记字体" title="缩小笔记字体"
                    className="mt-soft-button w-7 h-7 flex items-center justify-center text-sm disabled:opacity-40">−</button>
                  <span className="text-xs text-gray-500 tabular-nums min-w-10 text-center" aria-live="polite">{noteFontPercent}%</span>
                  <button type="button" onClick={() => setNoteFontPercent(percent => Math.min(NOTE_FONT_PERCENT_MAX, percent + NOTE_FONT_PERCENT_STEP))}
                    disabled={noteFontPercent === NOTE_FONT_PERCENT_MAX} aria-label="放大笔记字体" title="放大笔记字体"
                    className="mt-soft-button w-7 h-7 flex items-center justify-center text-sm disabled:opacity-40">+</button>
                </div>
                {(focusNode.content ?? '').length > 1000 && (
                  <span className="text-xs text-gray-500">
                    {Math.ceil((focusNode.content ?? '').length / 1000)}k 字符
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          // 无内容时的提示
          <div className="mt-empty h-full flex flex-col min-h-0 overflow-auto items-center justify-center text-gray-400">
            <div className="text-center p-6">
              {/* 空状态图标：复用入口页的知识图谱造型，仅缩小尺寸以适配右侧面板。 */}
              <BrandGraphIcon size="small" className="mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-500 mb-2">
                {tree ? '选择节点查看详情' : '创建知识树开始学习'}
              </p>
              <p className="text-sm text-gray-400 max-w-xs">
                {tree
                  ? '点击左侧知识树或思维导图中的节点，这里将显示详细内容'
                  : '在左侧创建或选择知识树来开始您的学习之旅'
                }
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="h-full min-h-0 px-5 pt-2 pb-5">
        {/* 对话按知识树与焦点节点分组，并将对应 ID 交给后端读取真实学习语境。 */}
        <ConversationPanel
          contextKey={`${tree?.id ?? 'none'}:${focusNode?.id ?? 'general'}`}
          contextLabel={focusNode?.label ?? tree?.root_topic ?? '当前主题'}
          hasSelectedNode={Boolean(focusNode)}
          treeId={tree?.id ?? null}
          nodeId={focusNode?.id ?? null}
          onConversationStart={() => setHasStartedConversation(true)}
        />
      </div>
      </ResizablePanelGroup>
    </div>
  );
};
