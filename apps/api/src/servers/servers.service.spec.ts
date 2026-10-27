import { ServersService, favoritesFirst } from './servers.service';
import { PermissionsService } from '../common/permissions.service';

/**
 * Server-Favoriten: Prisma ist ein Mock, der PermissionsService läuft echt
 * darüber (wie in permissions.spec.ts). Geprüft werden Toggle/Setzen,
 * Nicht-Mitglied-Fehler und die Favoriten-zuerst-Sortierung von myServers.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeService(prisma: any) {
  const perms = new PermissionsService(prisma as never);
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const service = new ServersService(prisma as never, perms as never, audit as never, events as never);
  return { service, audit };
}

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err: any) {
    const response = typeof err?.getResponse === 'function' ? err.getResponse() : err?.response;
    return response?.code;
  }
}

describe('favoritesFirst (stabile Partition)', () => {
  it('hebt Favoriten nach vorne und bewahrt die Reihenfolge in beiden Gruppen', () => {
    const items = [
      { id: 'a', isFavorite: false },
      { id: 'b', isFavorite: true },
      { id: 'c', isFavorite: false },
      { id: 'd', isFavorite: true },
      { id: 'e', isFavorite: false },
    ];
    expect(favoritesFirst(items).map((i) => i.id)).toEqual(['b', 'd', 'a', 'c', 'e']);
  });

  it('lässt Listen ohne Favoriten unverändert', () => {
    const items = [{ id: 'a', isFavorite: false }, { id: 'b' }, { id: 'c', isFavorite: null }];
    expect(favoritesFirst(items).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('behandelt null/undefined wie „kein Favorit“ und mutiert die Eingabe nicht', () => {
    const items = [{ id: 'a', isFavorite: null }, { id: 'b', isFavorite: true }];
    const result = favoritesFirst(items);
    expect(result.map((i) => i.id)).toEqual(['b', 'a']);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('ServersService.setFavorite', () => {
  const server = { id: 's1', name: 'Gaming Hub', ownerId: 'owner-1' };

  function prismaWithMember(member: any) {
    return {
      server: { findUnique: jest.fn().mockResolvedValue(server) },
      member: {
        findUnique: jest.fn().mockResolvedValue(member),
        update: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ ...member, ...data }),
        ),
      },
    };
  }

  it('setzt den Favoriten inkl. Zeitstempel für ein Mitglied', async () => {
    const member = { id: 'm1', serverId: 's1', userId: 'u1', isFavorite: false, favoritedAt: null, roles: [] };
    const prisma = prismaWithMember(member);
    const { service } = makeService(prisma);
    const before = Date.now();
    const result = await service.setFavorite('s1', 'u1', true);
    expect(result.serverId).toBe('s1');
    expect(result.isFavorite).toBe(true);
    expect(result.favoritedAt).toBeInstanceOf(Date);
    expect((result.favoritedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { isFavorite: true, favoritedAt: expect.any(Date) },
    });
  });

  it('entfernt den Favoriten und löscht den Zeitstempel', async () => {
    const member = { id: 'm1', serverId: 's1', userId: 'u1', isFavorite: true, favoritedAt: new Date(), roles: [] };
    const prisma = prismaWithMember(member);
    const { service } = makeService(prisma);
    const result = await service.setFavorite('s1', 'u1', false);
    expect(result.isFavorite).toBe(false);
    expect(result.favoritedAt).toBeNull();
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { isFavorite: false, favoritedAt: null },
    });
  });

  it('ist idempotent: erneutes Setzen liefert denselben Endzustand', async () => {
    const member = { id: 'm1', serverId: 's1', userId: 'u1', isFavorite: true, favoritedAt: new Date(), roles: [] };
    const prisma = prismaWithMember(member);
    const { service } = makeService(prisma);
    const result = await service.setFavorite('s1', 'u1', true);
    expect(result.isFavorite).toBe(true);
    expect(prisma.member.update).toHaveBeenCalledTimes(1);
  });

  it('lehnt Nicht-Mitglieder mit NOT_SERVER_MEMBER ab und schreibt nichts', async () => {
    const prisma = prismaWithMember(null);
    const { service } = makeService(prisma);
    await expect(errorCode(service.setFavorite('s1', 'u9', true))).resolves.toBe('NOT_SERVER_MEMBER');
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  it('meldet unbekannte Server mit SERVER_NOT_FOUND', async () => {
    const prisma = {
      server: { findUnique: jest.fn().mockResolvedValue(null) },
      member: { findUnique: jest.fn(), update: jest.fn() },
    };
    const { service } = makeService(prisma);
    await expect(errorCode(service.setFavorite('nope', 'u1', true))).resolves.toBe('SERVER_NOT_FOUND');
    expect(prisma.member.update).not.toHaveBeenCalled();
  });
});

describe('ServersService.myServers (Favoriten-Sortierung)', () => {
  function membership(id: string, serverId: string, name: string, isFavorite: boolean, joinedAt: string) {
    return {
      id,
      serverId,
      userId: 'u1',
      isFavorite,
      favoritedAt: isFavorite ? new Date(joinedAt) : null,
      joinedAt: new Date(joinedAt),
      roles: [],
      server: { id: serverId, name, ownerId: 'owner-1', _count: { members: 7 } },
    };
  }

  function prismaWithMemberships(rows: any[]) {
    return { member: { findMany: jest.fn().mockResolvedValue(rows) } };
  }

  it('sortiert Favoriten an den Anfang, Rest bleibt in Beitritts-Reihenfolge', async () => {
    const rows = [
      membership('m1', 's1', 'Alpha', false, '2026-01-01T00:00:00Z'),
      membership('m2', 's2', 'Beta', true, '2026-01-02T00:00:00Z'),
      membership('m3', 's3', 'Gamma', false, '2026-01-03T00:00:00Z'),
      membership('m4', 's4', 'Delta', true, '2026-01-04T00:00:00Z'),
    ];
    const { service } = makeService(prismaWithMemberships(rows));
    const result = await service.myServers('u1');
    expect(result.map((s: any) => s.id)).toEqual(['s2', 's4', 's1', 's3']);
    expect(result.map((s: any) => s.isFavorite)).toEqual([true, true, false, false]);
  });

  it('ohne Favoriten bleibt die Reihenfolge unverändert und isFavorite ist false', async () => {
    const rows = [
      membership('m1', 's1', 'Alpha', false, '2026-01-01T00:00:00Z'),
      membership('m2', 's2', 'Beta', false, '2026-01-02T00:00:00Z'),
    ];
    const { service } = makeService(prismaWithMemberships(rows));
    const result = await service.myServers('u1');
    expect(result.map((s: any) => s.id)).toEqual(['s1', 's2']);
    expect(result.every((s: any) => s.isFavorite === false)).toBe(true);
  });
});
