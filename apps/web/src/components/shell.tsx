'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { get, post, put, refreshAccessToken, getToken, setToken } from '../lib/api';
import { connectSocket, getSocket, disconnectSocket } from '../lib/socket';
import { useStore, EMPTY_LIST } from '../lib/store';
import { useGlobalSocket, extractList } from '../lib/hooks';
import type { Category, Channel, Member, PublicUser, Role, Server } from '../lib/types';
import { displayNameOf, initialsOf, decodeParam } from '../lib/types';
import { dicts, getActiveLocale, statusText } from '../lib/i18n';
import { useLocale } from '../lib/locale';
import { Avatar, StatusDot, UserBadgesInline, VerifiedBadge, Skeleton } from './ui';
import { NexaLogo } from './Logo';
import LanguageSwitcher from './LanguageSwitcher';
import { OnboardingTour } from './tutorial';
import { Modal, modalInput, modalLabel, NotificationCenter, ProfilePopup, QuickSearch, RulesModal } from './modals';
import { ServerSettingsModal, ChannelSettingsModal, useMyPermissions } from './settings-modals';
import { ChannelTypeIcon, MenuItem } from './chat';
import { perm } from '../lib/shared';

export const ShellActions = createContext<{ openServerSettings: (s: Server) => void; openChannelSettings: (c: Channel) => void }>({
  openServerSettings: () => undefined,
  openChannelSettings: () => undefined,
});
export const useShellActions = () => useContext(ShellActions);

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ serverId?: string; channelId?: string }>();
  const pathname = usePathname();
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const ready = useStore((s) => s.ready);
  const setReady = useStore((s) => s.setReady);
  const setServers = useStore((s) => s.setServers);
  const setReadStates = useStore((s) => s.setReadStates);
  const select = useStore((s) => s.select);
  const setQuickSearchOpen = useStore((s) => s.setQuickSearchOpen);
  const setProfileUserId = useStore((s) => s.setProfileUserId);
  const [settingsServer, setSettingsServer] = useState<Server | null>(null);
  const [settingsChannel, setSettingsChannel] = useState<Channel | null>(null);
  const [rulesServer, setRulesServer] = useState<Server | null>(null);
  const servers = useStore((s) => s.servers);
  const setServerData = useStore((s) => s.setServerData);
  const upsertServer = useStore((s) => s.upsertServer);
  useGlobalSocket();

  const serverId = params.serverId ? decodeParam(params.serverId) : null;
  const channelId = params.channelId ? decodeParam(params.channelId) : null;

  const loadServerData = useCallback(async (sid: string) => {
    if (sid === '@me') return;
    try {
      const d = await get<Server & Record<string, unknown>>(`/servers/${sid}`);
      upsertServer(d);
      setServerData(sid, {
        channels: (d.channels as Channel[]) || undefined,
        categories: (d.categories as Category[]) || undefined,
        roles: (d.roles as Role[]) || undefined,
        members: extractList<Member>(d.members ?? d, 'members').length ? extractList<Member>(d.members ?? d, 'members') : undefined,
      });
      if (!(d.channels as Channel[])?.length) {
        // Fallback: Kanäle separat laden, falls nicht eingebettet
        const chans = await get<unknown>(`/servers/${sid}/channels`).catch(() => null);
        if (chans) setServerData(sid, { channels: extractList<Channel>(chans, 'channels') });
      }
    } catch {
      /* Server evtl. nicht (mehr) Mitglied */
    }
  }, [setServerData, upsertServer]);

  // Bootstrap: Token/Refresh → /users/me → Server + Lesestände → Socket
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) {
        const fresh = await refreshAccessToken();
        if (!fresh && !cancelled) {
          router.replace('/login');
          return;
        }
      }
      try {
        const me = await get<PublicUser>('/users/me');
        if (cancelled) return;
        setUser(me);
        // Profil-Sprache an den Locale-Kontext melden (wird nur übernommen,
        // wenn keine lokale/manuelle Wahl vorliegt – siehe lib/locale.tsx).
        if (me.locale) window.dispatchEvent(new CustomEvent('nexa-profile-locale', { detail: me.locale }));
        // Theme anwenden
        const theme = me.theme || localStorage.getItem('nexa_theme') || 'dark';
        document.documentElement.classList.toggle('dark', theme !== 'light');
        document.documentElement.classList.toggle('light', theme === 'light');
        if (localStorage.getItem('nexa_compact') === '1') document.body.classList.add('compact');
        const [srv, rs] = await Promise.all([
          get<unknown>('/servers/my').catch(() => []),
          get<unknown>('/users/me/read-states').catch(() => []),
        ]);
        if (cancelled) return;
        setServers(extractList<Server>(srv, 'servers'));
        const map: Record<string, { lastReadMessageId?: string; mentionCount: number }> = {};
        extractList<{ channelId: string; lastReadMessageId?: string; mentionCount?: number }>(rs, 'readStates').forEach((r) => {
          map[r.channelId] = { lastReadMessageId: r.lastReadMessageId, mentionCount: r.mentionCount || 0 };
        });
        if (Array.isArray(rs)) {
          (rs as Array<{ channelId: string; lastReadMessageId?: string; mentionCount?: number }>).forEach((r) => { map[r.channelId] = { lastReadMessageId: r.lastReadMessageId, mentionCount: r.mentionCount || 0 }; });
        }
        setReadStates(map);
        connectSocket();
        setReady(true);
      } catch {
        if (!cancelled) router.replace('/login');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    select(serverId, channelId);
    if (serverId && serverId !== '@me') void loadServerData(serverId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  const activeServer = useMemo(() => servers.find((s) => s.id === serverId) || null, [servers, serverId]);

  // Regel-Tor: Modal zeigen, wenn Regeln nicht akzeptiert
  useEffect(() => {
    if (!activeServer || !user) return;
    const membersHere = useStore.getState().members[activeServer.id] || activeServer.members || [];
    const mine = membersHere.find((m) => m.userId === user.id) || activeServer.myMember;
    if (activeServer.requireRulesAccept && mine && !mine.rulesAcceptedAt) setRulesServer(activeServer);
    else if (activeServer.requireRulesAccept && activeServer.myMember && !activeServer.myMember.rulesAcceptedAt) setRulesServer(activeServer);
  }, [activeServer?.id, activeServer?.requireRulesAccept, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tastenkürzel: Ctrl+K Suche, Alt+↑/↓ Kanalwechsel, Esc schließt
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSearchOpen(true);
      } else if (e.key === 'Escape') {
        setQuickSearchOpen(false);
        setProfileUserId(null);
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const st = useStore.getState();
        if (!st.activeServerId || st.activeServerId === '@me') return;
        const chans = (st.channels[st.activeServerId] || []).filter((c) => c.type === 'TEXT' || c.type === 'ANNOUNCEMENT' || c.type === 'FORUM');
        if (!chans.length) return;
        const idx = chans.findIndex((c) => c.id === st.activeChannelId);
        const next = e.key === 'ArrowDown' ? chans[(idx + 1) % chans.length] : chans[(idx - 1 + chans.length) % chans.length];
        if (next) {
          e.preventDefault();
          router.push(`/app/channels/${st.activeServerId}/${next.id}`);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router, setQuickSearchOpen, setProfileUserId]);

  const inSettings = pathname?.startsWith('/app/settings');
  const isAdmin = pathname?.startsWith('/app/admin');
  const fullBleed = inSettings || isAdmin;

  if (!ready || !user) {
    return (
      <div className="flex h-full bg-nexa-bg">
        <div className="w-[72px] shrink-0 bg-nexa-panel border-r border-nexa-border p-2 space-y-2">
          {[1, 2, 3, 4].map((i) => (<Skeleton key={i} className="h-12 w-12 rounded-full mx-auto" />))}
        </div>
        <div className="w-60 shrink-0 bg-nexa-panel p-3 space-y-2 hidden md:block">
          {[1, 2, 3, 4, 5].map((i) => (<Skeleton key={i} className="h-8 w-full" />))}
        </div>
        <div className="flex-1 p-4 space-y-3">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <ShellActions.Provider value={{ openServerSettings: setSettingsServer, openChannelSettings: setSettingsChannel }}>
      <div className="flex h-full bg-nexa-bg text-nexa-text overflow-hidden">
        <ServerBar />
        {!fullBleed && (serverId === '@me' ? <DmSidebar /> : <ChannelSidebar server={activeServer} />)}
        <div className="flex flex-1 min-w-0 flex-col">{children}</div>
        {settingsServer && <ServerSettingsModal server={settingsServer} onClose={() => setSettingsServer(null)} />}
        {settingsChannel && activeServer && (
          <ChannelSettingsModal
            channel={settingsChannel}
            server={activeServer}
            onClose={() => setSettingsChannel(null)}
            onChanged={() => { if (serverId) void loadServerData(serverId); }}
          />
        )}
        {rulesServer && <RulesModal server={rulesServer} onDone={() => { setRulesServer(null); if (serverId) void loadServerData(serverId); }} />}
        <ProfilePopup />
        <QuickSearch />
        <OnboardingTour />
      </div>
    </ShellActions.Provider>
  );
}

// ─── Server-Leiste ───────────────────────────────────────────────────────────
function ServerBar() {
  const { t, fmt } = useLocale();
  const servers = useStore((s) => s.servers);
  const order = useStore((s) => s.serverOrder);
  const setOrder = useStore((s) => s.setServerOrder);
  const activeServerId = useStore((s) => s.activeServerId);
  const readStates = useStore((s) => s.readStates);
  const channelsBy = useStore((s) => s.channels);
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [ctx, setCtx] = useState<{ server: Server; x: number; y: number } | null>(null);
  const actions = useShellActions();
  const toast = useStore((s) => s.toast);
  const removeServer = useStore((s) => s.removeServer);
  const upsertServer = useStore((s) => s.upsertServer);
  const dragId = useRef<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sorted = useMemo(() => {
    const idx = new Map(order.map((id, i) => [id, i]));
    const byOrder = [...servers].sort((a, b) => (idx.get(a.id) ?? 999) - (idx.get(b.id) ?? 999));
    // Favoriten stehen immer ganz oben; die manuelle (Drag-)Reihenfolge
    // bleibt innerhalb der Favoriten und der übrigen Server erhalten.
    return [...byOrder.filter((s) => s.isFavorite), ...byOrder.filter((s) => !s.isFavorite)];
  }, [servers, order]);

  const toggleFavorite = useCallback(async (s: Server) => {
    const next = !s.isFavorite;
    upsertServer({ ...s, isFavorite: next }); // optimistisch
    try {
      await put(`/servers/${s.id}/favorite`, { favorite: next });
    } catch (e) {
      upsertServer({ ...s, isFavorite: !next });
      toast({ title: t.shell.favoriteSaveFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    }
  }, [upsertServer, toast, t]);

  const mentionsFor = (sid: string) => (channelsBy[sid] || []).reduce((sum, c) => sum + (readStates[c.id]?.mentionCount || 0), 0);

  return (
    <nav data-tour="server-bar" className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-nexa-panel py-3 border-r border-nexa-border" aria-label={t.shell.serversLabel}>
      <button
        data-tour="dm-button"
        title={t.shell.directMessages}
        onClick={() => router.push('/app/channels/@me')}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-all hover:rounded-2xl ${activeServerId === '@me' ? 'rounded-2xl ring-2 ring-nexa-violet bg-nexa-panel3' : 'bg-nexa-panel3'}`}
      >
        <NexaLogo size={30} />
      </button>
      <span className="h-0.5 w-8 rounded bg-nexa-border" />
      {sorted.map((s) => {
        const mentions = mentionsFor(s.id);
        const active = activeServerId === s.id;
        return (
          <div key={s.id} className="group relative">
            {active && <span className="absolute -left-[13px] top-1/2 -translate-y-1/2 h-10 w-1 rounded bg-white" />}
            {!active && mentions > 0 && <span className="absolute -left-[13px] top-1/2 -translate-y-1/2 h-2.5 w-1 rounded bg-white" />}
            <button
              title={s.name}
              draggable
              onDragStart={() => { dragId.current = s.id; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!dragId.current || dragId.current === s.id) return;
                const ids = sorted.map((x) => x.id);
                const from = ids.indexOf(dragId.current);
                const to = ids.indexOf(s.id);
                ids.splice(from, 1);
                ids.splice(to, 0, dragId.current);
                setOrder(ids);
                dragId.current = null;
              }}
              onContextMenu={(e) => { e.preventDefault(); setCtx({ server: s, x: e.clientX, y: e.clientY }); }}
              onTouchStart={(e) => { pressTimer.current = setTimeout(() => setCtx({ server: s, x: e.touches[0].clientX, y: e.touches[0].clientY }), 550); }}
              onTouchEnd={() => { if (pressTimer.current) clearTimeout(pressTimer.current); }}
              onClick={() => router.push(`/app/channels/${s.id}`)}
              className={`relative flex h-12 w-12 items-center justify-center overflow-hidden text-sm font-bold transition-all hover:rounded-2xl ${active ? 'rounded-2xl' : 'rounded-full'} bg-nexa-panel3`}
            >
              {s.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.iconUrl} alt={s.name} className="h-full w-full object-cover" />
              ) : (
                initialsOf(s.name)
              )}
              {mentions > 0 && <span className="absolute -bottom-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-nexa-danger px-1 text-[11px] font-bold text-white ring-4 ring-nexa-panel">{mentions}</span>}
            </button>
            <button
              type="button"
              data-tour="fav-star"
              title={s.isFavorite ? t.shell.favoriteRemove : t.shell.favoriteAdd}
              aria-label={fmt(s.isFavorite ? t.shell.favoriteAriaRemove : t.shell.favoriteAriaAdd, { name: s.name })}
              aria-pressed={Boolean(s.isFavorite)}
              onClick={(e) => { e.stopPropagation(); void toggleFavorite(s); }}
              className={`absolute -bottom-0.5 -left-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-nexa-panel text-[11px] leading-none ring-4 ring-nexa-panel transition-opacity focus:opacity-100 ${s.isFavorite ? 'text-amber-400 opacity-100' : 'text-nexa-muted opacity-0 hover:text-amber-400 group-hover:opacity-100'}`}
            >
              {s.isFavorite ? '★' : '☆'}
            </button>
          </div>
        );
      })}
      <button
        data-tour="add-server"
        title={t.shell.addServer}
        onClick={() => setAddOpen(true)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-nexa-panel3 text-2xl text-nexa-success transition-all hover:rounded-2xl hover:bg-nexa-success hover:text-white"
      >＋</button>
      <button
        data-tour="discover"
        title={t.shell.discoverPublic}
        onClick={() => router.push('/discover')}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-nexa-panel3 text-xl transition-all hover:rounded-2xl"
      >🧭</button>
      <div className="mt-auto flex flex-col items-center gap-2">
        <NotificationCenter />
        <Link href="/developers" title={t.shell.developersBots} className="flex h-12 w-12 items-center justify-center rounded-full bg-nexa-panel3 text-xl hover:rounded-2xl transition-all">🤖</Link>
        <Link href="/app/settings/account" data-tour="settings" title={t.shell.settings} className="flex h-12 w-12 items-center justify-center rounded-full bg-nexa-panel3 text-xl hover:rounded-2xl transition-all">⚙️</Link>
      </div>
      {addOpen && <AddServerModal onClose={() => setAddOpen(false)} />}
      {ctx && (
        <div className="fixed inset-0 z-[65]" onClick={() => setCtx(null)} onContextMenu={(e) => { e.preventDefault(); setCtx(null); }}>
          <div className="absolute w-52 rounded-lg border border-nexa-border bg-nexa-panel3 py-1 shadow-2xl" style={{ left: Math.min(ctx.x, window.innerWidth - 220), top: Math.min(ctx.y, window.innerHeight - 140) }} onClick={(e) => e.stopPropagation()}>
            <MenuItem onClick={() => { void toggleFavorite(ctx.server); setCtx(null); }}>{ctx.server.isFavorite ? t.shell.favoriteStarRemove : t.shell.favoriteStarAdd}</MenuItem>
            <MenuItem onClick={() => { actions.openServerSettings(ctx.server); setCtx(null); }}>{t.shell.serverSettings}</MenuItem>
            <MenuItem onClick={async () => {
              try {
                const inv = await post<{ code: string }>(`/servers/${ctx.server.id}/invites`, {});
                await navigator.clipboard.writeText(inv.code).catch(() => undefined);
                toast({ title: fmt(t.shell.inviteCopied, { code: inv.code }), kind: 'success' });
              } catch (e) { toast({ title: t.shell.inviteFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
              setCtx(null);
            }}>{t.shell.createInvite}</MenuItem>
            <MenuItem danger onClick={async () => {
              if (!window.confirm(fmt(t.shell.leaveConfirm, { name: ctx.server.name }))) { setCtx(null); return; }
              try {
                await post(`/servers/${ctx.server.id}/leave`, {});
                removeServer(ctx.server.id);
                router.push('/app/channels/@me');
              } catch (e) { toast({ title: t.shell.leaveFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
              setCtx(null);
            }}>{t.shell.leaveServer}</MenuItem>
          </div>
        </div>
      )}
    </nav>
  );
}

function AddServerModal({ onClose }: { onClose: () => void }) {
  const { t, fmt } = useLocale();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('Gaming');
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<{ server?: Server; name?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const upsertServer = useStore((s) => s.upsertServer);
  const toast = useStore((s) => s.toast);

  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <h2 className="text-xl font-bold mb-1">{t.shell.addServerTitle}</h2>
        <div className="flex gap-2 mb-4 mt-3">
          {([['create', t.shell.tabCreate], ['join', t.shell.tabJoin]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === k ? 'bg-nexa-violet text-white' : 'bg-nexa-panel3'}`}>{l}</button>
          ))}
        </div>
        {error && <div className="rounded-lg bg-nexa-danger/15 border border-nexa-danger/40 text-sm text-red-300 px-3 py-2 mb-3">{error}</div>}
        {tab === 'create' ? (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              const srv = await post<Server>('/servers', { name, category: template });
              upsertServer(srv);
              toast({ title: fmt(t.shell.serverCreated, { name: srv.name }), kind: 'success' });
              onClose();
              router.push(`/app/channels/${srv.id}`);
            } catch (err) { setError(err instanceof Error ? err.message : t.shell.createServerFailed); }
          }}>
            <div><label className={modalLabel}>{t.shell.serverName}</label><input className={modalInput} value={name} onChange={(e) => setName(e.target.value)} required placeholder={t.shell.serverNamePlaceholder} /></div>
            <div>
              <label className={modalLabel}>{t.shell.template}</label>
              <div className="grid grid-cols-3 gap-2">
                {['Gaming', 'Freunde', 'Lerngruppe'].map((tname) => (
                  <button type="button" key={tname} onClick={() => setTemplate(tname)} className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${template === tname ? 'border-nexa-violet bg-nexa-violet/20' : 'border-nexa-border bg-nexa-panel2'}`}>
                    {tname === 'Gaming' ? '🎮' : tname === 'Freunde' ? '👥' : '📚'} {t.categories[tname] || tname}
                  </button>
                ))}
              </div>
              <p className="text-xs text-nexa-muted mt-1.5">{t.shell.templateHint}</p>
            </div>
            <button className="w-full rounded-lg bg-gradient-to-r from-nexa-violet to-nexa-cyan px-4 py-2.5 font-bold text-white">{t.shell.createServer}</button>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={modalLabel}>{t.shell.inviteCodeOrLink}</label>
              <div className="flex gap-2">
                <input className={modalInput} value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.shell.invitePlaceholder} />
                <button className="shrink-0 rounded-lg bg-nexa-panel3 px-3 font-semibold" onClick={async () => {
                  const c = code.trim().split('/').pop() || '';
                  setError(null);
                  try {
                    const p = await get<{ server?: Server; serverName?: string; name?: string }>(`/invites/${encodeURIComponent(c)}`);
                    setPreview({ server: p.server, name: p.serverName || p.name || p.server?.name });
                  } catch (err) { setError(err instanceof Error ? err.message : t.shell.inviteNotFound); setPreview(null); }
                }}>{t.shell.check}</button>
              </div>
            </div>
            {preview && (
              <div className="rounded-lg bg-nexa-panel2 border border-nexa-border p-3 text-sm">
                {t.shell.inviteTo} <b>{preview.name || preview.server?.name || t.common.server}</b>
              </div>
            )}
            <button
              className="w-full rounded-lg bg-gradient-to-r from-nexa-violet to-nexa-cyan px-4 py-2.5 font-bold text-white disabled:opacity-50"
              disabled={!code.trim()}
              onClick={async () => {
                const c = code.trim().split('/').pop() || '';
                setError(null);
                try {
                  const res = await post<{ server?: Server; serverId?: string }>(`/invites/${encodeURIComponent(c)}`, {});
                  const sid = res.server?.id || res.serverId;
                  if (res.server) upsertServer(res.server);
                  onClose();
                  if (sid) router.push(`/app/channels/${sid}`);
                } catch (err) { setError(err instanceof Error ? err.message : t.shell.joinFailed); }
              }}
            >{t.shell.join}</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Kanal-Seitenleiste ──────────────────────────────────────────────────────
function ChannelSidebar({ server }: { server: Server | null }) {
  const { t, fmt } = useLocale();
  const channels = useStore((s) => (server ? s.channels[server.id] || server.channels || EMPTY_LIST : EMPTY_LIST));
  const categories = useStore((s) => (server ? s.categories[server.id] || server.categories || EMPTY_LIST : EMPTY_LIST));
  const voiceStates = useStore((s) => s.voiceStates);
  const readStates = useStore((s) => s.readStates);
  const activeChannelId = useStore((s) => s.activeChannelId);
  const mobileOpen = useStore((s) => s.mobileNavOpen);
  const setMobileOpen = useStore((s) => s.setMobileNavOpen);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('nexa_collapsed_cats') || '{}'); } catch { return {}; } });
  const [menuOpen, setMenuOpen] = useState(false);
  const [createCat, setCreateCat] = useState(false);
  const [createChan, setCreateChan] = useState<{ categoryId: string | null; type: Channel['type'] } | null>(null);
  const actions = useShellActions();
  const router = useRouter();
  const toast = useStore((s) => s.toast);
  const myPerms = useMyPermissions(server?.id);
  const canManageChannels = perm(myPerms, 'MANAGE_CHANNELS');
  const canManageServer = perm(myPerms, 'MANAGE_SERVER');

  if (!server) {
    return (
      <>
        <div className="hidden lg:flex w-60 shrink-0 bg-nexa-panel border-r border-nexa-border p-3"><Skeleton className="h-8 w-full" /></div>
        <MobileHamburger />
      </>
    );
  }

  const byCat = new Map<string | null, Channel[]>();
  channels.forEach((c) => {
    if (c.type === 'DM' || c.type === 'GROUP_DM') return;
    const key = c.categoryId || null;
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(c);
  });
  byCat.forEach((list) => list.sort((a, b) => a.position - b.position));
  const sortedCats = [...categories].sort((a, b) => a.position - b.position);

  const renderChannel = (c: Channel) => {
    const rs = readStates[c.id];
    const unread = (rs?.mentionCount || 0) > 0;
    const connected = voiceStates[c.id] || [];
    const isVoice = c.type === 'VOICE' || c.type === 'STAGE';
    return (
      <div key={c.id}>
        <div
          className={`group flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer ${activeChannelId === c.id ? 'bg-nexa-panel3 text-nexa-text' : 'text-nexa-muted hover:bg-nexa-panel2 hover:text-nexa-text'} ${unread ? 'text-nexa-text font-bold' : ''}`}
          onClick={() => router.push(`/app/channels/${server.id}/${c.id}`)}
          onContextMenu={(e) => { e.preventDefault(); if (canManageChannels) actions.openChannelSettings(c); }}
        >
          <ChannelTypeIcon type={c.type} size={17} />
          <span className="truncate text-[15px] flex-1">{c.name}</span>
          {unread && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-nexa-danger px-1 text-[10px] font-bold text-white">{rs!.mentionCount}</span>}
          {canManageChannels && <span className="hidden group-hover:block text-xs" title={t.shell.channelSettings} onClick={(e) => { e.stopPropagation(); actions.openChannelSettings(c); }}>⚙️</span>}
        </div>
        {isVoice && connected.length > 0 && (
          <div className="ml-7 mt-0.5 space-y-0.5 pb-1">
            {connected.map((v) => (
              <VoiceParticipantRow key={v.userId} serverId={server.id} state={v} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const sidebar = (
    <div data-tour="sidebar" className="flex h-full w-60 flex-col bg-nexa-panel">
      <div className="relative flex h-12 shrink-0 items-center border-b border-nexa-border px-4">
        <button className="flex-1 truncate text-left font-bold" onClick={() => setMenuOpen((v) => !v)}>
          {server.name} <span className="text-nexa-muted text-xs">▾</span>
        </button>
        {menuOpen && (
          <div className="absolute left-2 top-12 z-40 w-56 rounded-lg border border-nexa-border bg-nexa-panel3 py-1 shadow-2xl animate-pop-in" onMouseLeave={() => setMenuOpen(false)}>
            {(canManageServer || server.ownerId) && <MenuItem onClick={() => { actions.openServerSettings(server); setMenuOpen(false); }}>{t.shell.serverSettings}</MenuItem>}
            <MenuItem onClick={async () => {
              setMenuOpen(false);
              try {
                const inv = await post<{ code: string }>(`/servers/${server.id}/invites`, {});
                await navigator.clipboard.writeText(inv.code).catch(() => undefined);
                toast({ title: fmt(t.shell.inviteCopied, { code: inv.code }), kind: 'success' });
              } catch (e) { toast({ title: t.shell.inviteFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
            }}>{t.shell.createInvite}</MenuItem>
            {canManageChannels && <MenuItem onClick={() => { setCreateChan({ categoryId: null, type: 'TEXT' }); setMenuOpen(false); }}>{t.shell.createChannel}</MenuItem>}
            {canManageChannels && <MenuItem onClick={() => { setCreateCat(true); setMenuOpen(false); }}>{t.shell.createCategory}</MenuItem>}
            <MenuItem danger onClick={async () => {
              setMenuOpen(false);
              if (!window.confirm(fmt(t.shell.leaveConfirm, { name: server.name }))) return;
              try { await post(`/servers/${server.id}/leave`, {}); useStore.getState().removeServer(server.id); router.push('/app/channels/@me'); }
              catch (e) { toast({ title: t.shell.leaveFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
            }}>{t.shell.leaveServer}</MenuItem>
          </div>
        )}
      </div>
      {server.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={server.bannerUrl} alt="" className="h-24 w-full object-cover shrink-0" />
      )}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {(byCat.get(null) || []).map(renderChannel)}
        {sortedCats.map((cat) => (
          <div key={cat.id}>
            <div className="group flex items-center px-1 pt-1">
              <button className="flex flex-1 items-center gap-1 text-left text-[11px] font-bold uppercase tracking-wide text-nexa-muted hover:text-nexa-text" onClick={() => setCollapsed((p) => { const n = { ...p, [cat.id]: !p[cat.id] }; try { localStorage.setItem('nexa_collapsed_cats', JSON.stringify(n)); } catch { /* ignore */ } return n; })}>
                <span className={`transition-transform ${collapsed[cat.id] ? '-rotate-90' : ''}`}>▾</span> {cat.name}
              </button>
              {canManageChannels && (
                <button className="text-nexa-muted hover:text-nexa-text" title={t.shell.createChannelInCategory} onClick={() => setCreateChan({ categoryId: cat.id, type: 'TEXT' })}>＋</button>
              )}
            </div>
            {!collapsed[cat.id] && (byCat.get(cat.id) || []).map(renderChannel)}
          </div>
        ))}
        {channels.length === 0 && <div className="px-2 py-6 text-sm text-nexa-muted">{t.shell.noChannels} {canManageChannels ? t.shell.noChannelsHint : ''}</div>}
      </div>
      <UserPanel />
      {createCat && <CreateCategoryModal serverId={server.id} onClose={() => setCreateCat(false)} />}
      {createChan && <CreateChannelModal serverId={server.id} categoryId={createChan.categoryId} onClose={() => setCreateChan(null)} />}
    </div>
  );

  return (
    <>
      <div className="hidden lg:block shrink-0 border-r border-nexa-border">{sidebar}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-[72px] shadow-2xl">{sidebar}</div>
        </div>
      )}
    </>
  );
}

export function VoiceParticipantRow({ serverId, state }: { serverId: string; state: { userId: string; muted?: boolean; deafened?: boolean; speaking?: boolean } }) {
  const { t } = useLocale();
  const member = useStore((s) => (s.members[serverId] || []).find((m) => m.userId === state.userId));
  const presence = useStore((s) => s.presences[state.userId]);
  const setProfileUserId = useStore((s) => s.setProfileUserId);
  const user = member?.user;
  return (
    <button className="flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-sm text-nexa-muted hover:bg-nexa-panel2" onClick={() => setProfileUserId(state.userId)}>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${state.speaking ? 'ring-2 ring-nexa-success' : ''}`} style={{ background: '#7C5CFF' }}>
        {user ? initialsOf(displayNameOf(user)) : '?'}
      </span>
      <span className="truncate flex-1">{user ? displayNameOf(user) : state.userId.slice(0, 8)}</span>
      {state.muted && <span title={t.shell.muted}>🔇</span>}
      {state.deafened && <span title={t.shell.deafened}>🙉</span>}
      {presence?.status === 'DND' && <span className="h-2 w-2 rounded-full bg-nexa-danger" />}
    </button>
  );
}

function CreateCategoryModal({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const { t } = useLocale();
  const [name, setName] = useState('');
  const setServerData = useStore((s) => s.setServerData);
  const categories = useStore((s) => s.categories[serverId] || EMPTY_LIST);
  const toast = useStore((s) => s.toast);
  return (
    <Modal onClose={onClose}>
      <form className="p-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        try {
          const cat = await post<Category>(`/servers/${serverId}/categories`, { name });
          setServerData(serverId, { categories: [...categories, cat] });
          onClose();
        } catch (err) { toast({ title: t.shell.createCategoryFailed, body: err instanceof Error ? err.message : undefined, kind: 'error' }); }
      }}>
        <h3 className="text-lg font-bold">{t.shell.createCategoryTitle}</h3>
        <div><label className={modalLabel}>{t.shell.name}</label><input className={modalInput} value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></div>
        <button className="w-full rounded-lg bg-nexa-violet px-4 py-2.5 font-bold text-white">{t.common.create}</button>
      </form>
    </Modal>
  );
}

