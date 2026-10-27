'use client';
import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, VideoPresets, type RemoteParticipant, type LocalParticipant } from 'livekit-client';
import { post } from '../lib/api';
import { livekitUrl } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useStore } from '../lib/store';
import { useLocale } from '../lib/locale';
import type { Channel } from '../lib/types';
import { displayNameOf } from '../lib/types';
import { Avatar } from './ui';
import { perm } from '../lib/shared';

interface Tile {
  identity: string;
  name: string;
  isLocal: boolean;
  muted: boolean;
  speaking: boolean;
  videoTrack: MediaStreamTrack | null;
  screenTrack: MediaStreamTrack | null;
  handRaised: boolean;
}

interface VoiceSettings {
  ptt: boolean;
  inputId: string;
  outputId: string;
}

function loadSettings(): VoiceSettings {
  try {
    return { ptt: false, inputId: '', outputId: '', ...(JSON.parse(localStorage.getItem('nexa_voice_settings') || '{}') as Partial<VoiceSettings>) };
  } catch {
    return { ptt: false, inputId: '', outputId: '' };
  }
}

// Sprach-/Video-Ansicht: LiveKit-Room, Kacheln, Steuerung, PTT, Gerätewahl.
// Stage: Wer keine SPEAK-Berechtigung hat, bekommt serverseitig ein Token ohne
// Publish-Recht (listen-only). Hand heben ist ein sichtbarer Status über
// voice:state; ein späteres Sprechen erfordert ein neues Token mit Speak-Recht.
export default function VoiceView({ channel, serverId, onLeave }: { channel: Channel; serverId?: string | null; onLeave: () => void }) {
  const { t: dict, fmt } = useLocale();
  const me = useStore((s) => s.user);
  const toast = useStore((s) => s.toast);
  const [room, setRoom] = useState<Room | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [status, setStatus] = useState(dict.voice.connecting);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [camera, setCamera] = useState(false);
  const [screen, setScreen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [settings, setSettings] = useState<VoiceSettings>(() => loadSettings());
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [devOpen, setDevOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const screenRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const roomRef = useRef<Room | null>(null);
  const pttRef = useRef(settings.ptt);
  pttRef.current = settings.ptt;

  const roles = useStore((s) => s.roles);
  const members = useStore((s) => s.members);
  const canSpeak = (() => {
    if (channel.type !== 'STAGE') return true;
    if (!serverId || !me) return true;
    if (serverId && useStore.getState().servers.find((s) => s.id === serverId)?.ownerId === me.id) return true;
    const myMember = (members[serverId] || []).find((m) => m.userId === me.id);
    const myRoleIds = myMember?.roleIds || myMember?.roles?.map((r) => r.id) || [];
    let total = 0n;
    (roles[serverId] || []).forEach((r) => {
      if (r.isDefault || myRoleIds.includes(r.id)) {
        try { total |= BigInt(r.permissions); } catch { /* ignore */ }
      }
    });
    return perm(total, 'SPEAK') || perm(total, 'ADMINISTRATOR');
  })();
  const canModerateStage = (() => {
    if (!serverId || !me) return false;
    if (useStore.getState().servers.find((s) => s.id === serverId)?.ownerId === me.id) return true;
    const myMember = (members[serverId] || []).find((m) => m.userId === me.id);
    const myRoleIds = myMember?.roleIds || myMember?.roles?.map((r) => r.id) || [];
    let total = 0n;
    (roles[serverId] || []).forEach((r) => {
      if (r.isDefault || myRoleIds.includes(r.id)) {
        try { total |= BigInt(r.permissions); } catch { /* ignore */ }
      }
    });
    return perm(total, 'MUTE_MEMBERS') || perm(total, 'ADMINISTRATOR');
  })();

  const refreshTiles = () => {
    const r = roomRef.current;
    if (!r) return;
    const build = (p: LocalParticipant | RemoteParticipant, isLocal: boolean): Tile => {
      let videoTrack: MediaStreamTrack | null = null;
      let screenTrack: MediaStreamTrack | null = null;
      p.trackPublications.forEach((pub) => {
        if (!pub.track) return;
        if (pub.source === Track.Source.Camera) videoTrack = pub.track.mediaStreamTrack;
        if (pub.source === Track.Source.ScreenShare) screenTrack = pub.track.mediaStreamTrack;
      });
      let attrs: Record<string, string> = {};
      try { attrs = (p as unknown as { attributes?: Record<string, string> }).attributes || {}; } catch { /* ignore */ }
      return {
        identity: p.identity,
        name: p.name || p.identity,
        isLocal,
        muted: !p.isMicrophoneEnabled,
        speaking: p.isSpeaking,
        videoTrack,
        screenTrack,
        handRaised: attrs.raisedHand === 'true',
      };
    };
    const list: Tile[] = [build(r.localParticipant, true)];
    r.remoteParticipants.forEach((p) => list.push(build(p, false)));
    setTiles(list);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await post<{ token: string; url?: string; room?: string }>(`/voice/token`, { channelId: channel.id });
        if (cancelled) return;
        const r = new Room({ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: VideoPresets.h720.resolution } });
        roomRef.current = r;
        r.on(RoomEvent.ParticipantConnected, refreshTiles);
        r.on(RoomEvent.ParticipantDisconnected, refreshTiles);
        r.on(RoomEvent.TrackSubscribed, refreshTiles);
        r.on(RoomEvent.TrackUnsubscribed, refreshTiles);
        r.on(RoomEvent.TrackMuted, refreshTiles);
        r.on(RoomEvent.TrackUnmuted, refreshTiles);
        r.on(RoomEvent.ActiveSpeakersChanged, refreshTiles);
        r.on(RoomEvent.ParticipantAttributesChanged, refreshTiles);
        r.on(RoomEvent.Disconnected, () => { if (!cancelled) onLeave(); });
        await r.connect(data.url || livekitUrl(), data.token);
        if (cancelled) {
          await r.disconnect();
          return;
        }
        setRoom(r);
        setStatus(dict.voice.connected);
        useStore.getState().setMyVoiceChannelId(channel.id);
        await r.localParticipant.setMicrophoneEnabled(!settings.ptt);
        getSocket().emit('voice:state', { channelId: channel.id, muted: settings.ptt, deafened: false, video: false, screen: false });
        refreshTiles();
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          setDevices(devs);
        } catch { /* keine Geräte */ }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : dict.voice.connectFailed);
          setStatus(dict.voice.errorStatus);
        }
      }
    })();
    return () => {
      cancelled = true;
      const r = roomRef.current;
      roomRef.current = null;
      if (r) void r.disconnect();
      if (useStore.getState().myVoiceChannelId === channel.id) useStore.getState().setMyVoiceChannelId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  // Video-Tracks an <video>-Elemente hängen
  useEffect(() => {
    tiles.forEach((t) => {
      const v = videoRefs.current.get(t.identity);
      if (v) v.srcObject = t.videoTrack ? new MediaStream([t.videoTrack]) : null;
      const sv = screenRefs.current.get(t.identity);
      if (sv) sv.srcObject = t.screenTrack ? new MediaStream([t.screenTrack]) : null;
    });
  }, [tiles]);

  // PTT: Leertaste gedrückt halten = Mikro an
  useEffect(() => {
    if (!settings.ptt || !room) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        void room.localParticipant.setMicrophoneEnabled(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') void room.localParticipant.setMicrophoneEnabled(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [settings.ptt, room]);

  // Steuerung aus dem Nutzer-Panel (Stumm/Taub-Buttons) per DOM-Event
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      if (action === 'mute') void toggleMute();
      if (action === 'deafen') void toggleDeafen();
    };
    window.addEventListener('nexa-voice-control', handler);
    return () => window.removeEventListener('nexa-voice-control', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, muted, deafened, settings.ptt]);

  const saveSettings = (next: VoiceSettings) => {
    setSettings(next);
    try { localStorage.setItem('nexa_voice_settings', JSON.stringify(next)); } catch { /* ignore */ }
  };

  const toggleMute = async () => {
    if (!room) return;
    const next = !muted;
    setMuted(next);
    if (!settings.ptt) await room.localParticipant.setMicrophoneEnabled(!next);
    getSocket().emit('voice:state', { channelId: channel.id, muted: next, deafened, video: camera, screen });
  };

  const toggleDeafen = async () => {
    if (!room) return;
    const next = !deafened;
    setDeafened(next);
    room.remoteParticipants.forEach((p) => {
      p.audioTrackPublications.forEach((pub) => {
        if (pub.track) (pub.track as unknown as { detach: () => void }).detach?.();
      });
    });
    // LiveKit: Audio-Abonnement auf Raumebene umschalten (serverseitig bleiben Tracks bestehen)
    room.remoteParticipants.forEach((p) => {
      p.trackPublications.forEach((pub) => {
        if (pub.kind === Track.Kind.Audio) (pub as unknown as { setSubscribed: (b: boolean) => void }).setSubscribed(!next);
      });
    });
    if (next) {
      setMuted(true);
      await room.localParticipant.setMicrophoneEnabled(false);
    }
    getSocket().emit('voice:state', { channelId: channel.id, muted: next ? true : muted, deafened: next, video: camera, screen });
  };

  const toggleCamera = async () => {
    if (!room) return;
    const next = !camera;
    setCamera(next);
    await room.localParticipant.setCameraEnabled(next);
    getSocket().emit('voice:state', { channelId: channel.id, muted, deafened, video: next, screen });
    refreshTiles();
  };

  const toggleScreen = async () => {
    if (!room) return;
    const next = !screen;
    try {
      await room.localParticipant.setScreenShareEnabled(next);
      setScreen(next);
      getSocket().emit('voice:state', { channelId: channel.id, muted, deafened, video: camera, screen: next });
      refreshTiles();
    } catch (e) {
      toast({ title: dict.voice.screenShareCancelled, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    }
  };

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    getSocket().emit('voice:state', { channelId: channel.id, raisedHand: next });
    void room?.localParticipant.setAttributes({ raisedHand: next ? 'true' : 'false' }).catch(() => undefined);
    refreshTiles();
  };

  const disconnect = async () => {
    getSocket().emit('voice:state', { channelId: channel.id, left: true });
    try { await roomRef.current?.disconnect(); } catch { /* ignore */ }
    onLeave();
  };

  return (
    <div className="flex flex-1 flex-col bg-black/40 min-w-0 h-full">
      <div className="flex items-center gap-2 px-4 h-12 border-b border-nexa-border bg-nexa-bg shrink-0">
        <span className="text-nexa-muted">🔊</span>
        <span className="font-bold truncate">{channel.name}</span>
        <span className={`text-xs ${error ? 'text-nexa-danger' : 'text-nexa-success'}`}>{error || status}</span>
        {channel.type === 'STAGE' && !canSpeak && <span className="text-xs rounded bg-nexa-panel3 px-2 py-0.5">{dict.voice.stageListenOnly}</span>}
        {channel.type === 'STAGE' && canModerateStage && <span className="text-xs text-nexa-muted ml-2">{dict.voice.stageModeration}</span>}
        <div className="ml-auto relative">
          <button className="rounded bg-nexa-panel3 px-2.5 py-1 text-xs" onClick={() => setDevOpen((v) => !v)}>{dict.voice.devicesBtn}</button>
          {devOpen && (
            <div className="absolute right-0 top-9 z-40 w-72 rounded-xl border border-nexa-border bg-nexa-panel3 p-3 shadow-2xl space-y-3 text-sm">
              <label className="flex items-center justify-between gap-2">
                <span>{dict.voice.ptt}</span>
                <input type="checkbox" checked={settings.ptt} onChange={(e) => { const n = { ...settings, ptt: e.target.checked }; saveSettings(n); if (room) void room.localParticipant.setMicrophoneEnabled(!e.target.checked && !muted); }} />
              </label>
              <div>
                <div className="text-xs text-nexa-muted mb-1">{dict.voice.inputDevice}</div>
                <select value={settings.inputId} className="w-full rounded bg-nexa-panel2 border border-nexa-border px-2 py-1.5"
                  onChange={async (e) => { const id = e.target.value; saveSettings({ ...settings, inputId: id }); if (room && id) { try { await room.switchActiveDevice('audioinput', id); } catch { /* ignore */ } } }}>
                  <option value="">{dict.voice.defaultDevice}</option>
                  {devices.filter((d) => d.kind === 'audioinput').map((d, i) => (<option key={d.deviceId || i} value={d.deviceId}>{d.label || fmt(dict.voice.micFallback, { n: i + 1 })}</option>))}
                </select>
              </div>
              <div>
                <div className="text-xs text-nexa-muted mb-1">{dict.voice.outputDevice}</div>
                <select value={settings.outputId} className="w-full rounded bg-nexa-panel2 border border-nexa-border px-2 py-1.5"
                  onChange={async (e) => { const id = e.target.value; saveSettings({ ...settings, outputId: id }); if (room && id) { try { await room.switchActiveDevice('audiooutput', id); } catch { /* nicht überall unterstützt */ } } }}>
                  <option value="">{dict.voice.defaultDevice}</option>
                  {devices.filter((d) => d.kind === 'audiooutput').map((d, i) => (<option key={d.deviceId || i} value={d.deviceId}>{d.label || fmt(dict.voice.speakerFallback, { n: i + 1 })}</option>))}
                </select>
              </div>
              <div>
                <div className="text-xs text-nexa-muted mb-1">{dict.voice.cameraDevice}</div>
                <select className="w-full rounded bg-nexa-panel2 border border-nexa-border px-2 py-1.5" defaultValue=""
                  onChange={async (e) => { const id = e.target.value; if (room && id) { try { await room.switchActiveDevice('videoinput', id); } catch { /* ignore */ } } }}>
                  <option value="">{dict.voice.defaultDevice}</option>
                  {devices.filter((d) => d.kind === 'videoinput').map((d, i) => (<option key={d.deviceId || i} value={d.deviceId}>{d.label || fmt(dict.voice.cameraFallback, { n: i + 1 })}</option>))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tiles.length === 0 && <div className="text-center text-nexa-muted py-16">{dict.voice.connectingToChannel}</div>}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {tiles.map((t) => (
            <div key={t.identity} className={`relative aspect-video rounded-xl overflow-hidden bg-nexa-panel2 border-2 ${t.speaking ? 'border-nexa-success shadow-[0_0_0_3px_rgba(59,165,93,.35)]' : 'border-nexa-border'}`}>
              {t.screenTrack ? (
                <video ref={(el) => { if (el) screenRefs.current.set(t.identity, el); }} autoPlay playsInline muted={t.isLocal} className="h-full w-full object-contain bg-black" />
              ) : t.videoTrack ? (
                <video ref={(el) => { if (el) videoRefs.current.set(t.identity, el); }} autoPlay playsInline muted={t.isLocal} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Avatar user={{ id: t.identity, username: t.name, displayName: t.name, status: 'ONLINE' }} size={72} statusDot={false} />
                </div>
              )}
              <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 rounded bg-black/60 px-2 py-0.5 text-xs font-semibold">
                {t.muted ? '🔇' : '🎙️'} {t.isLocal ? `${displayNameOf(me || undefined)} ${dict.voice.youSuffix}` : t.name} {t.handRaised ? '✋' : ''}
              </div>
              {t.screenTrack && <div className="absolute top-1.5 left-1.5 rounded bg-black/60 px-2 py-0.5 text-[11px]">{dict.voice.screenShare}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-center gap-2 pb-5 pt-2">
        <VoiceBtn label={settings.ptt ? dict.voice.pttActive : muted ? dict.voice.unmute : dict.voice.mute} active={muted} disabled={!canSpeak && channel.type === 'STAGE'} onClick={() => void toggleMute()}>🎙️</VoiceBtn>
        <VoiceBtn label={deafened ? dict.voice.undeafen : dict.voice.deafen} active={deafened} onClick={() => void toggleDeafen()}>🎧</VoiceBtn>
        <VoiceBtn label={camera ? dict.voice.cameraOff : dict.voice.cameraOn} active={camera} disabled={!canSpeak && channel.type === 'STAGE'} onClick={() => void toggleCamera()}>📹</VoiceBtn>
        <VoiceBtn label={screen ? dict.voice.stopShare : dict.voice.shareScreen} active={screen} disabled={!canSpeak && channel.type === 'STAGE'} onClick={() => void toggleScreen()}>🖥️</VoiceBtn>
        {channel.type === 'STAGE' && !canSpeak && (
          <VoiceBtn label={handRaised ? dict.voice.lowerHand : dict.voice.raiseHand} active={handRaised} onClick={toggleHand}>✋</VoiceBtn>
        )}
        <button onClick={() => void disconnect()} className="ml-2 rounded-full bg-nexa-danger px-5 py-3 font-bold text-white hover:opacity-90" title={dict.voice.hangUpTitle}>{dict.voice.hangUp}</button>
      </div>
    </div>
  );
}

function VoiceBtn({ children, label, onClick, active, disabled }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button title={label} aria-label={label} onClick={onClick} disabled={disabled} className={`rounded-full px-4 py-3 text-lg ${active ? 'bg-nexa-danger text-white' : 'bg-nexa-panel3 hover:bg-nexa-border'} disabled:opacity-40`}>
      {children}
    </button>
  );
}
