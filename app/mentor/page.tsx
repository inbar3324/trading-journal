'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Plus, Send, Trash2, MessageSquare } from 'lucide-react';
import { getNotionConfig, notionHeaders } from '@/lib/notion-config';
import {
  loadChats, saveChats, newChatId, deriveTitle, upsertChat, deleteChat,
  type Chat, type ChatMessage,
} from '@/lib/mentor-history';

const SUGGESTIONS = [
  'מה הטעות שחוזרת אצלי הכי הרבה ביומן?',
  'איך נראה השבוע האחרון שלי?',
  'מה זה order block ואיך נכנסים עליו?',
  'איך מתמודדים עם נקמה אחרי הפסד?',
];

// Lightweight markdown renderer (## headings + **bold**), RTL — same style family as Recap.
function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div dir="rtl" style={{ textAlign: 'right', lineHeight: 1.8 }}>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <div key={i} className="mt-4 mb-2 first:mt-0" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: 5 }}>
              <span className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                {line.replace('## ', '')}
              </span>
            </div>
          );
        }
        if (line.trim() === '' || line.startsWith('---')) return <div key={i} className="h-2" />;
        const bullet = /^\s*[-•]\s+/.test(line);
        const content = bullet ? line.replace(/^\s*[-•]\s+/, '') : line;
        const parts = content.split(/(\*\*[^*]+\*\*)/g);
        const rendered = parts.map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j} style={{ color: 'var(--text-primary)' }}>{part.slice(2, -2)}</strong>
            : <span key={j}>{part}</span>,
        );
        return (
          <div key={i} className="text-sm mb-1" style={{ color: 'var(--text-primary)', paddingRight: bullet ? 14 : 0, position: 'relative' }}>
            {bullet && <span style={{ position: 'absolute', right: 0, color: 'var(--blue)' }}>•</span>}
            {rendered}
          </div>
        );
      })}
    </div>
  );
}

