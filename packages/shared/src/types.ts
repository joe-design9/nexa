/**
 * DTO-Typen und Konstanten, die Backend und Frontend gemeinsam nutzen.
 * Datumsfelder sind als `string | Date` typisiert, weil Prisma auf dem
 * Server `Date`-Objekte liefert und JSON auf dem Client ISO-Strings.
 */

export type PresenceStatus =
  | 'ONLINE'
  | 'IDLE'
  | 'DND'
  | 'INVISIBLE'
  | 'OFFLINE';

export type ChannelType =
  | 'TEXT'
  | 'VOICE'
  | 'ANNOUNCEMENT'
  | 'FORUM'
  | 'STAGE'
  | 'THREAD'
  | 'DM'
  | 'GROUP_DM';

export type VerificationLevel =
  | 'NONE'
  | 'EMAIL'
  | 'ACCOUNT_AGE'
  | 'MEMBER_AGE'
  | 'PHONE';

export type NotificationLevel = 'ALL' | 'MENTIONS' | 'NOTHING';

export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'BLOCKED';

export type MessageType = 'DEFAULT' | 'REPLY' | 'SYSTEM' | 'CALL';

type DateLike = string | Date;

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  about?: string | null;
  pronouns?: string | null;
  status: PresenceStatus;
  customStatusText?: string | null;
  customStatusEmoji?: string | null;
  verified: boolean;
  isBot: boolean;
  /** Schlüssel der gesammelten Abzeichen (Katalog: ./badges.ts). Nur
   *  gesetzt, wenn der Endpunkt die Abzeichen mitlädt. */
  badges?: string[];
  createdAt: DateLike;
}

export interface RoleDto {
  id: string;
  serverId: string;
  name: string;
  color: string;
  icon?: string | null;
  position: number;
  /** Berechtigungen als Dezimal-String eines BigInt-Bitfelds. */
  permissions: string;
  isDefault: boolean;
  mentionable: boolean;
  hoist: boolean;
}

export interface MemberDto {
  id: string;
  serverId: string;
  userId: string;
  nickname?: string | null;
  roleIds: string[];
  joinedAt: DateLike;
  timeoutUntil?: DateLike | null;
  user: PublicUser;
}

export interface ChannelDto {
  id: string;
  serverId?: string | null;
  categoryId?: string | null;
  name: string;
  type: ChannelType;
  topic?: string | null;
  position: number;
  slowmodeSeconds: number;
  nsfw: boolean;
  isPrivate: boolean;
  parentChannelId?: string | null;
  archived: boolean;
  /** Effektive Kanalrechte des anfragenden Nutzers (BigInt als Dezimal-String). */
  myPermissions?: string;
}

export interface AttachmentDto {
  id?: string;
  messageId?: string;
  fileName: string;
  url: string;
  storageKey: string;
  contentType: string;
  /** Größe in Bytes. */
  size: number;
  width?: number | null;
  height?: number | null;
}

export interface MessageReactionDto {
  emoji: string;
  customEmojiId?: string | null;
  count: number;
  me: boolean;
}

export interface MessageDto {
  id: string;
  channelId: string;
  authorId: string;
  author: PublicUser;
  content: string;
  type: MessageType;
  replyToId?: string | null;
  replyTo?: MessageDto | null;
  forwardedFromId?: string | null;
  pinned: boolean;
  embeds?: unknown;
  mentionUserIds: string[];
  mentionRoleIds: string[];
  mentionEveryone: boolean;
  attachments: AttachmentDto[];
  reactions: MessageReactionDto[];
  editedAt?: DateLike | null;
  createdAt: DateLike;
}

export interface ServerDto {
  id: string;
  name: string;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  description?: string | null;
  ownerId: string;
  isPublic: boolean;
  category: string;
  memberCount?: number;
  verificationLevel: VerificationLevel;
  requireRulesAccept: boolean;
  rulesText?: string | null;
  /** Effektive Serverrechte des anfragenden Nutzers (BigInt als Dezimal-String). */
  myPermissions?: string;
  /** Persönlicher Favorit des anfragenden Nutzers (nur in Mitglieds-Kontexten gesetzt). */
  isFavorite?: boolean;
}

export interface InviteDto {
  id: string;
  code: string;
  serverId: string;
  channelId?: string | null;
  createdById: string;
  /** 0 = unbegrenzt. */
  maxUses: number;
  uses: number;
  expiresAt?: DateLike | null;
  createdAt: DateLike;
}

export interface FriendDto {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: DateLike;
  /** Die jeweils andere Person aus Sicht des anfragenden Nutzers. */
  user?: PublicUser;
}

/** Kategorien, aus denen ein Server beim Erstellen wählen kann. */
export const SERVER_CATEGORIES = [
  'Gaming',
  'Freunde',
  'Lerngruppe',
  'Community',
  'Kreativ',
  'Technik',
  'Musik',
  'Sonstiges',
] as const;

export type ServerCategory = (typeof SERVER_CATEGORIES)[number];

/** Mindestalter für ein Nexa-Konto in Jahren. */
export const MIN_AGE = 13;

/** Maximale Anzahl Mitglieder in einer Gruppen-DM (inkl. Ersteller). */
export const MAX_GROUP_DM_MEMBERS = 10;

/**
 * Prüft, ob eine Person zum Zeitpunkt `now` (Standard: heute) mindestens
 * {@link MIN_AGE} Jahre alt ist.
 */
export function validateAge(
  dob: Date | string,
  now: Date = new Date(),
): boolean {
  const birth = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(birth.getTime())) {
    return false;
  }
  const threshold = new Date(now);
  threshold.setFullYear(now.getFullYear() - MIN_AGE);
  return birth.getTime() <= threshold.getTime();
}
