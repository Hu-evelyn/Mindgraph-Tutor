// 右侧面板 - 显示当前选中节点的详细内容，支持Markdown渲染和滚动
import React from 'react';
import { useKnowledgeStore } from '../../stores/useKnowledgeStore';
import ReactMarkdown from 'react-markdown';

export const ChatPanel: React.FC = () => {
  const { currentFocusNode, currentTree } = useKnowledgeStore();
  const focusNode = currentFocusNode();
  const tree = currentTree();

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0 h-full">
      {/* 头部显示当前节点信息 */}
      <div className="p-4 border-b flex-shrink-0">
        <h3 className="font-semibold text-lg text-gray-800">
          {focusNode ? focusNode.label : (tree?.root_topic || 'AI学习助手')}
        </h3>
        {focusNode?.content && (
          <p className="text-sm text-gray-500 mt-1">
            节点内容 ({focusNode.content.length} 字符)
          </p>
        )}
      </div>
      
      {/* 节点内容区域 - 支持Markdown和滚动 */}
      <div className="flex-1 flex flex-col min-h-0 p-4">
        {focusNode?.content ? (
          <div className="flex-1 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
            {/* Markdown内容区域 */}
            <div className="flex-1 overflow-auto p-4">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    // 自定义Markdown组件样式
                    h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-4 mb-3 text-gray-800" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-lg font-semibold mt-3 mb-2 text-gray-800" {...props} />,
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
            <div className="border-t border-gray-200 bg-white px-4 py-2 flex items-center justify-between">
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
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
            <div className="text-center p-6">
              <div className="text-4xl mb-3">📚</div>
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
    </div>
  );
};