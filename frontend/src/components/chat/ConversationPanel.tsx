import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';

interface ConversationMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationPanelProps {
  contextKey: string;
  contextLabel: string;
  hasSelectedNode: boolean;
}

// 右侧对话卡片：沿用节点详情的圆角、边框和左右对齐方式。
export function ConversationPanel({ contextKey, contextLabel, hasSelectedNode }: ConversationPanelProps) {
  const [messagesByContext, setMessagesByContext] = useState<Record<string, ConversationMessage[]>>({});
  const [draft, setDraft] = useState('');
  const nextMessageId = useRef(0);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const messages = messagesByContext[contextKey] ?? [];

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
  }, [draft, resizeInput]);

  // 拖动详情与对话之间的分界区时，同步更新输入框高度上限。
  useEffect(() => {
    if (!panelRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(resizeInput);
    observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, [resizeInput]);

  // 切换知识点时保留各自的页面内消息，清空尚未发送的输入。
  useEffect(() => {
    setDraft('');
  }, [contextKey]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: 'end' });
  }, [contextKey, messages.length]);

  const sendMessage = () => {
    const content = draft.trim();
    if (!content) return;

    // 只在组件状态中追加用户消息；此处不调用接口，也不伪造 AI 回复。
    const message: ConversationMessage = { id: ++nextMessageId.current, role: 'user', content };
    setMessagesByContext(previous => ({
      ...previous,
      [contextKey]: [...(previous[contextKey] ?? []), message],
    }));
    setDraft('');
  };

  return (
    // 去掉原来的标题栏，卡片本身填满下方可拖动区域，四角与详情卡片一致。
    <section ref={panelRef} className="mt-detail-card h-full flex flex-col min-h-0 overflow-hidden" aria-label="AI 对话">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3" role="log" aria-label="对话消息">
        {/* 按标注移除默认的 AI 提示气泡，只展示实际发送的对话消息。 */}
        {messages.map(message => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`mt-chat-bubble max-w-[88%] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
              message.role === 'user' ? 'mt-chat-bubble-user' : 'mt-chat-bubble-assistant'
            }`}>
              {message.content}
            </div>
          </div>
        ))}
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
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              sendMessage();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={hasSelectedNode ? `向 AI 提问：${contextLabel}` : '输入你想了解的问题...'}
          className="mt-input w-full min-h-0 flex-none px-3 py-2 text-sm leading-6 resize-none"
        />
        {/* 操作行不随输入框增高而收缩，始终完整显示在卡片底部。 */}
        <div ref={actionsRef} className="flex shrink-0 items-center justify-between gap-3 mt-1.5">
          {/* 底部文字按标注改为“AI 助手”，不改变目前仅在前端保存消息的行为。 */}
          <p className="mt-muted text-xs">AI 助手</p>
          <button type="submit" disabled={!draft.trim()} className="mt-primary-button flex items-center gap-1.5 px-3 py-1.5 text-sm flex-shrink-0">
            <PaperAirplaneIcon className="w-4 h-4" />
            发送
          </button>
        </div>
      </form>
    </section>
  );
}