export default function MentorPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setChats(loadChats()); }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  function persist(id: string, msgs: ChatMessage[]) {
    const chat: Chat = { id, title: deriveTitle(msgs), messages: msgs, updatedAt: Date.now() };
    setChats((prev) => { const next = upsertChat(prev, chat); saveChats(next); return next; });
  }

  function startNewChat() {
    setActiveId(null);
    setMessages([]);
    setInput('');
    setError(null);
    taRef.current?.focus();
  }

  function openChat(c: Chat) {
    setActiveId(c.id);
    setMessages(c.messages);
    setError(null);
  }

  function removeChat(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setChats((prev) => { const next = deleteChat(prev, id); saveChats(next); return next; });
    if (activeId === id) startNewChat();
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || streaming) return;

    const id = activeId ?? newChatId();
    if (!activeId) setActiveId(id);

    const userMsg: ChatMessage = { role: 'user', content: question };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInput('');
    setError(null);
    setStreaming(true);

    // Placeholder model message we stream into.
    setMessages([...withUser, { role: 'model', content: '' }]);

    try {
      const res = await fetch('/api/mentor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...notionHeaders(getNotionConfig()) },
        body: JSON.stringify({ messages: withUser }),
      });

      if (!res.ok || !res.body) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j.error) msg = j.error; } catch { /* ignore */ }
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...withUser, { role: 'model', content: acc }]);
      }
      const final = [...withUser, { role: 'model' as const, content: acc || '(אין תשובה)' }];
      setMessages(final);
      persist(id, final);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'שגיאה';
      setError(errMsg);
      setMessages(withUser);
    } finally {
      setStreaming(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex" style={{ height: 'calc(100dvh - 48px - env(safe-area-inset-top))' }}>
      {/* Chat history sidebar */}
      <aside
        className="hidden lg:flex flex-col w-[230px] shrink-0"
        style={{ borderLeft: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
      >
        <div className="p-3">
          <button
            onClick={startNewChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'var(--blue)', color: 'white', border: 'none', cursor: 'pointer', transition: 'all 160ms var(--ease-out)' }}
          >
            <Plus size={15} /> שיחה חדשה
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
          {chats.length === 0 && (
            <div className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>אין שיחות עדיין</div>
          )}
          {chats.map((c) => {
            const active = c.id === activeId;
            return (
              <div
                key={c.id}
                onClick={() => openChat(c)}
                className="group flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm cursor-pointer"
                style={{
                  background: active ? 'var(--sidebar-item-active-bg)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: `1px solid ${active ? 'var(--border-hover)' : 'transparent'}`,
                  transition: 'all 140ms var(--ease-out)',
                }}
                dir="rtl"
              >
                <MessageSquare size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                <span className="flex-1 truncate">{c.title}</span>
                <button
                  onClick={(e) => removeChat(c.id, e)}
                  className="opacity-0 group-hover:opacity-100"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}
                  title="מחק"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center rounded-lg" style={{ width: 30, height: 30, background: 'var(--purple-dim)', border: '1px solid rgba(124,58,237,0.28)' }}>
              <Sparkles size={16} style={{ color: 'var(--purple)' }} />
            </div>
            <div>
              <div className="font-bold" style={{ fontSize: 15, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Mentor</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>מנטור מסחר AI · מכיר את היומן שלך</div>
            </div>
          </div>
          <button
            onClick={startNewChat}
            className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', cursor: 'pointer' }}
          >
            <Plus size={13} /> חדש
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
          {empty ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 max-w-xl mx-auto text-center">
              <div className="flex items-center justify-center rounded-2xl" style={{ width: 56, height: 56, background: 'var(--purple-dim)', border: '1px solid rgba(124,58,237,0.28)' }}>
                <Sparkles size={26} style={{ color: 'var(--purple)' }} />
              </div>
              <div>
                <div className="font-bold" style={{ fontSize: 19, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>איך אפשר לעזור?</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                  שאל כל שאלה טכנית או מנטלית על מסחר — או בקש ממני לעבור על היומן שלך.
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    dir="rtl"
                    className="text-right px-3.5 py-3 rounded-xl text-sm"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 140ms var(--ease-out)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                  {m.role === 'user' ? (
                    <div
                      dir="rtl"
                      className="px-4 py-2.5 rounded-2xl text-sm max-w-[85%]"
                      style={{ background: 'var(--blue)', color: 'white', borderTopRightRadius: 6, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
                    >
                      {m.content}
                    </div>
                  ) : (
                    <div
                      className="px-4 py-3 rounded-2xl max-w-[88%]"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderTopLeftRadius: 6, minWidth: 60 }}
                    >
                      {m.content
                        ? <Markdown text={m.content} />
                        : <div className="flex gap-1.5 py-1">
                            {[0, 1, 2].map((d) => (
                              <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--purple)', opacity: 0.7, animation: `pulse-dot 1.2s ease-in-out ${d * 0.2}s infinite` }} />
                            ))}
                          </div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="px-4 pb-4 pt-2">
          {error && (
            <div className="max-w-3xl mx-auto mb-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.2)' }}>
              שגיאה: {error}
            </div>
          )}
          <div
            className="max-w-3xl mx-auto flex items-end gap-2 p-2 rounded-2xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="שאל את המנטור..."
              rows={1}
              dir="rtl"
              className="flex-1 bg-transparent outline-none resize-none text-sm px-2 py-2"
              style={{ color: 'var(--text-primary)', maxHeight: 160, lineHeight: 1.6 }}
            />
            <button
              onClick={() => send(input)}
              disabled={streaming || !input.trim()}
              className="flex items-center justify-center rounded-xl shrink-0"
              style={{
                width: 38, height: 38,
                background: streaming || !input.trim() ? 'var(--bg-surface)' : 'var(--blue)',
                color: streaming || !input.trim() ? 'var(--text-muted)' : 'white',
                border: 'none',
                cursor: streaming || !input.trim() ? 'default' : 'pointer',
                transition: 'all 160ms var(--ease-out)',
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
