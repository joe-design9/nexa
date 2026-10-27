/**
 * Berechtigungs-Bitfelder für Nexa.
 *
 * Die Reihenfolge der Einträge in `PERMISSION_DEFINITIONS` ist der Vertrag:
 * Bit i (0-basiert) entspricht `1n << BigInt(i)`. `PERMISSIONS` wird daraus
 * in exakt dieser Reihenfolge aufgebaut (Insertion-Order der Keys).
 */

export const PERMISSION_DEFINITIONS = [
  'VIEW_CHANNELS',
  'CREATE_INVITES',
  'CHANGE_NICKNAME',
  'MANAGE_NICKNAMES',
  'SEND_MESSAGES',
  'EMBED_LINKS',
  'ATTACH_FILES',
  'ADD_REACTIONS',
  'USE_EXTERNAL_EMOJIS',
  'MENTION_EVERYONE',
  'MANAGE_MESSAGES',
  'READ_MESSAGE_HISTORY',
  'CONNECT',
  'SPEAK',
  'VIDEO',
  'STREAM',
  'PRIORITY_SPEAKER',
  'USE_VOICE_ACTIVITY',
  'MUTE_MEMBERS',
  'DEAFEN_MEMBERS',
  'MOVE_MEMBERS',
  'KICK_MEMBERS',
  'BAN_MEMBERS',
  'TIMEOUT_MEMBERS',
  'MANAGE_CHANNELS',
  'MANAGE_ROLES',
  'MANAGE_EMOJIS',
  'MANAGE_WEBHOOKS',
  'MANAGE_SERVER',
  'ADMINISTRATOR',
] as const;

export type PermissionName = (typeof PERMISSION_DEFINITIONS)[number];

/** Rechte in der dokumentierten Reihenfolge, Bit 0..29. */
export const PERMISSIONS: Record<string, bigint> = (() => {
  const record: Record<string, bigint> = {};
  PERMISSION_DEFINITIONS.forEach((name, index) => {
    record[name] = 1n << BigInt(index);
  });
  return record;
})();

/** Namen der Rechte, indexgleich zu den Bits (Bit 0 zuerst). */
export const PERMISSION_NAMES: string[] = [...PERMISSION_DEFINITIONS];

/** Bitfeld mit allen Rechten gesetzt. */
export const ALL_PERMISSIONS: bigint = PERMISSION_NAMES.reduce(
  (acc, name) => acc | PERMISSIONS[name],
  0n,
);

/** Standardrechte der Rolle `@everyone`. */
export const DEFAULT_EVERYONE_PERMISSIONS: bigint =
  PERMISSIONS.VIEW_CHANNELS |
  PERMISSIONS.CREATE_INVITES |
  PERMISSIONS.CHANGE_NICKNAME |
  PERMISSIONS.SEND_MESSAGES |
  PERMISSIONS.EMBED_LINKS |
  PERMISSIONS.ATTACH_FILES |
  PERMISSIONS.ADD_REACTIONS |
  PERMISSIONS.USE_EXTERNAL_EMOJIS |
  PERMISSIONS.READ_MESSAGE_HISTORY |
  PERMISSIONS.CONNECT |
  PERMISSIONS.SPEAK |
  PERMISSIONS.VIDEO |
  PERMISSIONS.STREAM |
  PERMISSIONS.USE_VOICE_ACTIVITY;

/**
 * Prüft, ob `granted` das Einzelrecht `perm` enthält.
 * `ADMINISTRATOR` impliziert jedes andere Recht.
 */
export function hasPermission(granted: bigint, perm: bigint): boolean {
  if ((granted & PERMISSIONS.ADMINISTRATOR) !== 0n) {
    return true;
  }
  return (granted & perm) !== 0n;
}

/** Namen aller gesetzten Bits in Bitreihenfolge. */
export function permissionToNames(granted: bigint): string[] {
  return PERMISSION_NAMES.filter(
    (name) => (granted & PERMISSIONS[name]) !== 0n,
  );
}

