import {
  ALL_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_NAMES,
  computeChannelPermissions,
  computeServerPermissions,
  hasPermission,
  namesToPermission,
  permissionToNames,
} from './permissions';

const P = PERMISSIONS;

describe('PERMISSIONS bit layout', () => {
  it('vergibt sequenzielle Bits ab 1n << 0n in der Vertragsreihenfolge', () => {
    expect(P.VIEW_CHANNELS).toBe(1n << 0n);
    expect(P.SEND_MESSAGES).toBe(1n << 4n);
    expect(P.READ_MESSAGE_HISTORY).toBe(1n << 11n);
    expect(P.CONNECT).toBe(1n << 12n);
    expect(P.ADMINISTRATOR).toBe(1n << 29n);
    expect(Object.keys(PERMISSIONS)).toHaveLength(30);
    expect(Object.keys(PERMISSIONS)[0]).toBe('VIEW_CHANNELS');
    expect(Object.keys(PERMISSIONS)[29]).toBe('ADMINISTRATOR');
  });

  it('PERMISSION_NAMES ist indexgleich zu den Bits', () => {
    expect(PERMISSION_NAMES).toHaveLength(30);
    PERMISSION_NAMES.forEach((name, idx) => {
      expect(PERMISSIONS[name]).toBe(1n << BigInt(idx));
    });
  });

  it('ALL_PERMISSIONS enthält jedes Bit genau einmal', () => {
    expect(ALL_PERMISSIONS).toBe((1n << 30n) - 1n);
    expect(permissionToNames(ALL_PERMISSIONS)).toEqual(PERMISSION_NAMES);
  });

  it('DEFAULT_EVERYONE_PERMISSIONS enthält genau die Basisrechte', () => {
    const expected = namesToPermission([
      'VIEW_CHANNELS',
      'CREATE_INVITES',
      'CHANGE_NICKNAME',
      'SEND_MESSAGES',
      'EMBED_LINKS',
      'ATTACH_FILES',
      'ADD_REACTIONS',
      'USE_EXTERNAL_EMOJIS',
      'READ_MESSAGE_HISTORY',
      'CONNECT',
      'SPEAK',
      'VIDEO',
      'STREAM',
      'USE_VOICE_ACTIVITY',
    ]);
    expect(DEFAULT_EVERYONE_PERMISSIONS).toBe(expected);
    expect(hasPermission(DEFAULT_EVERYONE_PERMISSIONS, P.BAN_MEMBERS)).toBe(
      false,
    );
  });
});

