import type { PublicUser } from '@nexa/shared';

/** DTO-Mapper: Prisma-Objekte → API-Formate. BigInt-Berechtigungen werden
 *  immer als String serialisiert (JSON kann kein BigInt). */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Abzeichen-Schlüssel aus einer geladenen `badges`-Relation ziehen.
 * Akzeptiert Zeilen ({ badgeKey }) und reine Strings; ohne geladene
 * Relation (undefined) bleibt das Feld weg, damit Endpunkte, die die
 * Abzeichen nicht mitladen, keine falsche leere Liste behaupten.
 */
export function badgeKeysOf(u: any): string[] | undefined {
  if (!Array.isArray(u?.badges)) return undefined;
  return u.badges
    .map((b: any) => (typeof b === 'string' ? b : b?.badgeKey))
    .filter((k: unknown): k is string => typeof k === 'string' && k.length > 0);
}

export function publicUser(u: any): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl ?? null,
    status: (u.status ?? 'OFFLINE') as PublicUser['status'],
    verified: Boolean(u.verified),
    isBot: Boolean(u.isBot),
    badges: badgeKeysOf(u),
    createdAt: u.createdAt ?? new Date(0),
  };
}

export function profileUser(u: any): Record<string, unknown> {
  return {
    ...publicUser(u),
    bannerUrl: u.bannerUrl ?? null,
    about: u.about ?? null,
    pronouns: u.pronouns ?? null,
    status: u.status,
    customStatusText: u.customStatusText ?? null,
    customStatusEmoji: u.customStatusEmoji ?? null,
    createdAt: u.createdAt,
  };
}

export function selfUser(u: any): Record<string, unknown> {
  return {
    ...profileUser(u),
    email: u.email,
    emailVerifiedAt: u.emailVerifiedAt ?? null,
    phone: u.phone ?? null,
    phoneVerifiedAt: u.phoneVerifiedAt ?? null,
    totpEnabled: Boolean(u.totpEnabled),
    isPlatformAdmin: Boolean(u.isPlatformAdmin),
    dmPrivacy: u.dmPrivacy,
    friendRequestPrivacy: u.friendRequestPrivacy,
    locale: u.locale,
    tutorialSeenAt: u.tutorialSeenAt ?? null,
    theme: u.theme,
    dateOfBirth: u.dateOfBirth,
  };
}

export function roleDto(r: any): Record<string, unknown> {
  return {
    id: r.id,
    serverId: r.serverId,
    name: r.name,
    color: r.color,
    icon: r.icon ?? null,
    position: r.position,
    permissions: (r.permissions as bigint).toString(),
    isDefault: Boolean(r.isDefault),
    mentionable: Boolean(r.mentionable),
    hoist: Boolean(r.hoist),
  };
}

export function memberDto(m: any, presence?: { status: string; customStatusText: string | null }): Record<string, unknown> {
  return {
    id: m.id,
    serverId: m.serverId,
    userId: m.userId,
    user: m.user ? publicUser(m.user) : undefined,
    nickname: m.nickname ?? null,
    roleIds: (m.roles ?? []).map((mr: any) => mr.roleId),
    roles: (m.roles ?? []).map((mr: any) => (mr.role ? roleDto(mr.role) : { id: mr.roleId })),
    timeoutUntil: m.timeoutUntil ?? null,
    rulesAcceptedAt: m.rulesAcceptedAt ?? null,
    isVerifiedByButton: Boolean(m.isVerifiedByButton),
    joinedAt: m.joinedAt,
    presence: presence ?? { status: 'OFFLINE', customStatusText: null },
  };
}