function CreateChannelModal({ serverId, categoryId, onClose }: { serverId: string; categoryId: string | null; onClose: () => void }) {
  const { t } = useLocale();
  const [name, setName] = useState('');
  const [type, setType] = useState<Channel['type']>('TEXT');
  const setServerData = useStore((s) => s.setServerData);
  const chans = useStore((s) => s.channels[serverId] || EMPTY_LIST);
  const router = useRouter();
  const toast = useStore((s) => s.toast);
  return (
    <Modal onClose={onClose}>
      <form className="p-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        try {
          const ch = await post<Channel>(`/servers/${serverId}/channels`, { name, type, categoryId: categoryId || undefined });
          setServerData(serverId, { channels: [...chans, ch] });
          onClose();
          if (type === 'TEXT') router.push(`/app/channels/${serverId}/${ch.id}`);
        } catch (err) { toast({ title: t.shell.createChannelFailed, body: err instanceof Error ? err.message : undefined, kind: 'error' }); }
      }}>
        <h3 className="text-lg font-bold">{t.shell.createChannelTitle}</h3>
        <div>
          <label className={modalLabel}>{t.shell.type}</label>
          <div className="grid grid-cols-3 gap-2">
            {([['TEXT', t.shell.channelTypes.text], ['VOICE', t.shell.channelTypes.voice], ['ANNOUNCEMENT', t.shell.channelTypes.announcement], ['FORUM', t.shell.channelTypes.forum], ['STAGE', t.shell.channelTypes.stage]] as Array<[Channel['type'], string]>).map(([tp, l]) => (
              <button type="button" key={tp} onClick={() => setType(tp)} className={`rounded-lg border px-2 py-2 text-sm font-semibold ${type === tp ? 'border-nexa-violet bg-nexa-violet/20' : 'border-nexa-border bg-nexa-panel2'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div><label className={modalLabel}>{t.shell.name}</label><input className={modalInput} value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder={t.shell.newChannelPlaceholder} /></div>
        <button className="w-full rounded-lg bg-nexa-violet px-4 py-2.5 font-bold text-white">{t.shell.createChannel}</button>
      </form>
    </Modal>
  );
}

// ─── DM-Seitenleiste ─────────────────────────────────────────────────────────
export interface DmConversation { id: string; channelId?: string; type?: string; participants?: PublicUser[]; lastMessage?: { content: string; createdAt: string } | null; name?: string }

export function DmSidebar() {
  const { t } = useLocale();
  const [dms, setDms] = useState<DmConversation[]>([]);
  const activeChannelId = useStore((s) => s.activeChannelId);
  const readStates = useStore((s) => s.readStates);
  const presences = useStore((s) => s.presences);
  const me = useStore((s) => s.user);
  const router = useRouter();
  const mobileOpen = useStore((s) => s.mobileNavOpen);
  const setMobileOpen = useStore((s) => s.setMobileNavOpen);

  useEffect(() => {
    get<unknown>('/dms').then((d) => setDms(extractList<DmConversation>(d, 'dms'))).catch(() => undefined);
    const s = getSocket();
    const refresh = () => { get<unknown>('/dms').then((d) => setDms(extractList<DmConversation>(d, 'dms'))).catch(() => undefined); };
    s.on('message:create', refresh);
    return () => { s.off('message:create', refresh); };
  }, []);

  const content = (
    <div data-tour="sidebar" className="flex h-full w-60 flex-col bg-nexa-panel">
      <div className="flex h-12 shrink-0 items-center border-b border-nexa-border px-4">
        <button className="w-full rounded-lg bg-nexa-panel2 px-3 py-1.5 text-left text-sm text-nexa-muted" onClick={() => useStore.getState().setQuickSearchOpen(true)}>
          {t.shell.dmSearch}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <button
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 font-medium ${!activeChannelId ? 'bg-nexa-panel3' : 'hover:bg-nexa-panel2'}`}
          onClick={() => router.push('/app/channels/@me')}
        >👥 {t.shell.friends}</button>
        <div className="px-3 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-nexa-muted flex items-center justify-between">
          {t.shell.directMessages}
          <button title={t.shell.groupDmCreate} onClick={() => router.push('/app/channels/@me?newGroup=1')}>＋</button>
        </div>
        {dms.map((dm) => {
          const cid = dm.channelId || dm.id;
          const others = (dm.participants || []).filter((p) => p.id !== me?.id);
          const title = dm.name || (others.length > 1 ? others.map((o) => displayNameOf(o)).join(', ') : displayNameOf(others[0]));
          const unread = (readStates[cid]?.mentionCount || 0) > 0;
          return (
            <button key={dm.id} className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left ${activeChannelId === cid ? 'bg-nexa-panel3' : 'hover:bg-nexa-panel2'}`} onClick={() => router.push(`/app/channels/@me/${cid}`)}>
              {others.length > 1 || !others[0] ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nexa-violet text-sm font-bold text-white">{initialsOf(title || '?')}</span>
              ) : (
                <Avatar user={{ ...others[0], status: (presences[others[0].id]?.status as PublicUser['status']) || others[0].status }} size={36} />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={`truncate text-sm ${unread ? 'font-bold' : 'font-medium'}`}>{title}</span>
                  {others.length === 1 && <UserBadgesInline user={others[0]} max={2} size={12} />}
                </span>
                {dm.lastMessage && <span className="block truncate text-xs text-nexa-muted">{dm.lastMessage.content}</span>}
              </span>
              {unread && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-nexa-danger px-1 text-[10px] font-bold text-white">{readStates[cid]!.mentionCount}</span>}
            </button>
          );
        })}
        {dms.length === 0 && <div className="px-3 py-4 text-sm text-nexa-muted">{t.shell.noConversations}</div>}
      </div>
      <UserPanel />
    </div>
  );

  return (
    <>
      <div className="hidden lg:block shrink-0 border-r border-nexa-border">{content}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-[72px] shadow-2xl">{content}</div>
        </div>
      )}
    </>
  );
}

export function MobileHamburger() {
  const { t } = useLocale();
  const setMobileOpen = useStore((s) => s.setMobileNavOpen);
  const mobileOpen = useStore((s) => s.mobileNavOpen);
  return (
    <button className="lg:hidden fixed left-[84px] top-2.5 z-40 rounded-lg bg-nexa-panel3 border border-nexa-border px-2.5 py-1.5" onClick={() => setMobileOpen(!mobileOpen)} aria-label={t.shell.openNav}>
      ☰
    </button>
  );
}

// ─── Nutzer-Panel (unten) ────────────────────────────────────────────────────
function UserPanel() {
  const { t } = useLocale();
  const me = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const myVoiceChannelId = useStore((s) => s.myVoiceChannelId);
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState(me?.customStatusText || '');
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceDeaf, setVoiceDeaf] = useState(false);
  const router = useRouter();
  if (!me) return null;

  const setStatus = async (status: string, text?: string) => {
    try {
      const updated = await post<PublicUser>('/users/me/status', { status, customStatusText: text ?? me.customStatusText ?? null });
      setUser({ ...me, ...updated, status: status as PublicUser['status'], customStatusText: text ?? me.customStatusText });
      getSocket().emit('presence:status', { status, customStatusText: text ?? me.customStatusText });
    } catch {
      /* Status bleibt lokal unverändert */
    }
    setOpen(false);
  };

  const statuses: Array<[string, string]> = [['ONLINE', t.status.online], ['IDLE', t.status.idle], ['DND', t.status.dnd], ['INVISIBLE', t.status.invisible]];

  return (
    <div data-tour="user-panel" className="relative shrink-0 bg-nexa-panel2/70 border-t border-nexa-border px-2 py-2">
      <div className="flex items-center gap-2">
        <button className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-nexa-panel3 text-left" onClick={() => setOpen((v) => !v)}>
          <Avatar user={me} size={36} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">{displayNameOf(me)}</span>
            <span className="block truncate text-xs text-nexa-muted leading-tight">{me.customStatusText || statusLabel(me.status)}</span>
          </span>
        </button>
        {myVoiceChannelId && (
          <>
            <button
              title={voiceMuted ? t.shell.unmute : t.shell.mute}
              className={`rounded-lg p-2 ${voiceMuted ? 'text-nexa-danger' : 'text-nexa-muted hover:text-nexa-text'}`}
              onClick={() => { setVoiceMuted((v) => !v); window.dispatchEvent(new CustomEvent('nexa-voice-control', { detail: 'mute' })); }}
            >🎙️</button>
            <button
              title={voiceDeaf ? t.shell.undeafen : t.shell.deafen}
              className={`rounded-lg p-2 ${voiceDeaf ? 'text-nexa-danger' : 'text-nexa-muted hover:text-nexa-text'}`}
              onClick={() => { setVoiceDeaf((v) => !v); window.dispatchEvent(new CustomEvent('nexa-voice-control', { detail: 'deafen' })); }}
            >🎧</button>
          </>
        )}
        <LanguageSwitcher />
        <button title={t.shell.settings} className="rounded-lg p-2 text-nexa-muted hover:text-nexa-text" onClick={() => router.push('/app/settings/account')}>⚙️</button>
      </div>
      {open && (
        <div className="absolute bottom-full left-2 mb-2 w-60 rounded-xl border border-nexa-border bg-nexa-panel3 py-1.5 shadow-2xl z-40 animate-pop-in" onMouseLeave={() => setOpen(false)}>
          {statuses.map(([k, l]) => (
            <button key={k} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-nexa-panel2" onClick={() => void setStatus(k)}>
              <StatusDot status={k} /> {l}
            </button>
          ))}
          <div className="border-t border-nexa-border mt-1.5 pt-1.5">
            <button className="block w-full px-3 py-1.5 text-left text-sm hover:bg-nexa-panel2" onClick={() => { setCustomOpen(true); setOpen(false); }}>{t.shell.setCustomStatus}</button>
            <button className="block w-full px-3 py-1.5 text-left text-sm hover:bg-nexa-panel2 text-nexa-danger" onClick={async () => {
              await post('/auth/logout', {}).catch(() => undefined);
              setToken(null);
              disconnectSocket();
              router.replace('/login');
            }}>{t.shell.logout}</button>
          </div>
        </div>
      )}
      {customOpen && (
        <Modal onClose={() => setCustomOpen(false)}>
          <div className="p-5 space-y-3">
            <h3 className="font-bold">{t.shell.customStatusTitle}</h3>
            <input className="w-full rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm outline-none" maxLength={128} value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder={t.shell.customStatusPlaceholder} />
            <button className="w-full rounded-lg bg-nexa-violet px-4 py-2 font-bold text-white" onClick={() => { void setStatus(me.status || 'ONLINE', customText); setCustomOpen(false); }}>{t.common.save}</button>
            <button className="w-full text-sm text-nexa-muted" onClick={() => { setCustomText(''); void setStatus(me.status || 'ONLINE', ''); setCustomOpen(false); }}>{t.shell.clearStatus}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function statusLabel(status?: string | null): string {
  return statusText(dicts[getActiveLocale()], status);
}

export function MemberListPanel({ serverId }: { serverId: string }) {
  const { t } = useLocale();
  const members = useStore((s) => s.members[serverId] || EMPTY_LIST);
  const rolesList = useStore((s) => s.roles[serverId] || EMPTY_LIST);
  const presences = useStore((s) => s.presences);
  const open = useStore((s) => s.memberListOpen);
  const setProfileUserId = useStore((s) => s.setProfileUserId);
  useEffect(() => {
    if ((useStore.getState().members[serverId] || []).length === 0) {
      get<unknown>(`/servers/${serverId}/members`).then((d) => {
        const list = extractList<Member>(d, 'members');
        if (list.length) useStore.getState().setServerData(serverId, { members: list });
      }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);
  if (!open) return null;
  const hoisted = rolesList.filter((r) => r.hoist).sort((a, b) => b.position - a.position);
  const byRole = new Map<string, Member[]>();
  const rest: Member[] = [];
  members.forEach((m) => {
    const rids = m.roleIds || m.roles?.map((r) => r.id) || [];
    const top = hoisted.find((r) => rids.includes(r.id));
    if (top) {
      if (!byRole.has(top.id)) byRole.set(top.id, []);
      byRole.get(top.id)!.push(m);
    } else rest.push(m);
  });
  const renderMember = (m: Member) => {
    const u = m.user;
    if (!u) return null;
    const status = presences[u.id]?.status || u.status;
    const customText = presences[u.id]?.customStatusText ?? u.customStatusText;
    return (
      <button key={m.id} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-nexa-panel2" onClick={() => setProfileUserId(u.id)}>
        <Avatar user={{ ...u, status: status as PublicUser['status'] }} size={34} />
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-sm font-medium truncate" style={{ color: topRoleColor(m, rolesList) }}>
            {m.nickname || displayNameOf(u)}
            {u.verified && <VerifiedBadge size={13} />}
            <UserBadgesInline user={u} max={3} size={12} />
            {u.isBot && <span className="rounded bg-nexa-violet px-1 text-[9px] font-bold text-white">BOT</span>}
          </span>
          {customText && <span className="block truncate text-[11px] text-nexa-muted">{customText}</span>}
        </span>
      </button>
    );
  };
  return (
    <aside className="hidden xl:block w-60 shrink-0 overflow-y-auto border-l border-nexa-border bg-nexa-panel px-2 py-3" aria-label={t.common.members}>
      {hoisted.map((r) => (byRole.get(r.id)?.length ? (
        <div key={r.id} className="mb-3">
          <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: r.color }}>{r.name} — {byRole.get(r.id)!.length}</div>
          {byRole.get(r.id)!.map(renderMember)}
        </div>
      ) : null))}
      {rest.length > 0 && (
        <div>
          <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-nexa-muted">{t.common.members} — {rest.length}</div>
          {rest.map(renderMember)}
        </div>
      )}
      {members.length === 0 && <div className="px-2 text-sm text-nexa-muted">{t.shell.membersLoading}</div>}
    </aside>
  );
}

function topRoleColor(m: Member, rolesList: Role[]): string | undefined {
  const rids = m.roleIds || m.roles?.map((r) => r.id) || [];
  const sorted = rolesList.filter((r) => rids.includes(r.id)).sort((a, b) => b.position - a.position);
  return sorted[0]?.color;
}
