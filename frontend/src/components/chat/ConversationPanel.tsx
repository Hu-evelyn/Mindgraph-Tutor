import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { knowledgeApi } from '../../services/api';
import type { TutorChatTurn } from '../../services/api';

interface ConversationMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationPanelProps {
  contextKey: string;
  contextLabel: string;
  hasSelectedNode: boolean;
  treeId: number | null;
  nodeId: number | null;
  onConversationStart: () => void;
}

// 右侧对话卡片：沿用节点详情的圆角、边框和左右对齐方式。
export function ConversationPanel({ contextKey, contextLabel, hasSelectedNode, treeId, nodeId, onConversationStart }: ConversationPanelProps) {
  const [messagesByContext, setMessagesByContext] = useState<Record<string, ConversationMessage[]>>({});
  // 每棵树/每个节点独立保存消息、输入草稿和请求状态；切换节点不会串话。
  const [draftsByContext, setDraftsByContext] = useState<Record<string, string>>({});
  const [pendingByContext, setPendingByContext] = useState<Record<string, boolean>>({});
  const [errorsByContext, setErrorsByContext] = useState<Record<string, string>>({});
  const inFlightContexts = useRef(new Set<string>());
  const nextMessageId = useRef(0);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const messages = messagesByContext[contextKey] ?? [];
  const draft = draftsByContext[contextKey] ?? '';
  const isSending = pendingByContext[contextKey] ?? false;
  const error = errorsByContext[contextKey];

  // 按真实内容测量高度，并从卡片高度中扣除固定操作行；输入框增长只占用上方消息区。
  const resizeInput = useCallback(() => {
    const panel = panelRef.current;
    const form = formRef.current;
    const input = inputRef.current;
    const actions = actionsRef.current;
    if (!panel || !form || !input || !actions) return;

    const formStyle = getComputedStyle(form);
    const actionsStyle = getComputedStyle(actions);
    const fixedHeight = actions.offsetHeight
      + parseFloat(formStyle.paddingTop)
      + parseFloat(formStyle.paddingBottom)
      + parseFloat(actionsStyle.marginTop);
    const spaceAfterActions = Math.max(0, panel.clientHeight - fixedHeight);
    const messageSpace = Math.min(48, Math.max(0, spaceAfterActions - 42));
    const maxHeight = Math.max(42, Math.min(160, Math.floor(panel.clientHeight * 0.45), spaceAfterActions - messageSpace));

    // 临时收起输入框以读取完整换行高度，避免 flex 收缩造成滚动条和高度计算错误。
    input.style.overflowY = 'hidden';
    input.style.height = '0px';
    const borderHeight = input.offsetHeight - input.clientHeight;
    const contentHeight = input.scrollHeight + borderHeight;
    input.style.height = `${Math.min(Math.max(contentHeight, 42), maxHeight)}px`;
    if (contentHeight <= maxHeight) input.scrollTop = 0;
    // 到达高度上限后才在输入框内滚动，空白单行不会出现滚动条。
    input.style.overflowY = contentHeight > maxHeight + 1 ? 'auto' : 'hidden';
  }, []);

  useLayoutEffect(() => {
    resizeInput();
  }, [contextKey, draft, resizeInput]);

  // 拖动详情与对话之间的分界区时，同步更新输入框高度上限。
  useEffect(() => {
    if (!panelRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(resizeInput);
    observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, [resizeInput]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: 'end' });
  }, [contextKey, messages.length, isSending, error]);

  const sendMessage = () => {
    const content = draft.trim();
    if (!content || treeId === null || inFlightContexts.current.has(contextKey)) return;

    // 第一次有效提问即扩大回答区域，让等待提示与后续回复有足够的可见空间。
    onConversationStart();

    // 只把当前节点最近已完成的10条消息作为历史传给后端；节点名称与笔记由后端按 ID 查询。
    const history: TutorChatTurn[] = messages.slice(-10).map(message => ({
      role: message.role,
      content: message.content.slice(0, 4000),
    }));
    const requestContext = contextKey;
    const message: ConversationMessage = { id: ++nextMessageId.current, role: 'user', content };
    inFlightContexts.current.add(requestContext);
    setPendingByContext(previous => ({ ...previous, [requestContext]: true }));
    setErrorsByContext(previous => ({ ...previous, [requestContext]: '' }));
    setMessagesByContext(previous => ({
      ...previous,
      [requestContext]: [...(previous[requestContext] ?? []), message],
    }));
    setDraftsByContext(previous => ({ ...previous, [requestContext]: '' }));

    void knowledgeApi.askTutor(treeId, nodeId, content, history)
      .then(({ answer }) => {
        if (!answer?.trim()) throw new Error('AI 没有返回有效回复，请重试');
        setMessagesByContext(previous => ({
          ...previous,
          [requestContext]: [...(previous[requestContext] ?? []), {
            id: ++nextMessageId.current,
            role: 'assistant',
            content: answer,
          }],
        }));
      })
      .catch(requestError => {
        // 发送失败时撤回本次用户气泡并恢复输入，避免重试时把失败的问题重复传入历史。
        setMessagesByContext(previous => ({
          ...previous,
          [requestContext]: (previous[requestContext] ?? []).filter(item => item.id !== message.id),
        }));
        setDraftsByContext(previous => ({ ...previous, [requestContext]: previous[requestContext] || content }));
        setErrorsByContext(previous => ({
          ...previous,
          [requestContext]: requestError instanceof Error ? requestError.message : '回复失败，请重试',
        }));
      })
      .finally(() => {
        inFlightContexts.current.delete(requestContext);
        setPendingByContext(previous => ({ ...previous, [requestContext]: false }));
      });
  };

  return (
    // 去掉原来的标题栏，卡片本身填满下方可拖动区域，四角与详情卡片一致。
    <section ref={panelRef} className="mt-detail-card h-full flex flex-col min-h-0 overflow-hidden" aria-label="AI 对话">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3" role="log" aria-label="对话消息">
        {/* 只展示实际发送的消息；AI 回复支持 Markdown 与公式，便于阅读知识点解释。 */}
        {messages.map(message => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`mt-chat-bubble max-w-[88%] px-3 py-2 text-sm leading-relaxed break-words ${
              message.role === 'user' ? 'mt-chat-bubble-user' : 'mt-chat-bubble-assistant'
            }`}>
              {message.role === 'user' ? (
                <span className="whitespace-pre-wrap">{message.content}</span>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc pl-5 my-2" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal pl-5 my-2" {...props} />,
                    a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" className="text-blue-600 underline" {...props} />,
                  }}
                >{message.content}</ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex justify-start" role="status">
            <div className="mt-chat-bubble mt-chat-bubble-assistant px-3 py-2 text-sm">AI 正在回答...</div>
          </div>
        )}
        {error && <p className="text-xs text-red-600" role="alert">{error}，请重新发送</p>}
        <div ref={messageEndRef} />
      </div>

      <form
        ref={formRef}
        // 表单贴着卡片底部；输入框增高时只压缩上方消息区，不压缩下方操作行。
        className="flex flex-col shrink-0 min-h-0 px-4 pt-2 pb-3"
        onSubmit={event => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <label htmlFor="tutor-chat-input" className="sr-only">输入要向 AI 提出的问题</label>
        {/* 默认一行；折行后自动增高，达到卡片内的高度上限才显示内部滚动条。 */}
        <textarea
          ref={inputRef}
          id="tutor-chat-input"
          value={draft}
          onChange={event => {
            const value = event.target.value;
            setDraftsByContext(previous => ({ ...previous, [contextKey]: value }));
          }}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              sendMessage();
            }
          }}
          rows={1}
          maxLength={2000}
          disabled={treeId === null || isSending}
          placeholder={treeId === null ? '请先选择知识树' : hasSelectedNode ? `向 AI 提问：${contextLabel}` : '输入你想了解的问题...'}
          className="mt-input w-full min-h-0 flex-none px-3 py-2 text-sm leading-6 resize-none"
        />
        {/* 操作行不随输入框增高而收缩，始终完整显示在卡片底部。 */}
        <div ref={actionsRef} className="flex shrink-0 items-center justify-between gap-3 mt-1.5">
          {/* 保持原有操作行布局；发送状态仅控制按钮，不影响卡片拖动和输入框高度。 */}
          <p className="mt-muted text-xs">AI 助手</p>
          <button type="submit" disabled={!draft.trim() || treeId === null || isSending} className="mt-primary-button flex items-center gap-1.5 px-3 py-1.5 text-sm flex-shrink-0">
            <PaperAirplaneIcon className="w-4 h-4" />
            {isSending ? '发送中' : '发送'}
          </button>
        </div>
      </form>
    </section>
  );
}
