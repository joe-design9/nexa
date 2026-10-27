'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { get, post, patch, del } from '../../../lib/api';
import { useStore } from '../../../lib/store';
import { extractList } from '../../../lib/hooks';
import { formatDateOnly } from '../../../lib/i18n';
import { useLocale } from '../../../lib/locale';
import type { Dict } from '../../../lib/i18n';
import type { PublicUser, Server } from '../../../lib/types';
import { displayNameOf } from '../../../lib/types';
import { badgeCategoryLabel, badgeName } from '../../../lib/badges';
import { OwnerMark } from '../../../components/ui';

interface Stats { users?: number; servers?: number; messages?: number; reportsOpen?: number; [k: string]: unknown }
interface ReportEntry { id: string; targetType: string; targetId: string; reason: string; status: string; reporter?: PublicUser; createdAt: string }
interface InviteEntry { id: string; code: string; maxUses: number; usedCount: number; revoked: boolean; expiresAt: string | null; createdAt: string; createdBy?: { id: string; username: string } | null; status: string }

function inviteStatusLabel(t: Dict, status: string): string {
  return t.admin.inviteStatus[status as keyof Dict['admin']['inviteStatus']] ?? status;
}

/**
 * Plattform-Invite-Verwaltung. Wird NUR in der Admin-Desktop-Version
 * eingeblendet (Build-Variante über die Desktop-Bridge) – die normale
 * Version zeigt diesen Bereich nicht. Serverseitig bleiben die
 * Endpunkte zusätzlich durch die Admin-Rolle geschützt.
 */
