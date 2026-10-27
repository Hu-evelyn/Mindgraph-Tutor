// 右侧面板 - 上方显示节点详情，下方显示仅在前端保存的对话。
import React from 'react';
import { useKnowledgeStore } from '../../stores/useKnowledgeStore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
// 为笔记中的 LaTeX 公式加载 KaTeX 字体与排版样式。
import 'katex/dist/katex.min.css';
import { BrandGraphIcon } from '../ui/BrandGraphIcon';
import { ResizablePanelGroup } from '../ui/ResizablePanelGroup';
import { ConversationPanel } from './ConversationPanel';

// 按参考图设置默认比例：详情约占四分之三、提问区约占四分之一；仍可拖动调整。
const RIGHT_PANEL_INITIAL_SIZES = [75, 25];

// 笔记中的行内 \frac 过于紧凑，会使分母贴近分数线；只在渲染时采用间距更大的 \dfrac。
// 不修改已保存的笔记文本，公式的整体字号仍由 index.css 中的 .mt-note-markdown .katex 控制。
const NOTE_KATEX_OPTIONS = { macros: { '\\frac': '\\dfrac' } };

export const ChatPanel: React.FC = () => {
  const { currentFocusNode, currentTree, noteLoading, noteErrors, generateNote } = useKnowledgeStore();
  const focusNode = currentFocusNode();
  const tree = currentTree();

  return (
    // 视觉统一：右侧详情面板沿用工作台标题、内容卡片和空状态样式，内容渲染不变。
    <div className="flex-1 flex flex-col bg-white min-w-0 h-full">
      {/* 头部显示当前节点信息 */}
      {/* 顶部对齐：详情区也分成 56px 标题栏和节点标题区，与左、中两列的线对齐。 */}
      <div className="mt-panel-header mt-detail-header border-b flex-shrink-0 flex flex-col">
        <div className="mt-topbar h-14 px-5 border-b flex items-center">
          <p className="mt-kicker">知识点详情</p>
        </div>
        <div className="flex-1 px-5 py-4">
          <h3 className="font-semibold text-lg text-[var(--mt-ink)]">
            {focusNode ? focusNode.label : (tree?.root_topic || 'AI学习助手')}
          </h3>
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
        hideDivider
        className="flex-1 min-h-0 bg-[var(--mt-canvas)]"
      >
      <div className="h-full min-h-0 px-5 pt-5 pb-2">
        {focusNode && noteLoading[focusNode.id] ? (
          <div className="mt-detail-card h-full p-5 text-sm text-gray-500" role="status">正在生成并保存学习笔记...</div>
        ) : focusNode && noteErrors[focusNode.id] ? (
          <div className="mt-detail-card h-full p-5 text-sm text-red-700" role="alert">
            {noteErrors[focusNode.id]}
            <button className="mt-soft-button ml-2 px-3 py-1" onClick={() => tree && void generateNote(focusNode.id, tree.id)}>重试</button>
          </div>
        ) : focusNode?.content ? (
          <div className="mt-detail-card h-full flex flex-col min-h-0 overflow-hidden">
            {/* Markdown内容区域 */}
            <div className="flex-1 overflow-auto p-5">
              <div className="prose prose-sm max-w-none mt-note-markdown">
                {/* 将 $...$ 和独占一行的 $$...$$ 解析并渲染为公式，保留原有 Markdown 样式。 */}
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[[rehypeKatex, NOTE_KATEX_OPTIONS]]}
                  components={{
                    // 自定义Markdown组件样式
                    h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-4 mb-3 text-gray-800" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-lg font-semibold mt-3 mb-2 text-gray-800" {...props} />,
                    h4: ({node, ...props}) => <h4 className="text-sm font-semibold mt-2 mb-2 text-gray-800" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-base font-medium mt-2 mb-2 text-gray-800" {...props} />,
                    p: ({node, ...props}) => <p className="mb-2 text-gray-700 leading-relaxed" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc list-inside mb-2 space-y-1" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />,
                    li: ({node, ...props}) => <li className="text-gray-700" {...props} />,
                    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-300 pl-3 italic text-gray-600 my-2" {...props} />,
                    code: ({node, className, children, ...props}) => {
                      // 通过 className 判断是否是行内代码
                      const isInline = !className;
                      return isInline ? (
                        <code className="bg-gray-200 px-1 py-0.5 rounded text-sm font-mono" {...props}>
                          {children}
                        </code>
                      ) : (
                        <code className="block bg-gray-200 p-2 rounded text-sm font-mono my-2 overflow-x-auto" {...props}>
                          {children}
                        </code>
                      );
                    },
                    pre: ({node, ...props}) => <pre className="bg-gray-200 p-2 rounded text-sm font-mono my-2 overflow-x-auto" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-semibold text-gray-800" {...props} />,
                    em: ({node, ...props}) => <em className="italic text-gray-700" {...props} />,
                    a: ({node, ...props}) => <a className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                  }}
                >
                  {focusNode.content}
                </ReactMarkdown>
              </div>
            </div>
            
            {/* 底部状态栏 */}
            <div className="border-t border-[var(--mt-border)] bg-white px-5 py-2 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Markdown格式
              </span>
              {focusNode.content.length > 1000 && (
                <span className="text-xs text-gray-500">
                  {Math.ceil(focusNode.content.length / 1000)}k 字符
                </span>
              )}
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
        {/* 前端对话：按知识树和焦点节点分组，不接入后端或生成模拟回答。 */}
        <ConversationPanel
          contextKey={`${tree?.id ?? 'none'}:${focusNode?.id ?? 'general'}`}
          contextLabel={focusNode?.label ?? tree?.root_topic ?? '当前主题'}
          hasSelectedNode={Boolean(focusNode)}
        />
      </div>
      </ResizablePanelGroup>
    </div>
  );
};
