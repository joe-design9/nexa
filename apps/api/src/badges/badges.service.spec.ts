import { BadgesService } from './badges.service';

/**
 * Abzeichen-Vergabe: Prisma und Audit sind Mocks. Geprüft werden
 * Vergabe (inkl. Audit-Trail), Idempotenz, Entzug, Fehlercodes für
 * unbekannte Abzeichen/Nutzer und der Katalog.
 * Der Rollenschutz der Endpunkte (AdminGuard) ist separat in
 * common/admin.guard.spec.ts abgedeckt – dieser Controller nutzt
 * denselben Guard wie die Invite-Verwaltung.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeService(prisma: any) {
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new BadgesService(prisma as never, audit as never);
  return { service, audit };
}

function basePrisma(overrides: any = {}) {
  return {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
    userBadge: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

describe('BadgesService.catalog', () => {
  it('liefert den kompletten Katalog mit Icon und Kategorie', () => {
    const { service } = makeService(basePrisma());
    const catalog = service.catalog();
    expect(catalog.length).toBe(27);
    expect(catalog).toContainEqual({ key: 'BETA', icon: '🧪', category: 'EXCLUSIVE' });
    expect(catalog).toContainEqual(expect.objectContaining({ key: 'OWNER', category: 'STATUS' }));
  });
});

describe('BadgesService.grant', () => {
  it('vergibt ein Abzeichen und schreibt einen Audit-Eintrag', async () => {
    const prisma = basePrisma();
    const { service, audit } = makeService(prisma);
    const result = await service.grant('admin-1', 'user-1', 'BETA');
    expect(prisma.userBadge.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', badgeKey: 'BETA', grantedById: 'admin-1' },
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-1', action: 'PLATFORM_BADGE_GRANT', targetType: 'USER', targetId: 'user-1',
      changes: { badgeKey: 'BETA' },
    }));
    expect(result.granted).toBe(true);
    expect(result.alreadyGranted).toBe(false);
  });

  it('ist idempotent: vorhandenes Abzeichen wird nicht doppelt vergeben', async () => {
    const prisma = basePrisma();
    prisma.userBadge.findUnique.mockResolvedValue({ id: 'ub-1', userId: 'user-1', badgeKey: 'BETA', grantedAt: new Date(), grantedBy: null });
    const { service, audit } = makeService(prisma);
    const result = await service.grant('admin-1', 'user-1', 'BETA');
    expect(prisma.userBadge.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(result.granted).toBe(false);
    expect(result.alreadyGranted).toBe(true);
  });

  it('lehnt unbekannte Abzeichen mit BADGE_UNKNOWN ab', async () => {
    const { service } = makeService(basePrisma());
    await expect(service.grant('admin-1', 'user-1', 'GIBTS_NICHT')).rejects.toMatchObject({
      response: { code: 'BADGE_UNKNOWN' },
    });
  });

  it('lehnt unbekannte Nutzer mit USER_NOT_FOUND ab', async () => {
    const prisma = basePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    const { service } = makeService(prisma);
    await expect(service.grant('admin-1', 'ghost', 'BETA')).rejects.toMatchObject({
      response: { code: 'USER_NOT_FOUND' },
    });
    expect(prisma.userBadge.create).not.toHaveBeenCalled();
  });
});

describe('BadgesService.revoke', () => {
  it('entzieht ein Abzeichen und schreibt einen Audit-Eintrag', async () => {
    const prisma = basePrisma();
    prisma.userBadge.findUnique.mockResolvedValue({ id: 'ub-9', userId: 'user-1', badgeKey: 'BETA' });
    const { service, audit } = makeService(prisma);
    const result = await service.revoke('admin-1', 'user-1', 'BETA');
    expect(prisma.userBadge.delete).toHaveBeenCalledWith({ where: { id: 'ub-9' } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PLATFORM_BADGE_REVOKE', targetId: 'user-1', changes: { badgeKey: 'BETA' },
    }));
    expect(result.revoked).toBe(true);
  });

  it('lehnt den Entzug eines nicht besessenen Abzeichens mit BADGE_NOT_HELD ab', async () => {
    const { service } = makeService(basePrisma());
    await expect(service.revoke('admin-1', 'user-1', 'BETA')).rejects.toMatchObject({
      response: { code: 'BADGE_NOT_HELD' },
    });
  });

  it('lehnt unbekannte Abzeichen mit BADGE_UNKNOWN ab', async () => {
    const { service } = makeService(basePrisma());
    await expect(service.revoke('admin-1', 'user-1', 'GIBTS_NICHT')).rejects.toMatchObject({
      response: { code: 'BADGE_UNKNOWN' },
    });
  });
});

describe('BadgesService.listForUser', () => {
  it('mappt Vergaben auf DTOs mit Katalog-Icon/Kategorie und Vergeber', async () => {
    const prisma = basePrisma();
    prisma.userBadge.findMany.mockResolvedValue([
      { badgeKey: 'OWNER', grantedAt: new Date('2026-10-27T00:00:00Z'), grantedBy: { id: 'admin-1', username: 'nexaadmin' } },
      { badgeKey: 'BETA', grantedAt: new Date('2026-10-27T01:00:00Z'), grantedBy: null },
    ]);
    const { service } = makeService(prisma);
    const list = await service.listForUser('user-1');
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ key: 'OWNER', category: 'STATUS', grantedBy: { username: 'nexaadmin' } });
    expect(list[1]).toMatchObject({ key: 'BETA', icon: '🧪', grantedBy: null });
  });
});
