'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { get, post, del, patch } from '../lib/api';
import { useStore } from '../lib/store';
import { extractList } from '../lib/hooks';
import { useLocale } from '../lib/locale';
import { formatDateLong, formatDateTime } from '../lib/i18n';
import type { BadgeGrant, Message, PublicUser, Server } from '../lib/types';
import { displayNameOf } from '../lib/types';
import { Avatar, BadgeGrid, UserBadgesInline, VerifiedBadge } from './ui';
import { MenuItem } from './chat';

export function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[88vh] overflow-y-auto rounded-2xl bg-nexa-panel border border-nexa-border shadow-2xl animate-pop-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export const modalInput = 'w-full rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm outline-none focus:border-nexa-violet';
export const modalLabel = 'block text-xs font-semibold uppercase tracking-wide text-nexa-muted mb-1';

// ─── Profil-Popup ────────────────────────────────────────────────────────────
export function ProfilePopup() {
  const { t, fmt } = useLocale();
  const userId = useStore((s) => s.profileUserId);
  const setUserId = useStore((s) => s.setProfileUserId);
  const me = useStore((s) => s.user);
  const activeServerId = useStore((s) => s.activeServerId);
  const members = useStore((s) => s.members);
  const roles = useStore((s) => s.roles);
  const toast = useStore((s) => s.toast);
  const router = useRouter();
  const [user, setUser] = useState<(PublicUser & { badgeGrants?: BadgeGrant[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setUser(null);
    setError(null);
    const q = activeServerId && activeServerId !== '@me' ? `?serverId=${activeServerId}` : '';
    get<PublicUser & { badgeGrants?: BadgeGrant[] }>(`/users/${userId}${q}`).then(setUser).catch((e: Error) => setError(e.message));
  }, [userId, activeServerId]);

  if (!userId) return null;
  const member = activeServerId ? (members[activeServerId] || []).find((m) => m.userId === userId) : undefined;
  const memberRoles = activeServerId ? (roles[activeServerId] || []).filter((r) => (member?.roleIds || member?.roles?.map((x) => x.id) || []).includes(r.id)) : [];
  const since = member?.joinedAt || user?.createdAt;

  return (
    <Modal onClose={() => setUserId(null)}>
      <div className="relative">
        <div className="h-24 rounded-t-2xl bg-gradient-to-r from-nexa-violet to-nexa-cyan" style={user?.bannerUrl ? { backgroundImage: `url(${user.bannerUrl})`, backgroundSize: 'cover' } : undefined} />
        <div className="px-5 pb-5">
          <div className="-mt-10 mb-2">{user && <Avatar user={user} size={80} />}</div>
          {error && <div className="text-sm text-nexa-danger">{error}</div>}
          {!user && !error && <div className="text-sm text-nexa-muted py-6">{t.modals.loadingProfile}</div>}
          {user && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-bold">{displayNameOf(user)}</span>
                {user.verified && <VerifiedBadge size={18} />}
                <UserBadgesInline
                  user={{ ...user, badges: (user.badgeGrants ?? []).map((g) => g.key) }}
                  max={4}
                  size={16}
                />
                {user.isBot && <span className="rounded bg-nexa-violet px-1.5 py-0.5 text-[10px] font-bold text-white">BOT</span>}
              </div>
              <div className="text-sm text-nexa-muted">
                @{user.username}
                <span className="ml-2 rounded bg-nexa-panel3 px-1.5 py-0.5 text-[11px] font-mono" title={t.modals.userId}>#{user.id.slice(0, 8)}</span>
              </div>
              {user.pronouns && <div className="text-sm text-nexa-muted mt-1">{t.modals.pronouns}: {user.pronouns}</div>}
              {user.customStatusText && <div className="text-sm mt-2 italic">💭 {user.customStatusText}</div>}
              {user.about && <div className="mt-3 rounded-lg bg-nexa-panel2 p-3 text-sm whitespace-pre-wrap">{user.about}</div>}
              {since && (
                <div className="mt-3 text-xs text-nexa-muted">
                  {t.common.memberSince} {formatDateLong(since)}
                </div>
              )}
              {memberRoles.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-semibold uppercase text-nexa-muted mb-1.5">{t.common.roles}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {memberRoles.map((r) => (
                      <span key={r.id} className="flex items-center gap-1.5 rounded bg-nexa-panel3 px-2 py-0.5 text-xs font-medium">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                        {r.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase text-nexa-muted mb-1.5">
                  {t.badges.title} ({(user.badgeGrants ?? user.badges ?? []).length})
                </div>
                <BadgeGrid
                  grants={user.badgeGrants ?? (user.badges ?? []).map((k) => ({ key: k }))}
                  showLocked
                />
              </div>
              {me && me.id !== user.id && (
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    className="rounded-lg bg-nexa-violet px-4 py-2 text-sm font-bold text-white"
                    onClick={async () => {
                      try {
                        const dm = await post<{ id: string; channelId?: string }>('/dms', { userId: user.id });
                        setUserId(null);
                        router.push(`/app/channels/@me/${dm.channelId || dm.id}`);
                      } catch (e) {
                        toast({ title: t.modals.dmOpenFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
                      }
                    }}
                  >{t.modals.message}</button>
                  <button
                    className="rounded-lg bg-nexa-panel3 px-4 py-2 text-sm font-semibold"
                    onClick={async () => {
                      try {
                        await post('/friends', { username: user.username, action: 'request' }).catch(async () => {
                          await post('/friends/request', { username: user.username });
                        });
                        toast({ title: t.modals.requestSent, kind: 'success' });
                      } catch (e) {
                        toast({ title: t.modals.requestFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
                      }
                    }}
                  >{t.modals.addFriend}</button>
                  <button
                    className="rounded-lg bg-nexa-panel3 px-4 py-2 text-sm font-semibold text-nexa-danger"
                    onClick={async () => {
                      if (!window.confirm(fmt(t.modals.blockConfirm, { name: displayNameOf(user) }))) return;
                      try {
                        await post('/friends/block', { userId: user.id });
                        toast({ title: t.modals.blockedToast, kind: 'success' });
                        setUserId(null);
                      } catch (e) {
                        toast({ title: t.modals.blockFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
                      }
                    }}
                  >{t.modals.block}</button>
                </div>
              )}
            </>
          )}
        </div>
        <button className="absolute top-2 right-3 text-white/80 hover:text-white text-xl" onClick={() => setUserId(null)} aria-label={t.common.close}>✕</button>
      </div>
    </Modal>
  );
}

// ─── Regeln-Modal ────────────────────────────────────────────────────────────
export function RulesModal({ server, onDone }: { server: Server; onDone: () => void }) {
  const { t, fmt } = useLocale();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useStore((s) => s.toast);

  return (
    <Modal onClose={onDone}>
      <div className="p-6">
        <h2 className="text-xl font-bold mb-1">{fmt(t.modals.rulesTitle, { name: server.name })}</h2>
        <p className="text-sm text-nexa-muted mb-4">{t.modals.rulesIntro}</p>
        <div className="rounded-lg bg-nexa-panel2 border border-nexa-border p-4 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
          {server.rulesText || t.modals.noRules}
        </div>
        {error && <div className="text-sm text-nexa-danger mt-3">{error}</div>}
        <label className="flex items-center gap-2.5 mt-4 cursor-pointer text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#7C5CFF]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          {t.modals.acceptRules}
        </label>
        <div className="flex gap-2 mt-5">
          <button
            disabled={!checked || busy}
            className="flex-1 rounded-lg bg-gradient-to-r from-nexa-violet to-nexa-cyan px-4 py-2.5 font-bold text-white disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await post(`/servers/${server.id}/accept-rules`, {});
                toast({ title: t.modals.rulesAccepted, kind: 'success' });
                if (!server.verificationRoleId) onDone();
              } catch (e) {
                setError(e instanceof Error ? e.message : t.common.error);
              } finally {
                setBusy(false);
              }
            }}
          >{busy ? t.common.saving : t.modals.accept}</button>
          <button className="rounded-lg bg-nexa-panel3 px-4 py-2.5 font-semibold" onClick={onDone}>{t.modals.later}</button>
        </div>
        {server.verificationRoleId && (
          <div className="mt-5 border-t border-nexa-border pt-4">
            <div className="text-sm font-semibold mb-1">{t.modals.verification}</div>
            <p className="text-sm text-nexa-muted mb-2">{t.modals.verificationHint}</p>
            <button
              disabled={verified || busy}
              className="rounded-lg bg-nexa-success px-4 py-2 font-bold text-white disabled:opacity-60"
              onClick={async () => {
                setBusy(true);
                try {
                  await post(`/servers/${server.id}/verify-button`, {});
                  setVerified(true);
                  toast({ title: t.modals.verifiedToast, kind: 'success' });
                  onDone();
                } catch (e) {
                  setError(e instanceof Error ? e.message : t.modals.verifyFailed);
                } finally {
                  setBusy(false);
                }
              }}
            >{verified ? t.modals.verifiedBtn : t.modals.verify}</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Benachrichtigungs-Center ────────────────────────────────────────────────
export function NotificationCenter() {
  const { t } = useLocale();
  const notifications = useStore((s) => s.notifications);
  const setNotifications = useStore((s) => s.setNotifications);
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.readAt).length;

  useEffect(() => {
    get<unknown>('/notifications').then((d) => setNotifications(extractList(d, 'notifications'))).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAll = async () => {
    await post('/notifications/read-all', {}).catch(() => undefined);
    setNotifications(notifications.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
  };

  return (
    <div className="relative">
      <button title={t.modals.notifications} onClick={() => setOpen((v) => !v)} className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-nexa-panel3 text-xl hover:bg-nexa-border transition">
        🔔
        {unread > 0 && <span className="absolute -right-0.5 -bottom-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-nexa-danger px-1 text-[11px] font-bold text-white ring-4 ring-nexa-panel">{unread}</span>}
      </button>
      {open && (
        <div className="fixed left-20 bottom-4 z-[75] w-[min(360px,88vw)] rounded-xl border border-nexa-border bg-nexa-panel shadow-2xl animate-pop-in" onMouseLeave={() => setOpen(false)}>
          <div className="flex items-center justify-between border-b border-nexa-border px-4 py-2.5">
            <span className="font-bold text-sm">{t.modals.notificationsTitle}</span>
            <button className="text-xs text-nexa-cyan hover:underline" onClick={() => void markAll()}>{t.modals.markAllRead}</button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && <div className="px-4 py-6 text-sm text-nexa-muted text-center">{t.modals.noNotifications}</div>}
            {notifications.map((n) => (
              <button
                key={n.id}
                className={`block w-full px-4 py-2.5 text-left border-b border-nexa-border/50 hover:bg-nexa-panel2 ${n.readAt ? 'opacity-60' : ''}`}
                onClick={async () => {
                  await post(`/notifications/${n.id}/read`, {}).catch(() => post('/notifications/read', { id: n.id }).catch(() => undefined));
                  setNotifications(notifications.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
                }}
              >
                <div className="text-sm font-semibold">{n.title}</div>
                <div className="text-xs text-nexa-muted line-clamp-2">{n.body}</div>
                <div className="text-[11px] text-nexa-muted mt-0.5">{formatDateTime(n.createdAt)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Schnellsuche (Ctrl+K) ───────────────────────────────────────────────────
export function QuickSearch() {
  const { t, fmt } = useLocale();
  const open = useStore((s) => s.quickSearchOpen);
  const setOpen = useStore((s) => s.setQuickSearchOpen);
  const servers = useStore((s) => s.servers);
  const channelsBy = useStore((s) => s.channels);
  const activeChannelId = useStore((s) => s.activeChannelId);
  const router = useRouter();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | 'messages' | 'users' | 'channels'>('all');
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const setProfileUserId = useStore((s) => s.setProfileUserId);

  const localChannels = useMemo(() => {
    const out: Array<{ server: Server; channel: { id: string; name: string } }> = [];
    servers.forEach((s) => (channelsBy[s.id] || []).forEach((c) => { if (c.type === 'TEXT' || c.type === 'ANNOUNCEMENT') out.push({ server: s, channel: c }); }));
    return out;
  }, [servers, channelsBy]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setUsers([]);
    setMsgs([]);
    setTab('all');
  }, [open ]);

  const runSearch = async (query: string) => {
    setQ(query);
    if (query.trim().length < 2) {
      setUsers([]);
      setMsgs([]);
      return;
    }
    setBusy(true);
    try {
      const [u] = await Promise.all([
        get<unknown>(`/users/search?q=${encodeURIComponent(query)}`).catch(() => []),
      ]);
      setUsers(extractList<PublicUser>(u, 'users'));
      // Nachrichten: aktueller Kanal + Fan-out über meine Textkanäle (max. 20)
      const targets = [...new Set([activeChannelId, ...localChannels.map((c) => c.channel.id)].filter(Boolean) as string[])].slice(0, 20);
      const results = await Promise.all(
        targets.map((cid) => get<unknown>(`/channels/${cid}/messages/search?q=${encodeURIComponent(query)}`).then((d) => extractList<Message>(d, 'messages')).catch(() => [] as Message[])),
      );
      setMsgs(results.flat().slice(0, 30));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  const filteredChannels = localChannels.filter((c) => c.channel.name.toLowerCase().includes(q.toLowerCase()) || c.server.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal onClose={() => setOpen(false)} wide>
      <div className="p-5">
        <input autoFocus value={q} onChange={(e) => void runSearch(e.target.value)} placeholder={t.modals.quickSearchPlaceholder} className="w-full rounded-lg bg-nexa-panel2 border border-nexa-border px-4 py-3 outline-none focus:border-nexa-violet" />
        <div className="flex gap-2 mt-3 text-sm">
          {([['all', t.modals.quickSearchTabs.all], ['messages', t.modals.quickSearchTabs.messages], ['users', t.modals.quickSearchTabs.users], ['channels', t.modals.quickSearchTabs.channels]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1 ${tab === k ? 'bg-nexa-violet text-white' : 'bg-nexa-panel3 hover:bg-nexa-border'}`}>{l}</button>
          ))}
          {busy && <span className="text-nexa-muted self-center">{t.modals.searching}</span>}
        </div>
        <div className="mt-4 max-h-[50vh] overflow-y-auto space-y-4">
          {(tab === 'all' || tab === 'users') && users.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase text-nexa-muted mb-1">{t.modals.users}</div>
              {users.map((u) => (
                <button key={u.id} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-nexa-panel2" onClick={() => { setOpen(false); setProfileUserId(u.id); }}>
                  <Avatar user={u} size={32} /> <span className="font-medium">{displayNameOf(u)}</span> <span className="text-nexa-muted text-sm">@{u.username}</span>
                </button>
              ))}
            </div>
          )}
          {(tab === 'all' || tab === 'channels') && filteredChannels.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase text-nexa-muted mb-1">{t.modals.channelsServers}</div>
              {filteredChannels.slice(0, 15).map(({ server, channel }) => (
                <button key={channel.id} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-nexa-panel2" onClick={() => { setOpen(false); router.push(`/app/channels/${server.id}/${channel.id}`); }}>
                  <span className="font-medium"># {channel.name}</span> <span className="text-nexa-muted text-sm">{fmt(t.modals.inServer, { name: server.name })}</span>
                </button>
              ))}
              {servers.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())).map((s) => (
                <button key={s.id} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-nexa-panel2" onClick={() => { setOpen(false); router.push(`/app/channels/${s.id}`); }}>
                  🖥️ <span className="font-medium">{s.name}</span> <span className="text-nexa-muted text-sm">{t.common.server}</span>
                </button>
              ))}
            </div>
          )}
          {(tab === 'all' || tab === 'messages') && msgs.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase text-nexa-muted mb-1">{t.modals.messages}</div>
              {msgs.map((m) => (
                <div key={m.id} className="rounded-lg px-2 py-1.5 hover:bg-nexa-panel2 text-sm">
                  <b>{displayNameOf(m.author)}</b> <span className="text-nexa-muted text-xs">{formatDateTime(m.createdAt)}</span>
                  <div className="truncate">{m.content}</div>
                </div>
              ))}
            </div>
          )}
          {q.length >= 2 && !busy && users.length === 0 && msgs.length === 0 && filteredChannels.length === 0 && (
            <div className="text-sm text-nexa-muted text-center py-6">{fmt(t.modals.noResultsFor, { q })}</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Hilfs-Export, damit del/patch-Imports von Konsumenten genutzt werden können
export { del as _del, patch as _patch };