/**
 * Baut ein Bitfeld aus Rechtnamen. Unbekannte Namen werden ignoriert
 * (statt zu werfen), damit Clients mit älteren/neueren Rechten nicht brechen.
 */
export function namesToPermission(names: string[]): bigint {
  return names.reduce((acc, name) => {
    const bit = PERMISSIONS[name];
    return bit !== undefined ? acc | bit : acc;
  }, 0n);
}

export interface ComputeServerPermissionsInput {
  isOwner: boolean;
  rolePermissions: bigint[];
}

/**
 * Effektive Serverrechte: Eigentümer erhält alles; sonst bitweises OR über
 * alle Rollen; enthält das Ergebnis `ADMINISTRATOR`, wird es auf alles gehoben.
 */
export function computeServerPermissions(
  input: ComputeServerPermissionsInput,
): bigint {
  if (input.isOwner) {
    return ALL_PERMISSIONS;
  }
  const combined = input.rolePermissions.reduce((acc, p) => acc | p, 0n);
  if ((combined & PERMISSIONS.ADMINISTRATOR) !== 0n) {
    return ALL_PERMISSIONS;
  }
  return combined;
}

export type PermissionOverrideTargetType = 'ROLE' | 'MEMBER';

export interface ChannelPermissionOverrideInput {
  targetType: PermissionOverrideTargetType;
  /** Set, wenn targetType === 'ROLE'. */
  roleId?: string | null;
  /** Set, wenn targetType === 'MEMBER'. */
  memberId?: string | null;
  allow: bigint;
  deny: bigint;
}

export interface ComputeChannelPermissionsInput {
  /** Ergebnis von {@link computeServerPermissions}. */
  base: bigint;
  isOwner: boolean;
  everyoneRoleId: string;
  memberId: string;
  memberRoleIds: string[];
  overrides: ChannelPermissionOverrideInput[];
}

function applyOverride(perms: bigint, allow: bigint, deny: bigint): bigint {
  return (perms & ~deny) | allow;
}

/**
 * Effektive Kanalrechte nach der festen Override-Reihenfolge:
 * 1. Override der Rolle `@everyone`,
 * 2. alle Rollen-Overrides des Mitglieds (Denies gesammelt, dann Allows),
 * 3. Mitglieds-Override (zuletzt, gewinnt damit gegen Rollen-Allows).
 * Ohne `VIEW_CHANNELS` am Ende ist das Ergebnis `0n` (Kanal unsichtbar).
 * Eigentümer und Administratoren umgehen Overrides vollständig.
 */
export function computeChannelPermissions(
  input: ComputeChannelPermissionsInput,
): bigint {
  if (
    input.isOwner ||
    (input.base & PERMISSIONS.ADMINISTRATOR) !== 0n
  ) {
    return ALL_PERMISSIONS;
  }

  let perms = input.base;

  const everyoneOverride = input.overrides.find(
    (o) => o.targetType === 'ROLE' && o.roleId === input.everyoneRoleId,
  );
  if (everyoneOverride) {
    perms = applyOverride(perms, everyoneOverride.allow, everyoneOverride.deny);
  }

  const memberRoleIds = new Set(input.memberRoleIds);
  let combinedDeny = 0n;
  let combinedAllow = 0n;
  for (const override of input.overrides) {
    if (
      override.targetType === 'ROLE' &&
      override.roleId !== null &&
      override.roleId !== undefined &&
      memberRoleIds.has(override.roleId)
    ) {
      combinedDeny |= override.deny;
      combinedAllow |= override.allow;
    }
  }
  if (combinedDeny !== 0n || combinedAllow !== 0n) {
    perms = applyOverride(perms, combinedAllow, combinedDeny);
  }

  const memberOverride = input.overrides.find(
    (o) => o.targetType === 'MEMBER' && o.memberId === input.memberId,
  );
  if (memberOverride) {
    perms = applyOverride(perms, memberOverride.allow, memberOverride.deny);
  }

  if ((perms & PERMISSIONS.VIEW_CHANNELS) === 0n) {
    return 0n;
  }
  return perms;
}