describe('hasPermission / name conversion', () => {
  it('prüft Einzelrechte', () => {
    expect(hasPermission(P.SEND_MESSAGES, P.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(P.SEND_MESSAGES, P.BAN_MEMBERS)).toBe(false);
    expect(hasPermission(0n, P.VIEW_CHANNELS)).toBe(false);
  });

  it('ADMINISTRATOR impliziert alles', () => {
    expect(hasPermission(P.ADMINISTRATOR, P.BAN_MEMBERS)).toBe(true);
    expect(hasPermission(P.ADMINISTRATOR, P.MANAGE_SERVER)).toBe(true);
  });

  it('permissionToNames und namesToPermission sind zueinander invers', () => {
    const granted = P.VIEW_CHANNELS | P.KICK_MEMBERS | P.SPEAK;
    const names = permissionToNames(granted);
    expect(names).toEqual(['VIEW_CHANNELS', 'SPEAK', 'KICK_MEMBERS']);
    expect(namesToPermission(names)).toBe(granted);
    expect(namesToPermission([])).toBe(0n);
  });
});

describe('computeServerPermissions', () => {
  it('Eigentümer erhält alle Rechte', () => {
    expect(computeServerPermissions({ isOwner: true, rolePermissions: [] })).toBe(
      ALL_PERMISSIONS,
    );
  });

  it('kombiniert Rollen per OR', () => {
    const result = computeServerPermissions({
      isOwner: false,
      rolePermissions: [P.VIEW_CHANNELS | P.SEND_MESSAGES, P.BAN_MEMBERS],
    });
    expect(result).toBe(P.VIEW_CHANNELS | P.SEND_MESSAGES | P.BAN_MEMBERS);
  });

  it('ADMINISTRATOR in einer Rolle hebt auf alle Rechte', () => {
    expect(
      computeServerPermissions({
        isOwner: false,
        rolePermissions: [P.ADMINISTRATOR],
      }),
    ).toBe(ALL_PERMISSIONS);
  });

  it('ohne Rollen keine Rechte', () => {
    expect(
      computeServerPermissions({ isOwner: false, rolePermissions: [] }),
    ).toBe(0n);
  });
});

describe('computeChannelPermissions override matrix', () => {
  const everyoneRoleId = 'role-everyone';
  const modRoleId = 'role-mod';
  const memberId = 'member-1';
  const base = DEFAULT_EVERYONE_PERMISSIONS;

  it('ohne Overrides bleibt die Basis erhalten', () => {
    const result = computeChannelPermissions({
      base,
      isOwner: false,
      everyoneRoleId,
      memberId,
      memberRoleIds: [everyoneRoleId],
      overrides: [],
    });
    expect(result).toBe(base);
  });

  it('Everyone-Deny auf VIEW_CHANNELS macht den Kanal unsichtbar (0n)', () => {
    const result = computeChannelPermissions({
      base,
      isOwner: false,
      everyoneRoleId,
      memberId,
      memberRoleIds: [everyoneRoleId],
      overrides: [
        {
          targetType: 'ROLE',
          roleId: everyoneRoleId,
          allow: 0n,
          deny: P.VIEW_CHANNELS,
        },
      ],
    });
    expect(result).toBe(0n);
  });

  it('Rollen-Allow stellt VIEW und SEND nach Everyone-Deny wieder her', () => {
    const result = computeChannelPermissions({
      base,
      isOwner: false,
      everyoneRoleId,
      memberId,
      memberRoleIds: [everyoneRoleId, modRoleId],
      overrides: [
        {
          targetType: 'ROLE',
          roleId: everyoneRoleId,
          allow: 0n,
          deny: P.VIEW_CHANNELS | P.SEND_MESSAGES,
        },
        {
          targetType: 'ROLE',
          roleId: modRoleId,
          allow: P.VIEW_CHANNELS | P.SEND_MESSAGES,
          deny: 0n,
        },
      ],
    });
    expect(hasPermission(result, P.VIEW_CHANNELS)).toBe(true);
    expect(hasPermission(result, P.SEND_MESSAGES)).toBe(true);
    // Übrige Basisrechte bleiben vom Everyone-Deny unberührt.
    expect(hasPermission(result, P.EMBED_LINKS)).toBe(true);
  });

  it('Mitglieds-Deny gewinnt gegen Rollen-Allow bei SEND_MESSAGES', () => {
    const result = computeChannelPermissions({
      base,
      isOwner: false,
      everyoneRoleId,
      memberId,
      memberRoleIds: [everyoneRoleId, modRoleId],
      overrides: [
        {
          targetType: 'ROLE',
          roleId: modRoleId,
          allow: P.SEND_MESSAGES,
          deny: 0n,
        },
        {
          targetType: 'MEMBER',
          memberId,
          allow: 0n,
          deny: P.SEND_MESSAGES,
        },
      ],
    });
    expect(hasPermission(result, P.SEND_MESSAGES)).toBe(false);
    expect(hasPermission(result, P.VIEW_CHANNELS)).toBe(true);
  });

  it('Mitglieds-Allow wird zuletzt angewendet und kann Everyone-Deny reparieren', () => {
    const result = computeChannelPermissions({
      base,
      isOwner: false,
      everyoneRoleId,
      memberId,
      memberRoleIds: [everyoneRoleId],
      overrides: [
        {
          targetType: 'ROLE',
          roleId: everyoneRoleId,
          allow: 0n,
          deny: P.VIEW_CHANNELS,
        },
        {
          targetType: 'MEMBER',
          memberId,
          allow: P.VIEW_CHANNELS,
          deny: 0n,
        },
      ],
    });
    expect(hasPermission(result, P.VIEW_CHANNELS)).toBe(true);
  });

  it('Admin umgeht Overrides vollständig', () => {
    const result = computeChannelPermissions({
      base: P.ADMINISTRATOR,
      isOwner: false,
      everyoneRoleId,
      memberId,
      memberRoleIds: [everyoneRoleId],
      overrides: [
        {
          targetType: 'ROLE',
          roleId: everyoneRoleId,
          allow: 0n,
          deny: ALL_PERMISSIONS,
        },
      ],
    });
    expect(result).toBe(ALL_PERMISSIONS);
  });

  it('Eigentümer umgeht Overrides vollständig', () => {
    const result = computeChannelPermissions({
      base: 0n,
      isOwner: true,
      everyoneRoleId,
      memberId,
      memberRoleIds: [],
      overrides: [],
    });
    expect(result).toBe(ALL_PERMISSIONS);
  });

  it('Overrides fremder Rollen/Mitglieder werden ignoriert', () => {
    const result = computeChannelPermissions({
      base,
      isOwner: false,
      everyoneRoleId,
      memberId,
      memberRoleIds: [everyoneRoleId],
      overrides: [
        {
          targetType: 'ROLE',
          roleId: 'role-other',
          allow: 0n,
          deny: P.VIEW_CHANNELS,
        },
        {
          targetType: 'MEMBER',
          memberId: 'member-2',
          allow: 0n,
          deny: P.VIEW_CHANNELS,
        },
      ],
    });
    expect(result).toBe(base);
  });
});
