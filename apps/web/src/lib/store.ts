import { create } from 'zustand';
import type { PublicUser, Server, Channel, Category, Role, Member, AppNotification, VoiceState } from './types';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  kind: 'info' | 'error' | 'success' | 'mention';
}

let toastSeq = 1;

export interface Store {
  user: PublicUser | null;
  ready: boolean;
  servers: Server[];
  channels: Record<string, Channel[]>;
  categories: Record<string, Category[]>;
  roles: Record<string, Role[]>;
  members: Record<string, Member[]>;
  activeServerId: string | null;
  activeChannelId: string | null;
  presences: Record<string, { status: string; customStatusText?: string | null }>;
  voiceStates: Record<string, VoiceState[]>;
  myVoiceChannelId: string | null;
  readStates: Record<string, { lastReadMessageId?: string; mentionCount: number }>;
  notifications: AppNotification[];
  toasts: Toast[];
  serverOrder: string[];
  mobileNavOpen: boolean;
  memberListOpen: boolean;
  profileUserId: string | null;
  quickSearchOpen: boolean;
  tutorialOpen: boolean;

  setUser: (u: PublicUser | null) => void;
  setReady: (v: boolean) => void;
  setServers: (s: Server[]) => void;
  upsertServer: (s: Server) => void;
  removeServer: (id: string) => void;
  setServerData: (serverId: string, data: { channels?: Channel[]; categories?: Category[]; roles?: Role[]; members?: Member[] }) => void;
  select: (serverId: string | null, channelId: string | null) => void;
  setPresence: (userId: string, p: { status: string; customStatusText?: string | null }) => void;
  setVoiceStates: (channelId: string, states: VoiceState[]) => void;
  setMyVoiceChannelId: (id: string | null) => void;
  setReadStates: (rs: Record<string, { lastReadMessageId?: string; mentionCount: number }>) => void;
  bumpMention: (channelId: string) => void;
  clearRead: (channelId: string) => void;
  setNotifications: (n: AppNotification[]) => void;
  addNotification: (n: AppNotification) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  setServerOrder: (o: string[]) => void;
  setMobileNavOpen: (v: boolean) => void;
  setMemberListOpen: (v: boolean) => void;
  setProfileUserId: (id: string | null) => void;
  setQuickSearchOpen: (v: boolean) => void;
  setTutorialOpen: (v: boolean) => void;
}

export const useStore = create<Store>((set) => ({
  user: null,
  ready: false,
  servers: [],
  channels: {},
  categories: {},
  roles: {},
  members: {},
  activeServerId: null,
  activeChannelId: null,
  presences: {},
  voiceStates: {},
  myVoiceChannelId: null,
  readStates: {},
  notifications: [],
  toasts: [],
  serverOrder: typeof window !== 'undefined' ? (() => { try { return JSON.parse(localStorage.getItem('nexa_server_order') || '[]') as string[]; } catch { return []; } })() : [],
  mobileNavOpen: false,
  memberListOpen: true,
  profileUserId: null,
  quickSearchOpen: false,
  tutorialOpen: false,

  setUser: (user) => set({ user }),
  setReady: (ready) => set({ ready }),
  setServers: (servers) => set({ servers }),
  upsertServer: (s) => set((st) => ({ servers: st.servers.some((x) => x.id === s.id) ? st.servers.map((x) => (x.id === s.id ? { ...x, ...s } : x)) : [...st.servers, s] })),
  removeServer: (id) => set((st) => ({ servers: st.servers.filter((s) => s.id !== id) })),
  setServerData: (serverId, data) =>
    set((st) => ({
      channels: data.channels ? { ...st.channels, [serverId]: data.channels } : st.channels,
      categories: data.categories ? { ...st.categories, [serverId]: data.categories } : st.categories,
      roles: data.roles ? { ...st.roles, [serverId]: data.roles } : st.roles,
      members: data.members ? { ...st.members, [serverId]: data.members } : st.members,
    })),
  select: (activeServerId, activeChannelId) => set({ activeServerId, activeChannelId, mobileNavOpen: false }),
  setPresence: (userId, p) => set((st) => ({ presences: { ...st.presences, [userId]: p } })),
  setVoiceStates: (channelId, states) => set((st) => ({ voiceStates: { ...st.voiceStates, [channelId]: states } })),
  setMyVoiceChannelId: (myVoiceChannelId) => set({ myVoiceChannelId }),
  setReadStates: (readStates) => set({ readStates }),
  bumpMention: (channelId) => set((st) => ({ readStates: { ...st.readStates, [channelId]: { ...st.readStates[channelId], mentionCount: (st.readStates[channelId]?.mentionCount || 0) + 1 } } })),
  clearRead: (channelId) => set((st) => ({ readStates: { ...st.readStates, [channelId]: { ...st.readStates[channelId], mentionCount: 0 } } })),
  setNotifications: (notifications) => set({ notifications }),
  addNotification: (n) => set((st) => ({ notifications: [n, ...st.notifications].slice(0, 100), toasts: [{ id: toastSeq++, title: n.title, body: n.body, kind: n.type === 'MENTION' || n.type === 'DM' ? 'mention' : 'info' } as Toast, ...st.toasts].slice(0, 5) })),
  toast: (t) => {
    const id = toastSeq++;
    set((st) => ({ toasts: [{ ...t, id }, ...st.toasts].slice(0, 5) }));
    setTimeout(() => set((st) => ({ toasts: st.toasts.filter((x) => x.id !== id) })), 5000);
  },
  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((x) => x.id !== id) })),
  setServerOrder: (serverOrder) => {
    try { localStorage.setItem('nexa_server_order', JSON.stringify(serverOrder)); } catch { /* ignore */ }
    set({ serverOrder });
  },
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setMemberListOpen: (memberListOpen) => set({ memberListOpen }),
  setProfileUserId: (profileUserId) => set({ profileUserId }),
  setQuickSearchOpen: (quickSearchOpen) => set({ quickSearchOpen }),
  setTutorialOpen: (tutorialOpen) => set({ tutorialOpen }),
}));

export const unreadTotal = (st: Store): number => Object.values(st.readStates).reduce((a, r) => a + (r.mentionCount || 0), 0);

/**
 * Stabile Leer-Liste als Fallback in useStore-Selektoren.
 * zustand v5 nutzt Reacts useSyncExternalStore ohne Ergebnis-Cache: Ein
 * literales `|| []` im Selektor liefert bei jedem getSnapshot-Aufruf eine
 * neue Referenz → React meldet „The result of getSnapshot should be cached“
 * und läuft in eine Endlosschleife (Fehler #185, „Maximum update depth
 * exceeded“), sobald der echte Eintrag (noch) nicht im Store liegt.
 * Diese eine Konstante ist referenzstabil und beendet die Schleife.
 */
export const EMPTY_LIST: never[] = [];
