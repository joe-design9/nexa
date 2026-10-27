'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { get, post, del } from '../../../../../lib/api';
import { useStore, EMPTY_LIST, type Store } from '../../../../../lib/store';
import { extractList } from '../../../../../lib/hooks';
import { useLocale } from '../../../../../lib/locale';
import type { Channel, PublicUser } from '../../../../../lib/types';
import { displayNameOf, decodeParam } from '../../../../../lib/types';
import { ChatView, ChannelTypeIcon } from '../../../../../components/chat';
import VoiceView from '../../../../../components/voice';
import { MemberListPanel, MobileHamburger, VoiceParticipantRow, useShellActions } from '../../../../../components/shell';
import type { DmConversation } from '../../../../../components/shell';
import { Avatar, EmptyState } from '../../../../../components/ui';

export default function ChannelPage() {
  const params = useParams<{ serverId: string; channelId: string }>();
  const serverId = decodeParam(params.serverId);
  const channelId = decodeParam(params.channelId);
  const isDmContext = serverId === '@me';
  return (
    <>
      <MobileHamburger />
      {isDmContext ? <DmChannelView channelId={channelId} /> : <ServerChannelView serverId={serverId} channelId={channelId} />}
    </>
  );
}

// ─── Server-Kanal ────────────────────────────────────────────────────────────
function ServerChannelView({ serverId, channelId }: { serverId: string; channelId: string }) {
  const { t } = useLocale();
  const channel = useStore((s: Store) => (s.channels[serverId] || []).find((c) => c.id === channelId));
  const server = useStore((s: Store) => s.servers.find((x) => x.id === serverId));
  const actions = useShellActions();
  const [joinedVoice, setJoinedVoice] = useState(false);
  const [threadChannel, setThreadChannel] = useState<Channel | null>(null);

  useEffect(() => {
    setJoinedVoice(false);
    setThreadChannel(null);
  }, [channelId]);

  if (!channel) {
    return (
      <div className="flex flex-1 items-center justify-center bg-nexa-bg p-8">
        <EmptyState title={t.channelPage.loadingChannel} hint={t.channelPage.loadingChannelHint} />
      </div>
    );
  }

  if (channel.type === 'VOICE' || channel.type === 'STAGE') {
    if (joinedVoice) {
      return <VoiceView channel={channel} serverId={serverId} onLeave={() => setJoinedVoice(false)} />;
    }
    return <VoiceJoinScreen channel={channel} serverId={serverId} onJoin={() => setJoinedVoice(true)} />;
  }

  if (channel.type === 'FORUM') {
    if (threadChannel) {
      return (
        <div className="flex flex-1 min-w-0">
          <div className="flex flex-1 min-w-0 flex-col">
            <button className="self-start m-2 rounded-lg bg-nexa-panel3 px-3 py-1.5 text-sm" onClick={() => setThreadChannel(null)}>{t.channelPage.backToForum}</button>
            <ChatView channel={threadChannel} serverId={serverId} />
          </div>
        </div>
      );
    }
    return <ForumView channel={channel} serverId={serverId} onOpenThread={setThreadChannel} />;
  }

  return (
    <div className="flex flex-1 min-w-0">
      <ChatView channel={channel} serverId={serverId} onOpenChannelSettings={(c) => actions.openChannelSettings(c)} />
      <MemberListPanel serverId={serverId} />
      <span className="hidden">{server?.name}</span>
    </div>
  );
}

function VoiceJoinScreen({ channel, serverId, onJoin }: { channel: Channel; serverId: string; onJoin: () => void }) {
  const { t } = useLocale();
  const states = useStore((s: Store) => s.voiceStates[channel.id] || EMPTY_LIST);
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-nexa-bg p-8 text-center gap-4">
      <ChannelTypeIcon type={channel.type} size={56} />
      <h2 className="text-2xl font-bold">{channel.name}</h2>
      {channel.type === 'STAGE' && <p className="text-nexa-muted max-w-md">{t.channelPage.stageInfo}</p>}
      {states.length > 0 && (
        <div className="w-64 rounded-xl bg-nexa-panel p-3 text-left space-y-1">
          <div className="text-xs font-semibold uppercase text-nexa-muted mb-1">{t.channelPage.alreadyConnected}</div>
          {states.map((v) => (<VoiceParticipantRow key={v.userId} serverId={serverId} state={v} />))}
        </div>
      )}
      <button onClick={onJoin} className="rounded-xl bg-gradient-to-r from-nexa-violet to-nexa-cyan px-8 py-3.5 font-bold text-white text-lg shadow-lg">
        {channel.type === 'STAGE' ? t.channelPage.joinStage : t.channelPage.joinVoice}
      </button>
    </div>
  );
}

