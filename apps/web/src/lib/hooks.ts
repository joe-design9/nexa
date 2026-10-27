'use client';
import { useEffect, useRef, useState } from 'react';
import { getSocket } from './socket';
import { useStore } from './store';
import type { Message } from './types';
import { get, post } from './api';

// Nachrichten eines Kanals: Cursor-Pagination + Socket-Merge.
export function useMessages(channelId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(channelId);
  idRef.current = channelId;

  useEffect(() => {
    if (!channelId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    get<unknown>(`/channels/${channelId}/messages?limit=50`)
      .then((data) => {
        if (cancelled || idRef.current !== channelId) return;
        const arr = extractMessages(data);
        setMessages(arr);
        setHasMore(arr.length >= 50);
        void post(`/channels/${channelId}/read`, {}).catch(() => undefined);
        useStore.getState().clearRead(channelId);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  useEffect(() => {
    if (!channelId) return;
    const s = getSocket();
    const onCreate = (m: Message) => {
      if (m.channelId !== channelId) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      if (m.authorId !== useStore.getState().user?.id) {
        void post(`/channels/${channelId}/read`, {}).catch(() => undefined);
      }
    };
    const onUpdate = (m: Message) => {
      if (m.channelId !== channelId) return;
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
    };
    const onDelete = (payload: { id?: string; messageId?: string; channelId?: string }) => {
      const mid = payload.id || payload.messageId;
      if (!mid) return;
      setMessages((prev) => prev.map((x) => (x.id === mid ? { ...x, deletedAt: new Date().toISOString(), content: '' } : x)));
    };
    const onReaction = (payload: { messageId: string; reactions?: Message['reactions'] }) => {
      if (!payload.messageId) return;
      setMessages((prev) => prev.map((x) => (x.id === payload.messageId && payload.reactions ? { ...x, reactions: payload.reactions } : x)));
    };
    s.on('message:create', onCreate);
    s.on('message:update', onUpdate);
    s.on('message:delete', onDelete);
    s.on('reaction:add', onReaction);
    s.on('reaction:remove', onReaction);
    return () => {
      s.off('message:create', onCreate);
      s.off('message:update', onUpdate);
      s.off('message:delete', onDelete);
      s.off('reaction:add', onReaction);
      s.off('reaction:remove', onReaction);
    };
  }, [channelId]);

  const loadOlder = async () => {
    if (!channelId || !messages.length || loading) return;
    setLoading(true);
    try {
      const data = await get<unknown>(`/channels/${channelId}/messages?limit=50&before=${encodeURIComponent(messages[0].id)}`);
      const arr = extractMessages(data);
      setMessages((prev) => [...arr.filter((m) => !prev.some((x) => x.id === m.id)), ...prev]);
      setHasMore(arr.length >= 50);
    } catch {
      /* still */
    } finally {
      setLoading(false);
    }
  };

  const appendLocal = (m: Message) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  const replaceMessage = (m: Message) => setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));

  return { messages, loading, hasMore, error, loadOlder, appendLocal, replaceMessage, setMessages };
}

export function extractMessages(data: unknown): Message[] {
  if (Array.isArray(data)) return data as Message[];
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.messages)) return o.messages as Message[];
    if (Array.isArray(o.items)) return o.items as Message[];
    if (Array.isArray(o.data)) return o.data as Message[];
  }
  return [];
}

export function extractList<T>(data: unknown, key?: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const k of [key, 'items', 'data', 'results', 'servers', 'channels', 'members', 'users', 'friends', 'notifications', 'roles', 'categories'].filter(Boolean) as string[]) {
      if (Array.isArray(o[k])) return o[k] as T[];
    }
  }
  return [];
}

// "X schreibt gerade …" – sammelt typing:update-Events pro Kanal.
export function useTyping(channelId: string | null): string[] {
  const [typers, setTypers] = useState<Record<string, number>>({});
  const me = useStore((s) => s.user);
  useEffect(() => {
    if (!channelId) return;
    const s = getSocket();
    const onTyping = (p: { channelId: string; userId: string; typing?: boolean; isTyping?: boolean }) => {
      if (p.channelId !== channelId || p.userId === me?.id) return;
      setTypers((prev) => {
        const next = { ...prev };
        if (p.typing === false || p.isTyping === false) delete next[p.userId];
        else next[p.userId] = Date.now();
        return next;
      });
    };
    s.on('typing:update', onTyping);
    const iv = setInterval(() => {
      setTypers((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, ts]) => now - ts < 5000));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 2000);
    return () => {
      s.off('typing:update', onTyping);
      clearInterval(iv);
    };
  }, [channelId, me?.id]);
  return Object.keys(typers);
}

// Globale Socket-Handler: Presence, Voice-States, Server-/Member-Events, Benachrichtigungen.
export function useGlobalSocket() {
  const setPresence = useStore((s) => s.setPresence);
  const setVoiceStates = useStore((s) => s.setVoiceStates);
  const addNotification = useStore((s) => s.addNotification);
  const upsertServer = useStore((s) => s.upsertServer);
  const removeServer = useStore((s) => s.removeServer);
  const bumpMention = useStore((s) => s.bumpMention);

  useEffect(() => {
    const s = getSocket();
    const onPresence = (p: { userId: string; status: string; customStatusText?: string | null }) => {
      if (p.userId) setPresence(p.userId, { status: p.status, customStatusText: p.customStatusText });
    };
    const onVoice = (p: { channelId: string; states?: import('./types').VoiceState[]; userId?: string }) => {
      if (p.channelId && Array.isArray(p.states)) setVoiceStates(p.channelId, p.states);
    };
    const onNotif = (n: import('./types').AppNotification) => addNotification(n);
    const onServerUpdate = (srv: import('./types').Server) => { if (srv?.id) upsertServer(srv); };
    const onMsgCreate = (m: Message) => {
      const st = useStore.getState();
      if (m.channelId !== st.activeChannelId && m.authorId !== st.user?.id) {
        const mentioned = (m as unknown as Record<string, unknown>).mentionEveryone === true;
        if (mentioned) bumpMention(m.channelId);
      }
    };
    const onMemberLeave = (p: { serverId?: string; userId?: string }) => {
      const st = useStore.getState();
      if (p.userId && p.userId === st.user?.id && p.serverId) removeServer(p.serverId);
    };
    s.on('presence:update', onPresence);
    s.on('voice:update', onVoice);
    s.on('notification:new', onNotif);
    s.on('server:update', onServerUpdate);
    s.on('message:create', onMsgCreate);
    s.on('member:leave', onMemberLeave);
    return () => {
      s.off('presence:update', onPresence);
      s.off('voice:update', onVoice);
      s.off('notification:new', onNotif);
      s.off('server:update', onServerUpdate);
      s.off('message:create', onMsgCreate);
      s.off('member:leave', onMemberLeave);
    };
  }, [setPresence, setVoiceStates, addNotification, upsertServer, removeServer, bumpMention]);
}
