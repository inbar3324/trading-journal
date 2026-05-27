// Client-side mentor chat history, persisted in localStorage under `tj_mentor_chats`.

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

const STORAGE_KEY = 'tj_mentor_chats';

export function loadChats(): Chat[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const chats = JSON.parse(raw) as Chat[];
    return Array.isArray(chats) ? chats.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

export function saveChats(chats: Chat[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    /* quota / serialization — ignore */
  }
}

export function newChatId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Derives a short title from the first user message.
export function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content?.trim();
  if (!first) return 'שיחה חדשה';
  return first.length > 38 ? `${first.slice(0, 38)}…` : first;
}

// Upserts a chat into the list and returns the new sorted list.
export function upsertChat(chats: Chat[], chat: Chat): Chat[] {
  const others = chats.filter((c) => c.id !== chat.id);
  return [chat, ...others].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteChat(chats: Chat[], id: string): Chat[] {
  return chats.filter((c) => c.id !== id);
}
