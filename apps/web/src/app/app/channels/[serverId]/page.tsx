'use client';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { get, post } from '../../../../lib/api';
import { useStore } from '../../../../lib/store';
import { extractList } from '../../../../lib/hooks';
import { useLocale } from '../../../../lib/locale';
import type { PublicUser } from '../../../../lib/types';
import { displayNameOf, decodeParam } from '../../../../lib/types';
import { Avatar, EmptyState, UserBadgesInline } from '../../../../components/ui';

function FriendsInner() {
  const { t } = useLocale();
  const params = useParams<{ serverId: string }>();
  const serverId = decodeParam(params.serverId);
  const search = useSearchParams();
  const router = useRouter();
  const channels = useStore((s) => s.channels);
  const newGroup = search.get('newGroup') === '1';

  // Weiterleitung: erster Textkanal des Servers
  useEffect(() => {
    if (serverId === '@me') return;
    const list = channels[serverId] || [];
    const first = list.find((c) => c.type === 'TEXT') || list.find((c) => c.type === 'ANNOUNCEMENT');
    if (first) router.replace(`/app/channels/${serverId}/${first.id}`);
  }, [serverId, channels, router]);

  if (serverId !== '@me') {
    return (
      <div className="flex flex-1 items-center justify-center bg-nexa-bg p-8 text-center">
        <div>
          <div className="text-4xl mb-3">💬</div>
          <div className="font-bold text-lg">{t.friends.pickChannel}</div>
          <div className="text-sm text-nexa-muted">{t.friends.pickChannelHint}</div>
        </div>
      </div>
    );
  }
  return <FriendsView initialGroup={newGroup} />;
}

type FriendTab = 'online' | 'all' | 'pending' | 'blocked' | 'add';
interface FriendEntry { id: string; status: string; user?: PublicUser; requester?: PublicUser; addressee?: PublicUser; otherUser?: PublicUser }

