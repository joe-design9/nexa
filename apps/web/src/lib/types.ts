// Nexa – öffentliche Typen der Web-App (tolerant gegenüber API-Varianten).
// Die serverseitigen DTOs werden als JSON empfangen; optionale Felder sind
// bewusst großzügig modelliert, damit Feld-Varianten nicht crashen.
import { dicts, getActiveLocale, LOCALE_TAG } from './i18n';

/**
 * Routen-Parameter sicher dekodieren: Next.js liefert spezielle Werte wie
 * '@me' aus useParams() prozentkodiert ('%40me') zurück, weil '@' im
 * App-Router als Slot-Präfix gilt. Alle Vergleiche (v. a. '@me') brauchen
 * den dekodierten Wert.
 */
export function decodeParam(v: string | string[] | undefined | null): string {
  const raw = Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export type PresenceStatus = 'ONLINE' | 'IDLE' | 'DND' | 'INVISIBLE' | 'OFFLINE';
export type ChannelType = 'TEXT' | 'VOICE' | 'ANNOUNCEMENT' | 'FORUM' | 'STAGE' | 'THREAD' | 'DM' | 'GROUP_DM';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  about?: string | null;
  pronouns?: string | null;
  status?: PresenceStatus;
  customStatusText?: string | null;
  customStatusEmoji?: string | null;
  verified?: boolean;
  isBot?: boolean;
  /** Schlüssel der gesammelten Abzeichen (Katalog in @nexa/shared), sofern der Endpunkt sie mitlädt. */
  badges?: string[];
  isPlatformAdmin?: boolean;
  email?: string;
  dateOfBirth?: string | null;
  dmPrivacy?: string;
  friendRequestPrivacy?: string;
  locale?: string | null;
  /** Zeitpunkt, zu dem die Onboarding-Tour gesehen wurde; null/fehlend = noch nicht gesehen. */
  tutorialSeenAt?: string | null;
  theme?: string;
  emailVerifiedAt?: string | null;
  createdAt?: string;
}

/** Eine Abzeichen-Vergabe, wie sie Profil- und Admin-Endpunkte liefern. */
export interface BadgeGrant {
  key: string;
  icon?: string;
  category?: string;
  grantedAt?: string;
  grantedBy?: { id: string; username: string } | null;
}

export interface Role {
  id: string;
  serverId: string;
  name: string;
  color: string;
  position: number;
  permissions: string;
  hoist?: boolean;
  mentionable?: boolean;
  isDefault?: boolean;
}

export interface Category {
  id: string;
  serverId: string;
  name: string;
  position: number;
}

export interface Channel {
  id: string;
  serverId?: string | null;
  categoryId?: string | null;
  name: string;
  type: ChannelType;
  topic?: string | null;
  position: number;
  slowmodeSeconds?: number;
  nsfw?: boolean;
  isPrivate?: boolean;
  parentChannelId?: string | null;
  archived?: boolean;
  participants?: PublicUser[];
}

export interface Server {
  id: string;
  name: string;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  description?: string | null;
  ownerId: string;
  isPublic?: boolean;
  category?: string;
  memberCount?: number;
  members?: Member[];
  channels?: Channel[];
  categories?: Category[];
  roles?: Role[];
  rulesText?: string | null;
  requireRulesAccept?: boolean;
  verificationRoleId?: string | null;
  verificationLevel?: string;
  myMember?: Member | null;
  myRoles?: string[];
  isFavorite?: boolean;
  automodEnabled?: boolean;
}

export interface Member {
  id: string;
  serverId: string;
  userId: string;
  nickname?: string | null;
  rulesAcceptedAt?: string | null;
  isVerifiedByButton?: boolean;
  timeoutUntil?: string | null;
  joinedAt?: string;
  user?: PublicUser;
  roleIds?: string[];
  roles?: Role[];
}

export interface Attachment {
  id?: string;
  fileName: string;
  url: string;
  contentType: string;
  size: number;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  author?: PublicUser;
  content: string;
  type?: string;
  replyToId?: string | null;
  replyTo?: Message | null;
  forwardedFromId?: string | null;
  pinned?: boolean;
  embeds?: Array<{ title?: string; description?: string; url?: string; image?: string; siteName?: string }> | null;
  attachments?: Attachment[];
  reactions?: Array<{ emoji: string; count: number; me?: boolean; users?: string[] }>;
  mentionEveryone?: boolean;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}

export interface VoiceState {
  userId: string;
  muted?: boolean;
  deafened?: boolean;
  video?: boolean;
  screen?: boolean;
  speaking?: boolean;
  raisedHand?: boolean;
  channelId?: string;
}

export interface Friend {
  id: string;
  status: string;
  user: PublicUser;
  otherUser?: PublicUser;
}

export const SERVER_CATEGORIES_FALLBACK = ['Gaming', 'Freunde', 'Lerngruppe', 'Community', 'Kreativ', 'Technik', 'Musik', 'Sport'];

export function displayNameOf(u: Partial<PublicUser> | undefined): string {
  const unknown = dicts[getActiveLocale()].common.unknown;
  if (!u) return unknown;
  return u.displayName || u.username || unknown;
}

export function initialsOf(name: string): string {
  const parts = (name || '?').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarColor(id: string): string {
  const colors = ['#7C5CFF', '#22D3EE', '#F472B6', '#F59E0B', '#3BA55D', '#EF4444', '#E879F9'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(LOCALE_TAG[getActiveLocale()], { hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dict = dicts[getActiveLocale()];
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return dict.common.today;
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return dict.common.yesterday;
  return d.toLocaleDateString(LOCALE_TAG[getActiveLocale()], { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

declare global {
  interface Window {
    __NEXA_API_URL__?: string;
    nexaDesktop?: {
      isDesktop: boolean;
      appVersion: string;
      getServerUrl: () => Promise<string>;
      setServerUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
      /** 'admin' nur in der Admin-Desktop-Version, sonst 'standard'. Ältere Builds: Methode fehlt. */
      getBuildVariant?: () => Promise<string>;
    };
  }
}
