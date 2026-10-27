'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { get, post, patch, del, put, uploadFile, ApiError } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useMessages, useTyping, extractList } from '../lib/hooks';
import { useStore } from '../lib/store';
import { renderMarkdownSafe } from '../lib/shared';
import { useLocale } from '../lib/locale';
import type { Channel, Message, PublicUser, Member, Role } from '../lib/types';
import { displayNameOf, fmtBytes, fmtDate, fmtTime } from '../lib/types';
import { Avatar, UserBadgesInline, VerifiedBadge } from './ui';

const EMOJIS = ['😀', '😂', '😍', '👍', '👎', '❤️', '🔥', '🎉', '😮', '😢', '😡', '🙏', '👀', '💯', '🚀', '✅', '❌', '⭐', '🍕', '🎮', '🐸', '💜', '🤔', '🥳'];

export interface ServerEmoji { id: string; name: string; imageUrl: string }

export function ChatView({
  channel,
  serverId,
  isDm = false,
  onOpenChannelSettings,
  headerExtra,
}: {
  channel: Channel;
  serverId?: string | null;
  isDm?: boolean;
  onOpenChannelSettings?: (ch: Channel) => void;
  headerExtra?: React.ReactNode;
}) {
  const { t, fmt } = useLocale();
  const me = useStore((s) => s.user);
  const setMemberListOpen = useStore((s) => s.setMemberListOpen);
  const memberListOpen = useStore((s) => s.memberListOpen);
  const { messages, loading, hasMore, error, loadOlder, appendLocal, replaceMessage } = useMessages(channel.id);
  const typers = useTyping(channel.id);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [pins, setPins] = useState<Message[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [gateNotice, setGateNotice] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    getSocket().emit('joinChannel', channel.id);
    return () => {
      getSocket().emit('leaveChannel', channel.id);
    };
  }, [channel.id]);

  useEffect(() => {
    if (stickRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, channel.id]);

  useEffect(() => {
    setReplyTo(null);
    setPins(null);
    setGateNotice(null);
    stickRef.current = true;
  }, [channel.id]);

  // Namen der Schreibenden auflösen
  useEffect(() => {
    const missing = typers.filter((id) => !userNames[id]);
    if (!missing.length) return;
    missing.forEach((id) => {
      get<PublicUser>(`/users/${id}`).then((u) => setUserNames((p) => ({ ...p, [id]: displayNameOf(u) }))).catch(() => setUserNames((p) => ({ ...p, [id]: t.chat.someone })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typers.join(',')]);

  const serverEmojis = useServerEmojis(serverId);

  const loadPins = async () => {
    if (pins) {
      setPins(null);
      return;
    }
    try {
      const data = await get<unknown>(`/channels/${channel.id}/pins`);
      setPins(extractList<Message>(data, 'messages'));
    } catch {
      setPins([]);
    }
  };

  const doSearch = async (q: string): Promise<Message[]> => {
    const data = await get<unknown>(`/channels/${channel.id}/messages/search?q=${encodeURIComponent(q)}`);
    return extractList<Message>(data, 'messages');
  };

  return (
    <div className="flex flex-1 min-w-0 flex-col bg-nexa-bg h-full">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-nexa-border px-3 md:px-4">
        <ChannelTypeIcon type={channel.type} size={20} />
        <span className="font-bold truncate">{channel.name}</span>
        {channel.topic && <span className="hidden md:block truncate text-sm text-nexa-muted border-l border-nexa-border pl-3">{channel.topic}</span>}
        <div className="ml-auto flex items-center gap-1">
          {headerExtra}
          {onOpenChannelSettings && (
            <IconButton title={t.chat.channelSettings} onClick={() => onOpenChannelSettings(channel)}>⚙️</IconButton>
          )}
          <IconButton title={t.chat.pinnedMessages} onClick={loadPins}>📌</IconButton>
          <IconButton title={t.chat.searchInChannel} onClick={() => setSearchOpen((v) => !v)}>🔍</IconButton>
          {!isDm && (
            <IconButton title={t.chat.toggleMemberList} onClick={() => setMemberListOpen(!memberListOpen)}>👥</IconButton>
          )}
        </div>
      </header>

      {searchOpen && <ChannelSearch onSearch={doSearch} onClose={() => setSearchOpen(false)} />}

      {pins !== null && (
        <div className="shrink-0 border-b border-nexa-border bg-nexa-panel px-4 py-2 max-h-56 overflow-y-auto">
          <div className="text-xs font-semibold uppercase text-nexa-muted mb-1">{fmt(t.chat.pinnedCount, { count: pins.length })}</div>
          {pins.length === 0 && <div className="text-sm text-nexa-muted">{t.chat.noPins}</div>}
          {pins.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-2 py-1 text-sm">
              <span className="truncate"><b>{displayNameOf(p.author)}</b>: {p.content || t.chat.attachmentFallback}</span>
              <button
                className="text-nexa-muted hover:text-nexa-danger text-xs"
                onClick={async () => {
                  await del(`/messages/${p.id}/pin`).catch(() => undefined);
                  setPins(pins.filter((x) => x.id !== p.id));
                }}
              >{t.chat.unpin}</button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="shrink-0 bg-nexa-danger/15 text-red-300 text-sm px-4 py-2">{error}</div>}

      {/* Nachrichten */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-2 md:px-4 pb-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          if (el.scrollTop < 80 && hasMore && !loading) {
            const prevH = el.scrollHeight;
            void loadOlder().then(() => requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevH; }));
          }
        }}
      >
        {loading && messages.length === 0 && (
          <div className="space-y-3 py-6" aria-label={t.chat.loadingLabel}>
            {[1, 2, 3, 4].map((i) => (<div key={i} className="h-12 rounded bg-nexa-panel2 animate-pulse" />))}
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="py-16 text-center">
            <div className="text-4xl mb-2">👋</div>
            <div className="font-bold">{fmt(t.chat.welcome, { name: channel.name })}</div>
            <div className="text-sm text-nexa-muted">{t.chat.welcomeHint}</div>
          </div>
        )}
        <MessageRows
          messages={messages}
          meId={me?.id}
          serverEmojis={serverEmojis}
          onReply={setReplyTo}
          onLocalUpdate={replaceMessage}
        />
      </div>

      {/* Schreib-Indikator */}
      <div className="h-6 shrink-0 px-4 text-xs text-nexa-muted flex items-center">
        {typers.length > 0 && (
          <span><b>{typers.map((id) => userNames[id] || t.chat.someone).join(', ')}</b> {typers.length === 1 ? t.chat.typingOne : t.chat.typingMany}</span>
        )}
      </div>

      {gateNotice && (
        <div className="mx-3 mb-2 shrink-0 rounded-lg border border-nexa-warn/50 bg-nexa-warn/10 px-3 py-2 text-sm">
          {gateNotice}{' '}
          <button className="underline font-semibold" onClick={() => setGateNotice(null)}>{t.chat.understood}</button>
        </div>
      )}

      <MessageInput
        channel={channel}
        replyTo={replyTo}
        cancelReply={() => setReplyTo(null)}
        onSent={(m) => {
          appendLocal(m);
          stickRef.current = true;
        }}
        onGate={(msg) => setGateNotice(msg)}
      />
    </div>
  );
}

export function useServerEmojis(serverId?: string | null): ServerEmoji[] {
  const [emojis, setEmojis] = useState<ServerEmoji[]>([]);
  useEffect(() => {
    if (!serverId) return;
    get<unknown>(`/servers/${serverId}`)
      .then((d) => {
        const o = (d && typeof d === 'object' ? (d as Record<string, unknown>) : {}) as Record<string, unknown>;
        if (Array.isArray(o.emojis)) setEmojis(o.emojis as ServerEmoji[]);
      })
      .catch(() => undefined);
  }, [serverId]);
  return emojis;
}

export function ChannelTypeIcon({ type, size = 18 }: { type: string; size?: number }) {
  const c = 'text-nexa-muted shrink-0';
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, className: c } as const;
  switch (type) {
    case 'VOICE':
      return (<svg {...props}><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8" /></svg>);
    case 'STAGE':
      return (<svg {...props}><path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" fill="currentColor" stroke="none" /><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3" /></svg>);
    case 'ANNOUNCEMENT':
      return (<svg {...props}><path d="m3 11 18-7-4 16-6-4-3 4v-6L3 11z" fill="currentColor" stroke="none" /></svg>);
    case 'FORUM':
      return (<svg {...props}><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" fill="currentColor" stroke="none" opacity=".9" /></svg>);
    case 'THREAD':
      return (<svg {...props}><path d="M8 6h13M8 12h13M8 18h8" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>);
    default:
      return (<svg {...props}><path d="M9 4 7 20M17 4l-2 16M4 9h17M3 15h17" /></svg>);
  }
}

export function IconButton({ children, title, onClick, active }: { children: React.ReactNode; title: string; onClick?: () => void; active?: boolean }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} className={`rounded-md p-1.5 text-lg leading-none hover:bg-nexa-panel3 transition ${active ? 'bg-nexa-panel3 text-nexa-text' : 'text-nexa-muted hover:text-nexa-text'}`}>
      {children}
    </button>
  );
}

function ChannelSearch({ onSearch, onClose }: { onSearch: (q: string) => Promise<Message[]>; onClose: () => void }) {
  const { t } = useLocale();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Message[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="shrink-0 border-b border-nexa-border bg-nexa-panel px-4 py-2">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            setResults(await onSearch(q));
          } catch {
            setResults([]);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.chat.searchPlaceholder} className="flex-1 rounded bg-nexa-panel2 border border-nexa-border px-3 py-1.5 text-sm outline-none focus:border-nexa-violet" />
        <button className="rounded bg-nexa-violet px-3 py-1.5 text-sm font-semibold text-white" disabled={busy}>{busy ? t.chat.searchingButton : t.chat.searchButton}</button>
        <button type="button" className="text-nexa-muted px-2" onClick={onClose}>✕</button>
      </form>
      {results !== null && (
        <div className="max-h-48 overflow-y-auto mt-2 space-y-1">
          {results.length === 0 && <div className="text-sm text-nexa-muted">{t.chat.noResults}</div>}
          {results.map((m) => (
            <div key={m.id} className="text-sm rounded bg-nexa-panel2 px-2 py-1">
              <b>{displayNameOf(m.author)}</b> <span className="text-nexa-muted text-xs">{fmtDate(m.createdAt)} {fmtTime(m.createdAt)}</span>
              <div className="truncate">{m.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Nachrichten-Zeilen mit Gruppierung & Datums-Trennern ────────────────────
export function MessageRows({ messages, meId, serverEmojis, onReply, onLocalUpdate }: {
  messages: Message[];
  meId?: string;
  serverEmojis: ServerEmoji[];
  onReply: (m: Message) => void;
  onLocalUpdate: (m: Message) => void;
}) {
  const rows: React.ReactNode[] = [];
  let lastDay = '';
  messages.forEach((m, i) => {
    const day = new Date(m.createdAt).toDateString();
    if (day !== lastDay) {
      lastDay = day;
      rows.push(
        <div key={`d-${m.id}`} className="flex items-center gap-3 my-4">
          <span className="h-px flex-1 bg-nexa-border" />
          <span className="text-xs font-semibold text-nexa-muted">{fmtDate(m.createdAt)}</span>
          <span className="h-px flex-1 bg-nexa-border" />
        </div>,
      );
    }
    const prev = messages[i - 1];
    const grouped =
      prev && prev.authorId === m.authorId && !m.replyToId && prev.type !== 'SYSTEM' && m.type !== 'SYSTEM' &&
      new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000 &&
      new Date(prev.createdAt).toDateString() === new Date(m.createdAt).toDateString();
    rows.push(
      <MessageItem key={m.id} m={m} grouped={!!grouped} mine={m.authorId === meId} serverEmojis={serverEmojis} onReply={() => onReply(m)} onLocalUpdate={onLocalUpdate} />,
    );
  });
  return <>{rows}</>;
}

function MessageItem({ m, grouped, mine, serverEmojis, onReply, onLocalUpdate }: {
  m: Message;
  grouped: boolean;
  mine: boolean;
  serverEmojis: ServerEmoji[];
  onReply: () => void;
  onLocalUpdate: (m: Message) => void;
}) {
  const { t, fmt } = useLocale();
  const [menu, setMenu] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(m.content);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const toast = useStore((s) => s.toast);
  const setProfileUserId = useStore((s) => s.setProfileUserId);

  useEffect(() => {
    const root = document.querySelectorAll('.spoiler:not([data-bound])');
    root.forEach((el) => {
      el.setAttribute('data-bound', '1');
      el.addEventListener('click', () => el.classList.add('revealed'));
    });
  }, [m.content, m.id]);

  if (m.type === 'SYSTEM') {
    return <div className="text-center text-sm text-nexa-muted py-1.5 msg-row">{m.content}</div>;
  }

  const deleted = Boolean(m.deletedAt);
  const author: PublicUser = m.author || { id: m.authorId, username: t.common.unknown, displayName: t.common.unknown };

  const react = async (emoji: string) => {
    setReactOpen(false);
    const mine2 = m.reactions?.find((r) => r.emoji === emoji)?.me;
    try {
      if (mine2) await del(`/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`);
      else await put(`/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`, {});
    } catch (e) {
      toast({ title: t.chat.reactionFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    }
  };

  const saveEdit = async () => {
    try {
      const updated = await patch<Message>(`/messages/${m.id}`, { content: editText });
      onLocalUpdate({ ...m, ...updated, content: editText, editedAt: new Date().toISOString() });
      setEditing(false);
    } catch (e) {
      toast({ title: t.chat.editFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    }
  };

  return (
    <div className={`msg-row group relative flex gap-3 rounded px-2 py-1 hover:bg-nexa-panel2/60 ${grouped ? '' : 'mt-4 msg-group-gap'}`}>
      {grouped ? (
        <div className="w-10 shrink-0 text-right text-[10px] text-transparent group-hover:text-nexa-muted pt-1 select-none">{fmtTime(m.createdAt)}</div>
      ) : (
        <button className="shrink-0" onClick={() => m.authorId && setProfileUserId(m.authorId)} title={t.chat.profileView}>
          <Avatar user={author} size={40} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <button className="font-semibold hover:underline" onClick={() => setProfileUserId(m.authorId)}>{displayNameOf(author)}</button>
            {author.verified && <VerifiedBadge />}
            <UserBadgesInline user={author} max={3} />
            {author.isBot && <span className="rounded bg-nexa-violet px-1 text-[10px] font-bold text-white">BOT</span>}
            <span className="text-xs text-nexa-muted">{fmtTime(m.createdAt)}</span>
          </div>
        )}
        {m.replyTo && (
          <div className="text-xs text-nexa-muted truncate border-l-2 border-nexa-violet pl-2 mb-0.5">
            ↩ <b>{displayNameOf(m.replyTo.author)}</b>: {m.replyTo.content || t.chat.messageFallback}
          </div>
        )}
        {m.forwardedFromId && <div className="text-[11px] text-nexa-muted">{t.chat.forwardedTag}</div>}
        {deleted ? (
          <div className="italic text-nexa-muted text-sm">{t.chat.deletedMessage}</div>
        ) : editing ? (
          <div className="flex gap-2 mt-1">
            <textarea autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} rows={2}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveEdit(); } if (e.key === 'Escape') setEditing(false); }}
              className="flex-1 rounded bg-nexa-panel3 border border-nexa-border px-2 py-1.5 text-sm outline-none" />
            <button className="self-end rounded bg-nexa-violet px-3 py-1.5 text-sm font-semibold text-white" onClick={() => void saveEdit()}>{t.common.save}</button>
          </div>
        ) : (
          <div className="nexa-md text-[15px]" dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(m.content || '') }} />
        )}
        {m.editedAt && !deleted && <span className="text-[11px] text-nexa-muted">{t.chat.edited}</span>}
        {m.pinned && <div className="text-[11px] text-nexa-warn">{t.chat.pinnedTag}</div>}

        {/* Anhänge */}
        {!deleted && m.attachments && m.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {m.attachments.map((a, i) =>
              a.contentType?.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.id || i} src={a.url} alt={a.fileName} className="max-h-64 max-w-sm rounded-lg cursor-zoom-in border border-nexa-border" onClick={() => setLightbox(a.url)} />
              ) : a.contentType?.startsWith('video/') ? (
                <video key={a.id || i} src={a.url} controls className="max-h-64 max-w-sm rounded-lg border border-nexa-border" />
              ) : (
                <a key={a.id || i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-nexa-panel3 px-3 py-2 text-sm hover:bg-nexa-border">
                  📎 <span className="font-medium">{a.fileName}</span> <span className="text-nexa-muted text-xs">{fmtBytes(a.size || 0)}</span>
                </a>
              ),
            )}
          </div>
        )}

        {/* Embeds */}
        {!deleted && m.embeds && m.embeds.length > 0 && (
          <div className="mt-1.5 space-y-2">
            {m.embeds.map((e, i) => (
              <a key={i} href={e.url} target="_blank" rel="noreferrer" className="block max-w-md rounded-lg border-l-4 border-nexa-cyan bg-nexa-panel2 p-3 hover:bg-nexa-panel3">
                {e.siteName && <div className="text-[11px] text-nexa-muted">{e.siteName}</div>}
                <div className="font-semibold text-nexa-cyan">{e.title || e.url}</div>
                {e.description && <div className="text-sm text-nexa-muted line-clamp-3">{e.description}</div>}
                {e.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.image} alt="" className="mt-2 max-h-40 rounded" />
                )}
              </a>
            ))}
          </div>
        )}

        {/* Reaktionen */}
        {!deleted && m.reactions && m.reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {m.reactions.map((r) => (
              <button key={r.emoji} onClick={() => void react(r.emoji)}
                className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-sm ${r.me ? 'border-nexa-violet bg-nexa-violet/20' : 'border-nexa-border bg-nexa-panel3 hover:border-nexa-muted'}`}>
                {serverEmojis.find((e) => e.name === r.emoji) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={serverEmojis.find((e) => e.name === r.emoji)!.imageUrl} alt={r.emoji} className="h-4 w-4" />
                ) : (
                  <span>{r.emoji}</span>
                )}
                <span className="text-xs font-semibold">{r.count}</span>
              </button>
            ))}
            <button onClick={() => setReactOpen((v) => !v)} className="rounded-md border border-transparent px-1.5 text-nexa-muted hover:border-nexa-border">＋</button>
          </div>
        )}
      </div>

      {/* Hover-Aktionen */}
      {!deleted && (
        <div className="absolute -top-3 right-2 hidden group-hover:flex items-center gap-0.5 rounded-lg border border-nexa-border bg-nexa-panel3 shadow-lg z-10">
          <IconButton title={t.chat.react} onClick={() => setReactOpen((v) => !v)}>😀</IconButton>
          <IconButton title={t.chat.reply} onClick={onReply}>↩</IconButton>
          {mine && <IconButton title={t.common.edit} onClick={() => { setEditText(m.content); setEditing(true); }}>✏️</IconButton>}
          <IconButton title={t.chat.pin} onClick={async () => { try { await post(`/messages/${m.id}/pin`, {}); toast({ title: t.chat.pinnedToast, kind: 'success' }); } catch (e) { toast({ title: t.chat.pinFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); } }}>📌</IconButton>
          <IconButton title={t.chat.more} onClick={() => setMenu((v) => !v)}>⋯</IconButton>
        </div>
      )}

      {reactOpen && (
        <EmojiPicker serverEmojis={serverEmojis} onPick={(e) => void react(e)} onClose={() => setReactOpen(false)} />
      )}

      {menu && !deleted && (
        <div className="absolute right-2 top-6 z-20 w-52 rounded-lg border border-nexa-border bg-nexa-panel3 shadow-xl py-1 text-sm animate-pop-in" onMouseLeave={() => setMenu(false)}>
          <MenuItem onClick={() => { void navigator.clipboard.writeText(m.content); setMenu(false); toast({ title: t.chat.textCopied, kind: 'success' }); }}>{t.chat.copyText}</MenuItem>
          <MenuItem onClick={async () => {
            setMenu(false);
            const target = window.prompt(t.chat.forwardPrompt);
            if (!target) return;
            try {
              await post(`/messages/${m.id}/forward`, { targetChannelId: target });
              toast({ title: t.chat.forwarded, kind: 'success' });
            } catch (e) { toast({ title: t.chat.forwardFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
          }}>{t.chat.forward}</MenuItem>
          {!mine && (
            <MenuItem onClick={async () => {
              setMenu(false);
              const reason = window.prompt(t.chat.reportPrompt);
              if (!reason) return;
              try {
                await post('/reports', { targetType: 'MESSAGE', targetId: m.id, reason });
                toast({ title: t.chat.reportSent, kind: 'success' });
              } catch (e) { toast({ title: t.chat.reportFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
            }}>{t.chat.report}</MenuItem>
          )}
          {mine && (
            <MenuItem danger onClick={async () => {
              setMenu(false);
              if (!window.confirm(t.chat.deleteConfirm)) return;
              try {
                await del(`/messages/${m.id}`);
                onLocalUpdate({ ...m, deletedAt: new Date().toISOString(), content: '' });
              } catch (e) { toast({ title: t.common.deleteFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
            }}>{t.chat.deleteMessage}</MenuItem>
          )}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt={t.chat.attachmentFallback} className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`block w-full px-3 py-1.5 text-left hover:bg-nexa-violet/25 ${danger ? 'text-nexa-danger' : 'text-nexa-text'}`}>
      {children}
    </button>
  );
}

export function EmojiPicker({ serverEmojis, onPick, onClose }: { serverEmojis: ServerEmoji[]; onPick: (e: string) => void; onClose: () => void }) {
  const { t } = useLocale();
  return (
    <div className="absolute right-2 top-8 z-30 w-64 rounded-xl border border-nexa-border bg-nexa-panel3 p-2 shadow-2xl animate-pop-in">
      <div className="grid grid-cols-8 gap-1">
        {EMOJIS.map((e) => (
          <button key={e} className="rounded p-1 text-lg hover:bg-nexa-panel2" onClick={() => onPick(e)}>{e}</button>
        ))}
      </div>
      {serverEmojis.length > 0 && (
        <>
          <div className="text-[11px] uppercase text-nexa-muted mt-2 mb-1">{t.chat.serverEmojis}</div>
          <div className="grid grid-cols-8 gap-1">
            {serverEmojis.map((e) => (
              <button key={e.id} className="rounded p-1 hover:bg-nexa-panel2" title={e.name} onClick={() => onPick(e.name)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.imageUrl} alt={e.name} className="h-5 w-5 mx-auto" />
              </button>
            ))}
          </div>
        </>
      )}
      <button className="mt-2 w-full text-xs text-nexa-muted hover:text-nexa-text" onClick={onClose}>{t.common.close}</button>
    </div>
  );
}

// ─── Eingabe mit Mentions, Emojis, Uploads, Slowmode ────────────────────────
export function MessageInput({ channel, replyTo, cancelReply, onSent, onGate }: {
  channel: Channel;
  replyTo: Message | null;
  cancelReply: () => void;
  onSent: (m: Message) => void;
  onGate: (msg: string) => void;
}) {
  const { t, fmt } = useLocale();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Array<{ file: File; progress: number }>>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [slowUntil, setSlowUntil] = useState(0);
  const [, forceTick] = useState(0);
  const [ac, setAc] = useState<{ kind: 'user' | 'role' | 'channel' | 'special'; items: Array<{ id: string; label: string; value: string }>; start: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTypeRef = useRef(0);
  const me = useStore((s) => s.user);
  const members = useStore((s) => s.members);
  const roles = useStore((s) => s.roles);
  const channels = useStore((s) => s.channels);
  const serverEmojis = useServerEmojis(channel.serverId || undefined);

  useEffect(() => {
    if (!slowUntil) return;
    const iv = setInterval(() => {
      forceTick((n) => n + 1);
      if (Date.now() >= slowUntil) clearInterval(iv);
    }, 500);
    return () => clearInterval(iv);
  }, [slowUntil]);

  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(200, ta.scrollHeight) + 'px';
    }
  }, [text]);

  const emitTyping = () => {
    const now = Date.now();
    if (now - lastTypeRef.current > 2500) {
      lastTypeRef.current = now;
      getSocket().emit('typing', { channelId: channel.id, typing: true });
    }
  };

  const computeAutocomplete = (value: string, caret: number) => {
    const upto = value.slice(0, caret);
    const match = /(?:^|\s)([@#])([\p{L}\p{N}_.-]*)$/u.exec(upto);
    if (!match || !channel.serverId) {
      setAc(null);
      return;
    }
    const sym = match[1];
    const q = match[2].toLowerCase();
    const start = caret - match[2].length - 1;
    if (sym === '#') {
      const items = (channels[channel.serverId] || [])
        .filter((c) => c.type === 'TEXT' && c.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map((c) => ({ id: c.id, label: `# ${c.name}`, value: `<#${c.id}>` }));
      setAc({ kind: 'channel', items, start });
      return;
    }
    const items: Array<{ id: string; label: string; value: string }> = [];
    if ('everyone'.startsWith(q)) items.push({ id: '@everyone', label: t.chat.everyoneLabel, value: '@everyone' });
    if ('here'.startsWith(q)) items.push({ id: '@here', label: t.chat.hereLabel, value: '@here' });
    (members[channel.serverId] || []).forEach((mb: Member) => {
      const u = mb.user;
      if (!u) return;
      if (displayNameOf(u).toLowerCase().includes(q) || u.username.toLowerCase().includes(q)) items.push({ id: u.id, label: `${displayNameOf(u)} (@${u.username})`, value: `<@${u.id}>` });
    });
    (roles[channel.serverId] || []).forEach((r: Role) => {
      if (r.mentionable !== false && r.name.toLowerCase().includes(q)) items.push({ id: r.id, label: `@${r.name} ${t.chat.roleSuffix}`, value: `<@&${r.id}>` });
    });
    setAc({ kind: 'user', items: items.slice(0, 8), start });
  };

  const applyAc = (value: string) => {
    const ta = taRef.current;
    if (!ta || !ac) return;
    const caret = ta.selectionStart || text.length;
    const next = text.slice(0, ac.start) + value + ' ' + text.slice(caret);
    setText(next);
    setAc(null);
    requestAnimationFrame(() => ta.focus());
  };

  const send = async () => {
    const content = text.trim();
    if ((!content && files.length === 0) || sending) return;
    if (Date.now() < slowUntil) return;
    setSending(true);
    try {
      const attachments = [];
      for (const f of files) {
        const att = await uploadFile(f.file, (pct) => {
          f.progress = pct;
          setFiles((prev) => [...prev]);
        });
        attachments.push(att);
      }
      const payload: Record<string, unknown> = { content };
      if (attachments.length) payload.attachments = attachments;
      if (replyTo) payload.replyToId = replyTo.id;
      const msg = await post<Message>(`/channels/${channel.id}/messages`, payload);
      onSent(msg);
      setText('');
      setFiles([]);
      cancelReply();
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'RULES_NOT_ACCEPTED') onGate(t.chat.rulesGate);
        else if (e.code === 'EMAIL_NOT_VERIFIED') onGate(t.chat.emailGate);
        else if (e.code === 'MEMBER_AGE' || e.code === 'ACCOUNT_AGE' || e.code === 'MEMBER_AGE_GATE' || e.code === 'ACCOUNT_TOO_YOUNG') onGate(t.chat.ageGate);
        else if (e.code === 'SLOWMODE' || e.retryAfter || /slowmode/i.test(e.message)) {
          const wait = e.retryAfter || channel.slowmodeSeconds || 5;
          setSlowUntil(Date.now() + wait * 1000);
          onGate(fmt(t.chat.slowmodeGate, { seconds: wait }));
        } else onGate(e.message);
      } else {
        onGate(e instanceof Error ? e.message : t.chat.sendFailed);
      }
    } finally {
      setSending(false);
    }
  };

  const slowLeft = Math.max(0, Math.ceil((slowUntil - Date.now()) / 1000));

  return (
    <div className="shrink-0 px-3 pb-3 relative">
      {replyTo && (
        <div className="flex items-center justify-between rounded-t-lg bg-nexa-panel2 border border-b-0 border-nexa-border px-3 py-1.5 text-sm">
          <span className="truncate text-nexa-muted">{t.chat.replyTo} <b className="text-nexa-text">{displayNameOf(replyTo.author)}</b>: {replyTo.content.slice(0, 80)}</span>
          <button onClick={cancelReply} className="text-nexa-muted hover:text-nexa-text" aria-label={t.chat.cancelReply}>✕</button>
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-nexa-panel3 px-2.5 py-1.5 text-xs">
              📎 {f.file.name} {f.progress > 0 && f.progress < 100 ? `(${f.progress} %)` : ''}
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={t.chat.removeAttachment}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div data-tour="message-input" className={`flex items-end gap-1 rounded-lg bg-nexa-panel2 border border-nexa-border px-2 py-1.5 focus-within:border-nexa-violet ${replyTo ? 'rounded-t-none' : ''}`}>
        <button className="p-1.5 text-nexa-muted hover:text-nexa-text text-xl leading-none" title={t.chat.attachFile} onClick={() => fileRef.current?.click()}>＋</button>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => {
          const list = Array.from(e.target.files || []).map((file) => ({ file, progress: 0 }));
          setFiles((prev) => [...prev, ...list]);
          e.target.value = '';
        }} />
        <textarea
          ref={taRef}
          value={text}
          rows={1}
          placeholder={slowLeft > 0 ? fmt(t.chat.slowmodePlaceholder, { seconds: slowLeft }) : fmt(t.chat.messageTo, { target: channel.type === 'DM' || channel.type === 'GROUP_DM' ? displayNameOf(channel.participants?.find((p) => p.id !== me?.id)) || t.channelPage.directMessage : '#' + channel.name })}
          className="flex-1 resize-none bg-transparent outline-none text-[15px] placeholder:text-nexa-muted/70 max-h-[200px]"
          onChange={(e) => { setText(e.target.value); emitTyping(); computeAutocomplete(e.target.value, e.target.selectionStart || 0); }}
          onClick={(e) => computeAutocomplete(text, (e.target as HTMLTextAreaElement).selectionStart || 0)}
          onKeyDown={(e) => {
            if (ac && ac.items.length) {
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyAc(ac.items[0].value); return; }
              if (e.key === 'Escape') { setAc(null); return; }
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
        />
        <span className={`text-[11px] ${text.length > 1800 ? 'text-nexa-danger' : 'text-nexa-muted'}`}>{text.length}/2000</span>
        <div className="relative">
          <button className="p-1.5 text-xl leading-none" title={t.chat.insertEmoji} onClick={() => setEmojiOpen((v) => !v)}>😀</button>
          {emojiOpen && (
            <div className="absolute bottom-10 right-0 z-30">
              <EmojiPicker serverEmojis={serverEmojis} onPick={(e) => { setText((tx) => tx + e); }} onClose={() => setEmojiOpen(false)} />
            </div>
          )}
        </div>
        <button className="p-1.5 text-nexa-violet hover:text-nexa-cyan disabled:opacity-40" title={t.chat.send} disabled={sending || slowLeft > 0} onClick={() => void send()}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21.8 12 3.4 3.6l-.01 6.53L14 12 3.39 13.87z" /></svg>
        </button>
      </div>
      {ac && ac.items.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 z-30 rounded-lg border border-nexa-border bg-nexa-panel3 shadow-xl py-1 max-h-56 overflow-y-auto">
          {ac.items.map((it) => (
            <button key={it.id + it.value} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-nexa-violet/25" onMouseDown={(e) => { e.preventDefault(); applyAc(it.value); }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