function PlatformInvitesSection({ toast }: { toast: (t: { title: string; body?: string; kind: 'info' | 'error' | 'success' | 'mention' }) => void }) {
  const { t, fmt } = useLocale();
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const [count, setCount] = useState(5);
  const [maxUses, setMaxUses] = useState(1);
  const [fresh, setFresh] = useState<InviteEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => {
    get<unknown>('/admin/platform-invites').then((d) => setInvites(extractList<InviteEntry>(d))).catch(() => undefined);
  };
  useEffect(load, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t.admin.copied, body: text, kind: 'success' });
    } catch {
      toast({ title: t.admin.copyFailed, kind: 'error' });
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const d = await post<unknown>('/admin/platform-invites', { count, maxUses });
      const created = extractList<InviteEntry>(d, 'codes');
      setFresh(created);
      toast({ title: fmt(t.admin.generated, { count: created.length }), kind: 'success' });
      load();
    } catch (e) {
      toast({ title: t.admin.generateFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (inv: InviteEntry) => {
    if (!window.confirm(fmt(t.admin.revokeConfirm, { code: inv.code }))) return;
    try {
      await post(`/admin/platform-invites/${inv.id}/revoke`, {});
      toast({ title: t.admin.revoked, body: inv.code, kind: 'success' });
      load();
    } catch (e) {
      toast({ title: t.admin.revokeFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    }
  };

  return (
    <section className="rounded-2xl border border-nexa-border bg-nexa-panel p-5">
      <h2 className="font-bold mb-1">{t.admin.invitesTitle}</h2>
      <p className="text-sm text-nexa-muted mb-4">{t.admin.invitesHint}</p>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-sm">
          <span className="block text-nexa-muted mb-1">{t.admin.count}</span>
          <input type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className="w-24 rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm outline-none" />
        </label>
        <label className="text-sm">
          <span className="block text-nexa-muted mb-1">{t.admin.usesPerCode}</span>
          <input type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} className="w-28 rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm outline-none" />
        </label>
        <button className="rounded-lg bg-nexa-success px-4 py-2 text-sm font-bold text-white disabled:opacity-60" disabled={busy} onClick={generate}>{busy ? t.admin.generating : t.admin.generate}</button>
      </div>
      {fresh.length > 0 && (
        <div className="mb-4 rounded-lg bg-nexa-panel2 p-3">
          <div className="text-xs font-bold text-nexa-muted mb-2">{t.admin.freshTitle}</div>
          <div className="flex flex-wrap gap-2">
            {fresh.map((c) => (
              <button key={c.id} className="rounded bg-nexa-panel3 px-2.5 py-1 font-mono text-xs" title={t.admin.clickToCopy} onClick={() => copy(c.code)}>{c.code} 📋</button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        {invites.map((inv) => (
          <div key={inv.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-nexa-panel2 px-3 py-2 text-sm">
            <button className="font-mono font-medium" title={t.admin.clickToCopy} onClick={() => copy(inv.code)}>{inv.code} 📋</button>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${inv.status === 'ACTIVE' ? 'bg-nexa-success/20 text-nexa-success' : 'bg-nexa-panel3 text-nexa-muted'}`}>{inviteStatusLabel(t, inv.status)}</span>
            <span className="text-xs text-nexa-muted">{fmt(t.admin.usedLine, { used: inv.usedCount, max: inv.maxUses, date: formatDateOnly(inv.createdAt) })}{inv.createdBy ? fmt(t.admin.bySuffix, { name: inv.createdBy.username }) : ''}{inv.expiresAt ? fmt(t.admin.expiresSuffix, { date: formatDateOnly(inv.expiresAt) }) : ''}</span>
            {!inv.revoked && (
              <button className="ml-auto rounded bg-nexa-panel3 px-2.5 py-1 text-xs text-nexa-danger" onClick={() => revoke(inv)}>{t.admin.revoke}</button>
            )}
          </div>
        ))}
        {invites.length === 0 && <div className="text-sm text-nexa-muted">{t.admin.noInvites}</div>}
      </div>
    </section>
  );
}

interface BadgeCatalogEntry { key: string; icon: string; category: string }
interface BadgeGrantEntry { key: string; grantedAt: string; grantedBy?: { id: string; username: string } | null }

/**
 * Abzeichen-Verwaltung. Wird NUR in der Admin-Desktop-Version
 * eingeblendet (Build-Variante über die Desktop-Bridge) – wie die
 * Invite-Verwaltung. Serverseitig sind die Endpunkte zusätzlich durch
 * die Admin-Rolle geschützt (AdminGuard).
 */
function PlatformBadgesSection({ toast }: { toast: (t: { title: string; body?: string; kind: 'info' | 'error' | 'success' | 'mention' }) => void }) {
  const { t, fmt } = useLocale();
  const [catalog, setCatalog] = useState<BadgeCatalogEntry[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [selected, setSelected] = useState<PublicUser | null>(null);
  const [grants, setGrants] = useState<BadgeGrantEntry[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    get<unknown>('/admin/badges').then((d) => setCatalog(extractList<BadgeCatalogEntry>(d, 'badges'))).catch(() => undefined);
  }, []);

  useEffect(() => {
    const q = query ? `?q=${encodeURIComponent(query)}` : '';
    get<unknown>(`/admin/users${q}`).then((d) => setResults(extractList<PublicUser>(d, 'users'))).catch(() => undefined);
  }, [query]);

  const loadGrants = (userId: string) => {
    get<unknown>(`/admin/users/${userId}/badges`).then((d) => setGrants(extractList<BadgeGrantEntry>(d, 'badges'))).catch(() => setGrants([]));
  };

  const selectUser = (u: PublicUser) => {
    setSelected(u);
    setGrants([]);
    loadGrants(u.id);
  };

  const toggle = async (entry: BadgeCatalogEntry) => {
    if (!selected || busyKey) return;
    const owned = grants.some((g) => g.key === entry.key);
    setBusyKey(entry.key);
    try {
      if (owned) await del(`/admin/users/${selected.id}/badges/${entry.key}`);
      else await post(`/admin/users/${selected.id}/badges`, { badgeKey: entry.key });
      toast({ title: owned ? t.admin.badgesRevokedToast : t.admin.badgesGrantedToast, body: badgeName(t, entry.key), kind: 'success' });
      loadGrants(selected.id);
    } catch (e) {
      toast({ title: t.common.actionFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    } finally {
      setBusyKey(null);
    }
  };

  const categories = [...new Set(catalog.map((c) => c.category))];

  return (
    <section className="rounded-2xl border border-nexa-border bg-nexa-panel p-5">
      <h2 className="font-bold mb-1">{t.admin.badgesTitle}</h2>
      <p className="text-sm text-nexa-muted mb-4">{t.admin.badgesHint}</p>
      <input
        className="mb-3 w-full rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm outline-none"
        placeholder={t.admin.badgesSearchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5 mb-4">
        {results.map((u) => (
          <button
            key={u.id}
            onClick={() => selectUser(u)}
            className={`rounded-full px-3 py-1.5 text-sm ${selected?.id === u.id ? 'bg-nexa-violet text-white font-semibold' : 'bg-nexa-panel3 hover:bg-nexa-border'}`}
          >
            {displayNameOf(u)} <span className="opacity-70">@{u.username}</span>
          </button>
        ))}
        {results.length === 0 && <span className="text-sm text-nexa-muted">{t.admin.noUsers}</span>}
      </div>
      {!selected && <div className="text-sm text-nexa-muted">{t.admin.badgesSelectUser}</div>}
      {selected && (
        <div>
          <h3 className="font-semibold mb-1">{fmt(t.admin.badgesOfUser, { name: displayNameOf(selected) })}</h3>
          <div className="text-sm text-nexa-muted mb-4">
            {grants.length === 0 ? t.admin.badgesNoBadges : grants.map((g) => badgeName(t, g.key)).join(' · ')}
          </div>
          <div className="space-y-4">
            {categories.map((category) => (
              <div key={category}>
                <div className="text-xs font-semibold uppercase tracking-wide text-nexa-muted mb-2">{badgeCategoryLabel(t, category)}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {catalog.filter((c) => c.category === category).map((entry) => {
                    const owned = grants.some((g) => g.key === entry.key);
                    return (
                      <div key={entry.key} className={`rounded-xl p-3 text-center ${owned ? 'bg-nexa-violet/15 border border-nexa-violet/50' : 'bg-nexa-panel2 border border-transparent'}`}>
                        <div className="flex justify-center mb-1">
                          {entry.key === 'OWNER' ? <OwnerMark size={30} /> : <span className="text-[30px] leading-none">{entry.icon}</span>}
                        </div>
                        <div className="text-[13px] font-semibold leading-tight">{badgeName(t, entry.key)}</div>
                        <div className="text-[11px] text-nexa-muted mb-2">{owned ? t.admin.badgesOwned : ''}</div>
                        <button
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${owned ? 'bg-nexa-panel3 text-nexa-danger' : 'bg-nexa-success text-white'} disabled:opacity-60`}
                          disabled={busyKey === entry.key}
                          onClick={() => void toggle(entry)}
                        >
                          {owned ? t.admin.badgesRevoke : t.admin.badgesGrant}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function AdminPage() {
  const { t, fmt } = useLocale();
  const user = useStore((s) => s.user);
  const toast = useStore((s) => s.toast);
  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [servers, setServers] = useState<Server[]>([]);
  const [adminBuild, setAdminBuild] = useState(false);

  // Invite-Verwaltung nur in der Admin-Desktop-Version anzeigen.
  useEffect(() => {
    let cancelled = false;
    const bridge = typeof window !== 'undefined' ? window.nexaDesktop : undefined;
    if (bridge?.getBuildVariant) {
      bridge.getBuildVariant().then((v) => { if (!cancelled) setAdminBuild(v === 'admin'); }).catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, []);

  const loadAll = () => {
    get<Stats>('/admin/stats').then(setStats).catch(() => undefined);
    get<unknown>('/admin/reports').then((d) => setReports(extractList<ReportEntry>(d, 'reports'))).catch(() => undefined);
    get<unknown>('/admin/servers').then((d) => setServers(extractList<Server>(d, 'servers'))).catch(() => undefined);
  };
  useEffect(loadAll, []);
  useEffect(() => {
    const q = userQuery ? `?q=${encodeURIComponent(userQuery)}` : '';
    get<unknown>(`/admin/users${q}`).then((d) => setUsers(extractList<PublicUser>(d, 'users'))).catch(() => undefined);
  }, [userQuery]);

  if (!user) return null;
  if (!user.isPlatformAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center bg-nexa-bg p-8 text-center">
        <div>
          <div className="text-4xl mb-2">🛡️</div>
          <div className="font-bold">{t.admin.noAccess}</div>
          <p className="text-sm text-nexa-muted">{t.admin.noAccessHint}</p>
          <Link href="/app/channels/@me" className="text-nexa-cyan text-sm underline">{t.admin.backToApp}</Link>
        </div>
      </div>
    );
  }

  const card = (label: string, value: unknown) => (
    <div className="rounded-2xl border border-nexa-border bg-nexa-panel p-5">
      <div className="text-3xl font-extrabold">{value === undefined || value === null ? '—' : String(value)}</div>
      <div className="text-sm text-nexa-muted mt-1">{label}</div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-nexa-bg p-5 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold">{t.admin.title}</h1>
          <Link href="/app/settings/account" className="ml-auto text-sm text-nexa-muted underline">{t.admin.toSettings}</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {card(t.admin.statUsers, stats?.users ?? (stats as Record<string, unknown> | null)?.totalUsers)}
          {card(t.admin.statServers, stats?.servers ?? (stats as Record<string, unknown> | null)?.totalServers)}
          {card(t.admin.statMessages, stats?.messages ?? (stats as Record<string, unknown> | null)?.totalMessages)}
          {card(t.admin.statReportsOpen, stats?.reportsOpen ?? (stats as Record<string, unknown> | null)?.openReports)}
        </div>

        {adminBuild && <PlatformInvitesSection toast={toast} />}

        {adminBuild && <PlatformBadgesSection toast={toast} />}

        <section className="rounded-2xl border border-nexa-border bg-nexa-panel p-5">
          <h2 className="font-bold mb-3">{fmt(t.admin.reportsTitle, { count: reports.length })}</h2>
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-nexa-panel2 px-3 py-2 text-sm">
                <span className="rounded bg-nexa-panel3 px-1.5 py-0.5 text-xs font-mono">{r.targetType}</span>
                <span className="flex-1 min-w-[180px]">{r.reason}</span>
                <span className="text-xs text-nexa-muted">{fmt(t.admin.reportMeta, { name: r.reporter ? displayNameOf(r.reporter) : '—', date: formatDateOnly(r.createdAt), status: r.status })}</span>
                {r.status === 'OPEN' || r.status === 'REVIEWING' ? (
                  <>
                    <button className="rounded bg-nexa-success px-2.5 py-1 text-xs font-bold text-white" onClick={async () => {
                      await post(`/admin/reports/${r.id}/resolve`, { status: 'RESOLVED' }).catch(() => patch(`/admin/reports/${r.id}`, { status: 'RESOLVED' }));
                      loadAll();
                    }}>{t.admin.resolve}</button>
                    <button className="rounded bg-nexa-panel3 px-2.5 py-1 text-xs" onClick={async () => {
                      await post(`/admin/reports/${r.id}/resolve`, { status: 'DISMISSED' }).catch(() => patch(`/admin/reports/${r.id}`, { status: 'DISMISSED' }));
                      loadAll();
                    }}>{t.admin.dismiss}</button>
                  </>
                ) : null}
              </div>
            ))}
            {reports.length === 0 && <div className="text-sm text-nexa-muted">{t.admin.noReports}</div>}
          </div>
        </section>

        <section className="rounded-2xl border border-nexa-border bg-nexa-panel p-5">
          <h2 className="font-bold mb-3">{t.admin.usersTitle}</h2>
          <input className="mb-3 w-full rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm outline-none" placeholder={t.admin.searchUsers} value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-nexa-panel2 px-3 py-2 text-sm">
                <span className="font-medium">{displayNameOf(u)}</span>
                <span className="text-nexa-muted">@{u.username}</span>
                {u.isPlatformAdmin && <span className="rounded bg-nexa-warn/20 text-nexa-warn px-1.5 py-0.5 text-[11px] font-bold">ADMIN</span>}
                <span className="ml-auto flex gap-1.5">
                  <button className="rounded bg-nexa-panel3 px-2.5 py-1 text-xs" onClick={async () => {
                    try {
                      await post(`/admin/users/${u.id}/verify`, { verified: !u.verified });
                      setUsers(users.map((x) => (x.id === u.id ? { ...x, verified: !x.verified } : x)));
                    } catch (e) { toast({ title: t.common.actionFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
                  }}>{u.verified ? t.admin.removeVerification : t.admin.verify}</button>
                  <button className="rounded bg-nexa-panel3 px-2.5 py-1 text-xs text-nexa-danger" onClick={async () => {
                    const banned = Boolean((u as unknown as Record<string, unknown>).isPlatformBanned);
                    try {
                      await post(`/admin/users/${u.id}/ban`, { banned: !banned });
                      toast({ title: banned ? t.admin.userUnbanned : t.admin.userBanned, kind: 'success' });
                      setUsers(users.map((x) => (x.id === u.id ? { ...x, ...(({ isPlatformBanned: !banned }) as object) } : x)));
                    } catch (e) { toast({ title: t.common.actionFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
                  }}>{(u as unknown as Record<string, unknown>).isPlatformBanned ? t.admin.unban : t.admin.ban}</button>
                </span>
              </div>
            ))}
            {users.length === 0 && <div className="text-sm text-nexa-muted">{t.admin.noUsers}</div>}
          </div>
        </section>

        <section className="rounded-2xl border border-nexa-border bg-nexa-panel p-5">
          <h2 className="font-bold mb-3">{t.admin.serversTitle}</h2>
          <div className="space-y-2">
            {servers.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg bg-nexa-panel2 px-3 py-2 text-sm">
                <span className="font-medium">{s.name}</span>
                <span className="text-nexa-muted text-xs">{s.category || ''} {s.memberCount !== undefined ? fmt(t.admin.membersSuffix, { count: s.memberCount }) : ''}</span>
                <button className="ml-auto rounded bg-nexa-panel3 px-2.5 py-1 text-xs text-nexa-danger" onClick={async () => {
                  if (!window.confirm(fmt(t.admin.deleteServerConfirm, { name: s.name }))) return;
                  try {
                    await del(`/admin/servers/${s.id}`);
                    setServers(servers.filter((x) => x.id !== s.id));
                  } catch (e) { toast({ title: t.common.deleteFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
                }}>{t.admin.delete}</button>
              </div>
            ))}
            {servers.length === 0 && <div className="text-sm text-nexa-muted">{t.admin.noServers}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