function ForumView({ channel, serverId, onOpenThread }: { channel: Channel; serverId: string; onOpenThread: (c: Channel) => void }) {
  const { t } = useLocale();
  const [threads, setThreads] = useState<Channel[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const toast = useStore((s: Store) => s.toast);
  const load = () => {
    get<unknown>(`/channels/${channel.id}/threads`).then((d) => setThreads(extractList<Channel>(d, 'threads'))).catch(() => undefined);
  };
  useEffect(load, [channel.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-1 flex-col bg-nexa-bg min-w-0">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-nexa-border px-4">
        <ChannelTypeIcon type="FORUM" size={20} />
        <span className="font-bold">{channel.name}</span>
        {channel.topic && <span className="hidden md:block truncate text-sm text-nexa-muted border-l border-nexa-border pl-3">{channel.topic}</span>}
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <form
          className="rounded-xl border border-nexa-border bg-nexa-panel p-4 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const th = await post<Channel>(`/channels/${channel.id}/threads`, { name: title, content });
              setTitle('');
              setContent('');
              load();
              onOpenThread({ ...th, type: 'THREAD' });
            } catch (err) {
              toast({ title: t.channelPage.postFailed, body: err instanceof Error ? err.message : undefined, kind: 'error' });
            }
          }}
        >
          <div className="font-bold text-sm">{t.channelPage.newPost}</div>
          <input className="w-full rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm outline-none" placeholder={t.channelPage.postTitle} value={title} onChange={(e) => setTitle(e.target.value)} required />
          <textarea className="w-full rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm outline-none" placeholder={t.channelPage.postContentPlaceholder} rows={2} value={content} onChange={(e) => setContent(e.target.value)} />
          <button className="rounded-lg bg-nexa-violet px-4 py-2 text-sm font-bold text-white">{t.channelPage.postButton}</button>
        </form>
        {threads.map((th) => (
          <button key={th.id} className="block w-full rounded-xl border border-nexa-border bg-nexa-panel p-4 text-left hover:bg-nexa-panel2" onClick={() => onOpenThread({ ...th, type: 'THREAD' })}>
            <div className="font-bold">🧵 {th.name}</div>
            <div className="text-xs text-nexa-muted">{th.archived ? t.channelPage.archived : t.channelPage.active}</div>
          </button>
        ))}
        {threads.length === 0 && <EmptyState title={t.channelPage.noPosts} hint={t.channelPage.noPostsHint} />}
      </div>
      <span className="hidden">{serverId}</span>
    </div>
  );
}

