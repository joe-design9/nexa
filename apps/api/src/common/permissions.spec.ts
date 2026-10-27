import { PermissionsService } from './permissions.service';
import { PERMISSIONS, hasPermission } from '@nexa/shared';

/**
 * Tests zur Kanal-Berechtigungsauflösung: Der Service lädt den Kontext,
 * die Bitfeld-Mathematik (computeServerPermissions/computeChannelPermissions)
 * kommt aus @nexa/shared und wird hier in realistischen Szenarien geprüft.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const svc = new PermissionsService({} as never);

function makeCtx(opts: {
  isOwner?: boolean;
  everyonePerms: bigint;
  memberRolePerms?: bigint;
  memberId?: string;
}): any {
  const everyone = { id: 'role-everyone', serverId: 'srv-1', name: '@everyone', position: 0, permissions: opts.everyonePerms, isDefault: true };
  const memberRole = { id: 'role-member', serverId: 'srv-1', name: 'Mitglied', position: 1, permissions: opts.memberRolePerms ?? 0n, isDefault: false };
  const roles: any[] = [{ role: everyone }];
  if (opts.memberRolePerms !== undefined) roles.push({ role: memberRole });
  const member = { id: opts.memberId ?? 'mem-1', userId: 'user-1', roles };
  const server = { id: 'srv-1', ownerId: opts.isOwner ? 'user-1' : 'owner-9' };
  return svc.memberContext(server, member);
}

function channelWith(overrides: any[]): any {
  return { id: 'chan-1', serverId: 'srv-1', type: 'TEXT', overrides };
}

const BASE_VIEW_SEND = PERMISSIONS.VIEW_CHANNELS | PERMISSIONS.SEND_MESSAGES;

describe('Kanal-Berechtigungsauflösung', () => {
  it('everyone-Override ohne VIEW_CHANNELS versteckt den Kanal komplett', () => {
    const ctx = makeCtx({ everyonePerms: BASE_VIEW_SEND });
    const channel = channelWith([
      { targetType: 'ROLE', roleId: 'role-everyone', memberId: null, allow: 0n, deny: PERMISSIONS.VIEW_CHANNELS },
    ]);
    const perms = svc.channelPermissions(channel, ctx);
    expect(perms).toBe(0n);
    expect(hasPermission(perms, PERMISSIONS.VIEW_CHANNELS)).toBe(false);
  });

  it('eine Rollen-Erlaubnis stellt VIEW_CHANNELS trotz everyone-Deny wieder her', () => {
    const ctx = makeCtx({ everyonePerms: BASE_VIEW_SEND, memberRolePerms: 0n });
    const channel = channelWith([
      { targetType: 'ROLE', roleId: 'role-everyone', memberId: null, allow: 0n, deny: PERMISSIONS.VIEW_CHANNELS },
      { targetType: 'ROLE', roleId: 'role-member', memberId: null, allow: PERMISSIONS.VIEW_CHANNELS, deny: 0n },
    ]);
    const perms = svc.channelPermissions(channel, ctx);
    expect(hasPermission(perms, PERMISSIONS.VIEW_CHANNELS)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.SEND_MESSAGES)).toBe(true);
  });

  it('ein Mitglieds-Override schlägt Rollen-Overrides', () => {
    const ctx = makeCtx({ everyonePerms: BASE_VIEW_SEND, memberRolePerms: 0n });
    const channel = channelWith([
      { targetType: 'ROLE', roleId: 'role-member', memberId: null, allow: 0n, deny: PERMISSIONS.SEND_MESSAGES },
      { targetType: 'MEMBER', roleId: null, memberId: 'mem-1', allow: PERMISSIONS.SEND_MESSAGES, deny: 0n },
    ]);
    const perms = svc.channelPermissions(channel, ctx);
    expect(hasPermission(perms, PERMISSIONS.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.VIEW_CHANNELS)).toBe(true);
  });

  it('ADMINISTRATOR umgeht alle Kanal-Overrides', () => {
    const ctx = makeCtx({ everyonePerms: PERMISSIONS.ADMINISTRATOR, memberRolePerms: 0n });
    const channel = channelWith([
      { targetType: 'ROLE', roleId: 'role-everyone', memberId: null, allow: 0n, deny: PERMISSIONS.VIEW_CHANNELS | PERMISSIONS.SEND_MESSAGES },
      { targetType: 'MEMBER', roleId: null, memberId: 'mem-1', allow: 0n, deny: PERMISSIONS.VIEW_CHANNELS },
    ]);
    const perms = svc.channelPermissions(channel, ctx);
    expect(hasPermission(perms, PERMISSIONS.VIEW_CHANNELS)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.MANAGE_CHANNELS)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.BAN_MEMBERS)).toBe(true);
  });

  it('der Server-Eigentümer hat immer alle Berechtigungen', () => {
    const ctx = makeCtx({ isOwner: true, everyonePerms: 0n });
    const channel = channelWith([
      { targetType: 'ROLE', roleId: 'role-everyone', memberId: null, allow: 0n, deny: PERMISSIONS.VIEW_CHANNELS },
    ]);
    const perms = svc.channelPermissions(channel, ctx);
    expect(hasPermission(perms, PERMISSIONS.VIEW_CHANNELS)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.ADMINISTRATOR)).toBe(true);
  });

  it('ein Mitglieds-Deny auf SEND_MESSAGES entfernt nur das Schreiben', () => {
    const ctx = makeCtx({ everyonePerms: BASE_VIEW_SEND });
    const channel = channelWith([
      { targetType: 'MEMBER', roleId: null, memberId: 'mem-1', allow: 0n, deny: PERMISSIONS.SEND_MESSAGES },
    ]);
    const perms = svc.channelPermissions(channel, ctx);
    expect(hasPermission(perms, PERMISSIONS.VIEW_CHANNELS)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.SEND_MESSAGES)).toBe(false);
  });
});