function FriendsView({ initialGroup }: { initialGroup?: boolean }) {
  const { t, fmt } = useLocale();
  const [tab, setTab] = useState<FriendTab>('online');
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [username, setUsername] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [groupOpen, setGroupOpen] = useState(!!initialGroup);
  const [groupPicks, setGroupPicks] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const router = useRouter();
  const toast = useStore((s) => s.toast);
  const presences = useStore((s) => s.presences);
  const me = useStore((s) => s.user);

  const load = () => {
    get<unknown>(`/friends?tab=${tab === 'add' ? 'all' : tab}`)
      .then((d) => setFriends(normalizeFriends(extractList<FriendEntry>(d, 'friends'), me?.id)))
      .catch(() => setFriends([]));
  };
  useEffect(load, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const entryUser = (f: FriendEntry): PublicUser | undefined => f.otherUser || f.user || (f.requester?.id === me?.id ? f.addressee : f.requester) || f.addressee || f.requester;

  const filtered = friends.filter((f) => {
    const u = entryUser(f);
    if (!u) return false;
    if (tab === 'online') return f.status === 'ACCEPTED' && ((presences[u.id]?.status || u.status) === 'ONLINE' || (presences[u.id]?.status || u.status) === 'IDLE' || (presences[u.id]?.status || u.status) === 'DND');
    if (tab === 'all') return f.status === 'ACCEPTED';
    if (tab === 'pending') return f.status === 'PENDING';
    if (tab === 'blocked') return f.status === 'BLOCKED';
    return true;
  });

  const act = async (f: FriendEntry, action: 'accept' | 'decline' | 'block' | 'unblock' | 'remove') => {
    const u = entryUser(f);
    try {
      if (action === 'remove') await (await import('../../../../lib/api')).del(`/friends/${f.id}`).catch(() => post('/friends/remove', { userId: u?.id }));
      else await post(`/friends/${action}`, { userId: u?.id, friendshipId: f.id });
      toast({ title: t.common.actionDone, kind: 'success' });
      load();
    } catch (e) {
      toast({ title: t.common.actionFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    }
  };

  const openDm = async (u: PublicUser) => {
    try {
      const dm = await post<{ id: string; channelId?: string }>('/dms', { userId: u.id });
      router.push(`/app/channels/@me/${dm.channelId || dm.id}`);
    } catch (e) {
      toast({ title: t.friends.dmOpenFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    }
  };

  const acceptedFriends = friends.filter((f) => f.status === 'ACCEPTED');

  return (
    <div className="flex flex-1 flex-col bg-nexa-bg min-w-0">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-nexa-border px-4 overflow-x-auto">
        <span className="font-bold shrink-0">{t.friends.title}</span>
        {([['online', t.friends.tabs.online], ['all', t.friends.tabs.all], ['pending', t.friends.tabs.pending], ['blocked', t.friends.tabs.blocked], ['add', t.friends.tabs.add]] as Array<[FriendTab, string]>).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${tab === k ? k === 'add' ? 'bg-nexa-success text-white' : 'bg-nexa-panel3 text-nexa-text' : 'text-nexa-muted hover:text-nexa-text'}`}>
            {l}
          </button>
        ))}
        <button className="ml-auto shrink-0 rounded-full bg-nexa-panel3 px-3 py-1 text-sm" onClick={() => setGroupOpen((v) => !v)}>{t.friends.createGroupDm}</button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {groupOpen && (
          <div className="mb-5 rounded-xl border border-nexa-border bg-nexa-panel p-4 space-y-3">
            <div className="font-bold">{t.friends.newGroupDm}</div>
            <input className="w-full rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm outline-none" placeholder={t.friends.groupNamePlaceholder} value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {acceptedFriends.map((f) => {
                const u = entryUser(f)!;
                const picked = groupPicks.includes(u.id);
                return (
                  <button key={f.id} onClick={() => setGroupPicks(picked ? groupPicks.filter((x) => x !== u.id) : [...groupPicks, u.id])} className={`rounded-full px-3 py-1.5 text-sm ${picked ? 'bg-nexa-violet text-white' : 'bg-nexa-panel3'}`}>
                    {picked ? '✓ ' : ''}{displayNameOf(u)}
                  </button>
                );
              })}
              {acceptedFriends.length === 0 && <span className="text-sm text-nexa-muted">{t.friends.addFriendsFirst}</span>}
            </div>
            <button
              className="rounded-lg bg-gradient-to-r from-nexa-violet to-nexa-cyan px-4 py-2 font-bold text-white disabled:opacity-50"
              disabled={groupPicks.length < 2}
              onClick={async () => {
                try {
                  const dm = await post<{ id: string; channelId?: string }>('/dms/group', { userIds: groupPicks, name: groupName || undefined });
                  router.push(`/app/channels/@me/${dm.channelId || dm.id}`);
                } catch (e) {
                  toast({ title: t.friends.groupCreateFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
                }
              }}
            >{fmt(t.friends.createGroup, { count: groupPicks.length })}</button>
          </div>
        )}

        {tab === 'add' ? (
          <div className="max-w-lg">
            <h3 className="font-bold mb-1">{t.friends.addTitle}</h3>
            <p className="text-sm text-nexa-muted mb-3">{t.friends.addHint}</p>
            <form className="flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              setMsg(null);
              try {
                await post('/friends', { username: username.trim(), action: 'request' }).catch(() => post('/friends/request', { username: username.trim() }));
                setMsg(fmt(t.friends.requestSent, { name: username.trim() }));
                setUsername('');
              } catch (err) {
                setMsg(err instanceof Error ? err.message : t.friends.requestFailed);
              }
            }}>
              <input className="flex-1 rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2.5 text-sm outline-none focus:border-nexa-violet" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t.friends.usernamePlaceholder} required />
              <button className="rounded-lg bg-nexa-violet px-4 py-2.5 font-bold text-white">{t.friends.sendRequest}</button>
            </form>
            {msg && <div className="mt-3 text-sm text-nexa-muted">{msg}</div>}
          </div>
        ) : (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase text-nexa-muted mb-2">
              {tab === 'online' ? t.friends.listOnline : tab === 'all' ? t.friends.listAll : tab === 'pending' ? t.friends.listPending : t.friends.listBlocked} — {filtered.length}
            </div>
            {filtered.map((f) => {
              const u = entryUser(f)!;
              return (
                <div key={f.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-nexa-panel">
                  <Avatar user={{ ...u, status: (presences[u.id]?.status as PublicUser['status']) || u.status }} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold truncate">{displayNameOf(u)}</span>
                      <UserBadgesInline user={u} max={2} size={13} />
                    </div>
                    <div className="text-xs text-nexa-muted truncate">{presences[u.id]?.customStatusText || u.customStatusText || u.status || ''}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {f.status === 'ACCEPTED' && <button className="rounded-full bg-nexa-panel3 px-3 py-1.5 text-sm" onClick={() => void openDm(u)}>{t.friends.message}</button>}
                    {f.status === 'PENDING' && (
                      <>
                        <button className="rounded-full bg-nexa-success px-3 py-1.5 text-sm font-bold text-white" onClick={() => void act(f, 'accept')}>{t.friends.accept}</button>
                        <button className="rounded-full bg-nexa-panel3 px-3 py-1.5 text-sm" onClick={() => void act(f, 'decline')}>{t.friends.decline}</button>
                      </>
                    )}
                    {f.status === 'BLOCKED' && <button className="rounded-full bg-nexa-panel3 px-3 py-1.5 text-sm" onClick={() => void act(f, 'unblock')}>{t.friends.unblock}</button>}
                    {f.status === 'ACCEPTED' && <button className="rounded-full bg-nexa-panel3 px-3 py-1.5 text-sm text-nexa-danger" onClick={() => { if (window.confirm(fmt(t.friends.removeConfirm, { name: displayNameOf(u) }))) void act(f, 'remove'); }}>{t.friends.remove}</button>}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <EmptyState title={t.friends.emptyTitle} hint={tab === 'blocked' ? t.friends.emptyBlocked : tab === 'pending' ? t.friends.emptyPending : t.friends.emptyDefault} />}
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeFriends(list: FriendEntry[], myId?: string): FriendEntry[] {
  return list.map((f) => ({ ...f, otherUser: f.otherUser || f.user || (f.requester?.id === myId ? f.addressee : f.requester) }));
}

export default function ServerIndexPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-nexa-bg" />}>
      <FriendsInner />
    </Suspense>
  );
}