// ─── DM / Gruppen-DM ─────────────────────────────────────────────────────────
function DmChannelView({ channelId }: { channelId: string }) {
  const { t, fmt } = useLocale();
  const me = useStore((s: Store) => s.user);
  const [convo, setConvo] = useState<DmConversation | null>(null);
  const [inCall, setInCall] = useState(false);
  const [videoCall, setVideoCall] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const toast = useStore((s: Store) => s.toast);
  const router = useRouter();

  const load = () => {
    get<unknown>('/dms')
      .then((d) => {
        const list = extractList<DmConversation>(d, 'dms');
        setConvo(list.find((c) => (c.channelId || c.id) === channelId) || null);
      })
      .catch(() => undefined);
  };
  useEffect(load, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const participants = convo?.participants || [];
  const others = participants.filter((p) => p.id !== me?.id);
  const isGroup = (convo?.type === 'GROUP_DM') || participants.length > 2;
  const title = convo?.name || others.map((o) => displayNameOf(o)).join(', ') || t.channelPage.directMessage;

  const channelObj: Channel = useMemo(
    () => ({ id: channelId, name: title, type: isGroup ? 'GROUP_DM' : 'DM', position: 0, participants }),
    [channelId, title, isGroup, participants],
  );

  if (inCall) {
    return (
      <VoiceView
        channel={channelObj}
        onLeave={() => { setInCall(false); setVideoCall(false); }}
      />
    );
  }

  return (
    <div className="flex flex-1 min-w-0 flex-col">
      <div className="flex">
        <div className="flex-1 min-w-0">
          <ChatView
            channel={channelObj}
            isDm
            headerExtra={
              <span className="flex items-center gap-1">
                <button title={t.channelPage.startVoiceCall} className="rounded-md p-1.5 text-lg text-nexa-muted hover:text-nexa-text hover:bg-nexa-panel3" onClick={() => { setVideoCall(false); setInCall(true); }}>📞</button>
                <button title={t.channelPage.startVideoCall} className="rounded-md p-1.5 text-lg text-nexa-muted hover:text-nexa-text hover:bg-nexa-panel3" onClick={() => { setVideoCall(true); setInCall(true); }}>📹</button>
                {isGroup && <button title={t.channelPage.addMember} className="rounded-md p-1.5 text-lg text-nexa-muted hover:text-nexa-text hover:bg-nexa-panel3" onClick={() => setAddOpen((v) => !v)}>➕</button>}
              </span>
            }
          />
        </div>
      </div>
      {isGroup && (
        <div className="border-t border-nexa-border bg-nexa-panel px-4 py-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase text-nexa-muted mr-1">{t.channelPage.participants}</span>
          {participants.map((p) => (
            <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-nexa-panel3 pl-1 pr-2.5 py-0.5 text-xs">
              <Avatar user={p} size={20} statusDot={false} />
              {displayNameOf(p)}
              {p.id !== me?.id && (
                <button title={t.channelPage.removeFromGroup} className="text-nexa-muted hover:text-nexa-danger" onClick={async () => {
                  if (!window.confirm(fmt(t.channelPage.removeFromGroupConfirm, { name: displayNameOf(p) }))) return;
                  try {
                    await del(`/dms/${channelId}/participants/${p.id}`);
                    load();
                  } catch (e) { toast({ title: t.channelPage.removeFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
                }}>✕</button>
              )}
            </span>
          ))}
          {videoCall && null}
        </div>
      )}
      {addOpen && isGroup && <AddGroupMember channelId={channelId} existing={participants.map((p) => p.id)} onDone={() => { setAddOpen(false); load(); }} />}
      {!convo && (
        <div className="px-4 pb-2">
          <button className="text-xs text-nexa-muted underline" onClick={() => router.push('/app/channels/@me')}>{t.channelPage.convoNotFound}</button>
        </div>
      )}
    </div>
  );
}

function AddGroupMember({ channelId, existing, onDone }: { channelId: string; existing: string[]; onDone: () => void }) {
  const { t, fmt } = useLocale();
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const toast = useStore((s: Store) => s.toast);
  useEffect(() => {
    get<unknown>('/friends?tab=all')
      .then((d) => {
        const list = extractList<{ user?: PublicUser; otherUser?: PublicUser; addressee?: PublicUser; requester?: PublicUser }>(d, 'friends');
        setFriends(list.map((f) => f.otherUser || f.user || f.addressee || f.requester).filter(Boolean) as PublicUser[]);
      })
      .catch(() => undefined);
  }, []);
  return (
    <div className="border-t border-nexa-border bg-nexa-panel px-4 py-3">
      <div className="text-sm font-bold mb-2">{t.channelPage.addFriendToGroup}</div>
      <div className="flex flex-wrap gap-2">
        {friends.filter((f) => !existing.includes(f.id)).map((f) => (
          <button key={f.id} className="rounded-full bg-nexa-panel3 px-3 py-1.5 text-sm" onClick={async () => {
            try {
              await post(`/dms/${channelId}/participants`, { userId: f.id });
              toast({ title: fmt(t.channelPage.addedToast, { name: displayNameOf(f) }), kind: 'success' });
              onDone();
            } catch (e) { toast({ title: t.channelPage.addFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
          }}>＋ {displayNameOf(f)}</button>
        ))}
        {friends.filter((f) => !existing.includes(f.id)).length === 0 && <span className="text-sm text-nexa-muted">{t.channelPage.noMoreFriends}</span>}
      </div>
    </div>
  );
}