export function serverDto(s: any, opts?: { myPermissions?: bigint; memberCount?: number; isFavorite?: boolean }): Record<string, unknown> {
  return {
    id: s.id,
    name: s.name,
    iconUrl: s.iconUrl ?? null,
    bannerUrl: s.bannerUrl ?? null,
    description: s.description ?? null,
    ownerId: s.ownerId,
    isPublic: Boolean(s.isPublic),
    category: s.category,
    verificationLevel: s.verificationLevel,
    accountAgeMinutes: s.accountAgeMinutes,
    memberAgeMinutes: s.memberAgeMinutes,
    rulesText: s.rulesText ?? null,
    requireRulesAccept: Boolean(s.requireRulesAccept),
    verificationRoleId: s.verificationRoleId ?? null,
    welcomeMessage: s.welcomeMessage ?? null,
    welcomeChannelId: s.welcomeChannelId ?? null,
    systemChannelId: s.systemChannelId ?? null,
    automodEnabled: Boolean(s.automodEnabled),
    bannedWords: s.bannedWords ?? [],
    automodBlockLinks: Boolean(s.automodBlockLinks),
    automodMaxMentions: s.automodMaxMentions,
    automodSpamLimit: s.automodSpamLimit,
    memberCount: opts?.memberCount ?? s._count?.members ?? undefined,
    myPermissions: opts?.myPermissions !== undefined ? opts.myPermissions.toString() : undefined,
    isFavorite: opts?.isFavorite !== undefined ? Boolean(opts.isFavorite) : undefined,
    createdAt: s.createdAt,
  };
}

export function channelDto(c: any, opts?: { myPermissions?: bigint }): Record<string, unknown> {
  return {
    id: c.id,
    serverId: c.serverId ?? null,
    categoryId: c.categoryId ?? null,
    name: c.name,
    type: c.type,
    topic: c.topic ?? null,
    position: c.position,
    slowmodeSeconds: c.slowmodeSeconds,
    nsfw: Boolean(c.nsfw),
    isPrivate: Boolean(c.isPrivate),
    parentChannelId: c.parentChannelId ?? null,
    starterMessageId: c.starterMessageId ?? null,
    archived: Boolean(c.archived),
    createdAt: c.createdAt,
    myPermissions: opts?.myPermissions !== undefined ? opts.myPermissions.toString() : undefined,
  };
}

export interface ReactionAgg {
  emoji: string;
  customEmojiId: string | null;
  count: number;
  me: boolean;
}

export function aggregateReactions(reactions: any[], currentUserId: string): ReactionAgg[] {
  const map = new Map<string, ReactionAgg>();
  for (const r of reactions ?? []) {
    const key = r.emoji;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (r.userId === currentUserId) existing.me = true;
    } else {
      map.set(key, {
        emoji: r.emoji,
        customEmojiId: r.customEmojiId ?? null,
        count: 1,
        me: r.userId === currentUserId,
      });
    }
  }
  return [...map.values()];
}

export function messageDto(m: any, currentUserId: string): Record<string, unknown> {
  return {
    id: m.id,
    channelId: m.channelId,
    authorId: m.authorId,
    author: m.author ? publicUser(m.author) : undefined,
    content: m.deletedAt ? '' : m.content,
    type: m.type,
    replyToId: m.replyToId ?? null,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          content: m.replyTo.deletedAt ? '' : m.replyTo.content,
          author: m.replyTo.author ? publicUser(m.replyTo.author) : undefined,
        }
      : null,
    forwardedFromId: m.forwardedFromId ?? null,
    pinned: Boolean(m.pinned),
    embeds: m.embeds ?? null,
    mentionUserIds: m.mentionUserIds ?? [],
    mentionRoleIds: m.mentionRoleIds ?? [],
    mentionEveryone: Boolean(m.mentionEveryone),
    attachments: (m.attachments ?? []).map((a: any) => ({
      id: a.id,
      fileName: a.fileName,
      url: a.url,
      storageKey: a.storageKey,
      contentType: a.contentType,
      size: a.size,
      width: a.width ?? null,
      height: a.height ?? null,
    })),
    reactions: aggregateReactions(m.reactions ?? [], currentUserId),
    editedAt: m.editedAt ?? null,
    deletedAt: m.deletedAt ?? null,
    createdAt: m.createdAt,
  };
}

export function notificationDto(n: any): Record<string, unknown> {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    title: n.title,
    body: n.body,
    data: n.data ?? null,
    readAt: n.readAt ?? null,
    createdAt: n.createdAt,
  };
}
