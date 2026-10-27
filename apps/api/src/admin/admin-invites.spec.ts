import { AdminService, platformInviteDto } from './admin.service';

/**
 * Plattform-Invite-Verwaltung: Prisma, Audit und Auth sind Mocks.
 * Geprüft werden Batch-Erzeugung (Format/Eindeutigkeit), DTO-Status,
 * Widerrufen und der Audit-Trail.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeAdminService(prisma: any) {
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const auth = { revokeAllSessions: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminService(prisma as never, audit as never, auth as never);
  return { service, audit };
}

const CODE_PATTERN = /^NEXA-[A-Z2-9]{6}-[A-Z2-9]{6}$/;

describe('AdminService.createPlatformInvites', () => {
  it('erzeugt einen Batch eindeutiger Codes im Nexa-Format', async () => {
    const prisma = {
      platformInviteCode: {
        create: jest.fn().mockImplementation(({ data, include }: any) =>
          Promise.resolve({
            id: `id-${data.code}`,
            createdAt: new Date(),
            revoked: false,
            expiresAt: null,
            usedCount: 0,
            createdBy: include ? { id: 'admin-1', username: 'nexaadmin' } : undefined,
            ...data,
          }),
        ),
      },
    };
    const { service, audit } = makeAdminService(prisma);
    const result = await service.createPlatformInvites('admin-1', { count: 5, maxUses: 1 });
    expect(result.codes).toHaveLength(5);
    const codes = result.codes.map((c: any) => c.code as string);
    for (const code of codes) expect(code).toMatch(CODE_PATTERN);
    expect(new Set(codes).size).toBe(5);
    expect(result.codes[0].status).toBe('ACTIVE');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PLATFORM_INVITE_CREATE' }));
  });

  it('übernimmt maxUses und Ablaufdatum', async () => {
    const prisma = {
      platformInviteCode: {
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'i1', createdAt: new Date(), revoked: false, usedCount: 0, createdBy: undefined, ...data }),
        ),
      },
    };
    const { service } = makeAdminService(prisma);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const result = await service.createPlatformInvites('admin-1', { count: 1, maxUses: 3, expiresAt });
    expect(result.codes[0].maxUses).toBe(3);
    expect(new Date(result.codes[0].expiresAt as string).getTime()).toBe(expiresAt.getTime());
  });

  it('begrenzt die Batch-Größe auf 100', async () => {
    const prisma = {
      platformInviteCode: {
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: `i-${data.code}`, createdAt: new Date(), revoked: false, usedCount: 0, ...data }),
        ),
      },
    };
    const { service } = makeAdminService(prisma);
    const result = await service.createPlatformInvites('admin-1', { count: 500 });
    expect(result.codes).toHaveLength(100);
  });
});

describe('AdminService.listPlatformInvites / revokePlatformInvite', () => {
  const rows = [
    {
      id: 'i1', code: 'NEXA-AAAAAA-BBBBBB', maxUses: 1, usedCount: 0, revoked: false,
      expiresAt: null, createdAt: new Date(), createdBy: { id: 'admin-1', username: 'nexaadmin' },
    },
    {
      id: 'i2', code: 'NEXA-CCCCCC-DDDDDD', maxUses: 1, usedCount: 1, revoked: false,
      expiresAt: null, createdAt: new Date(), createdBy: { id: 'admin-1', username: 'nexaadmin' },
    },
  ];

  it('listet Codes inkl. Nutzung und abgeleitetem Status', async () => {
    const prisma = { platformInviteCode: { findMany: jest.fn().mockResolvedValue(rows) } };
    const { service } = makeAdminService(prisma);
    const list = await service.listPlatformInvites();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ code: 'NEXA-AAAAAA-BBBBBB', usedCount: 0, maxUses: 1, status: 'ACTIVE' });
    expect(list[1]).toMatchObject({ code: 'NEXA-CCCCCC-DDDDDD', usedCount: 1, status: 'EXHAUSTED' });
    expect((list[0].createdBy as any).username).toBe('nexaadmin');
  });

  it('widerruft einen Code und schreibt einen Audit-Eintrag', async () => {
    const prisma = {
      platformInviteCode: {
        findUnique: jest.fn().mockResolvedValue(rows[0]),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...rows[0], ...data })),
      },
    };
    const { service, audit } = makeAdminService(prisma);
    const result = await service.revokePlatformInvite('admin-1', 'i1');
    expect(result.revoked).toBe(true);
    expect(result.status).toBe('REVOKED');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PLATFORM_INVITE_REVOKE', targetId: 'i1' }));
  });

  it('wirft INVITE_NOT_FOUND bei unbekannter ID', async () => {
    const prisma = { platformInviteCode: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } };
    const { service } = makeAdminService(prisma);
    await expect(service.revokePlatformInvite('admin-1', 'gibts-nicht')).rejects.toMatchObject({
      response: { code: 'INVITE_NOT_FOUND' },
    });
    expect(prisma.platformInviteCode.update).not.toHaveBeenCalled();
  });
});

describe('platformInviteDto – Statusableitung', () => {
  const base = { id: 'i', code: 'NEXA-XXXXXX-YYYYYY', usedCount: 0, maxUses: 1, revoked: false, expiresAt: null, createdAt: new Date(), createdBy: null };

  it('REVOKED schlägt alle anderen Zustände', () => {
    expect(platformInviteDto({ ...base, revoked: true, usedCount: 1 }).status).toBe('REVOKED');
  });

  it('EXPIRED bei abgelaufenem Datum', () => {
    expect(platformInviteDto({ ...base, expiresAt: new Date(Date.now() - 1000) }).status).toBe('EXPIRED');
  });

  it('ACTIVE bei nutzbarem Code', () => {
    expect(platformInviteDto({ ...base, expiresAt: new Date(Date.now() + 60_000) }).status).toBe('ACTIVE');
  });
});
