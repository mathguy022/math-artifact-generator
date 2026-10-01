import { Send, Loader2, Bot, User } from 'lucide-react';
import { useRef, useEffect } from 'react';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

interface Props {
  messages: ChatMessage[];
  onSend: (msg: string) => Promise<void>;
  isLoading: boolean;
}

export default function ChatPanel({ messages, onSend, isLoading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = inputRef.current?.value.trim();
    if (!text || isLoading) return;
    inputRef.current!.value = '';
    await onSend(text);
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-brand-600 to-brand-700 text-white flex items-center gap-2">
        <Bot size={18} />
        <h3 className="font-semibold">Iterative Chat Editor</h3>
        {isLoading && <Loader2 size={14} className="ml-auto animate-spin" />}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin bg-slate-50"
      >
        {messages.length === 0 && (
          <div className="text-center text-slate-400 text-sm py-8">
            Once an artifact is generated, send edits here like
            <br />
            <em>&quot;Make the quiz harder&quot;</em> or <em>&quot;Add a section on limits&quot;</em>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                <Bot size={14} className="text-brand-700" />
              </div>
            )}
            <div
              className={`max-w-[80%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-sm'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
              }`}
            >
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                <User size={14} className="text-slate-700" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-2 items-center text-slate-400 text-xs">
            <Loader2 size={12} className="animate-spin" />
            <span>Thinking...</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 bg-white flex gap-2">
        <input
          ref={inputRef}
          type="text"
          disabled={isLoading}
          placeholder="Describe an edit..."
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
