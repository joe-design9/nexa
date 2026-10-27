import { AuthService, sha256 } from './auth.service';
import * as bcrypt from 'bcryptjs';

/**
 * Auth-Service-Tests ohne Live-DB/Redis: Prisma, Mail und Captcha sind Mocks.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeAuthService(prisma: any) {
  const mail = { sendVerifyEmail: jest.fn().mockResolvedValue(undefined), sendResetEmail: jest.fn().mockResolvedValue(undefined) };
  const captcha = { verify: jest.fn().mockResolvedValue(undefined), enforced: false };
  const service = new AuthService(prisma as never, mail as never, captcha as never);
  return { service, mail, captcha };
}

function baseUser(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'user-1',
    email: 'joel@example.com',
    username: 'joel',
    displayName: 'Joel',
    passwordHash: bcrypt.hashSync('Str0ng!Passwort1', 4),
    dateOfBirth: new Date('2000-01-01'),
    emailVerifiedAt: null,
    totpSecret: null,
    totpEnabled: false,
    backupCodes: [],
    isPlatformBanned: false,
    failedLoginCount: 0,
    lockedUntil: null,
    status: 'ONLINE',
    ...overrides,
  };
}

describe('AuthService.register', () => {
  it('lehnt ein schwaches Passwort ab', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } };
    const { service } = makeAuthService(prisma);
    await expect(
      service.register({ email: 'a@b.de', username: 'neu', password: 'abc', dateOfBirth: '2000-01-01' }),
    ).rejects.toMatchObject({ response: { code: 'WEAK_PASSWORD' } });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('lehnt Minderjährige ab (unter 13)', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } };
    const { service } = makeAuthService(prisma);
    await expect(
      service.register({ email: 'a@b.de', username: 'kind', password: 'Str0ng!Passwort1', dateOfBirth: '2020-06-01' }),
    ).rejects.toMatchObject({ response: { code: 'UNDERAGE' } });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('lehnt eine bereits vergebene E-Mail mit 409 ab', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(baseUser()), create: jest.fn() },
      verificationToken: { create: jest.fn() },
    };
    const { service } = makeAuthService(prisma);
    await expect(
      service.register({ email: 'joel@example.com', username: 'anderer', password: 'Str0ng!Passwort1', dateOfBirth: '2000-01-01' }),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_TAKEN' }, status: 409 });
  });
});

describe('AuthService.login', () => {
  it('sperrt das Konto nach 5 Fehlversuchen für 15 Minuten', async () => {
    const user = baseUser({ failedLoginCount: 4 });
    const updates: any[] = [];
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockImplementation(({ data }: any) => {
          updates.push(data);
          return Promise.resolve({ ...user, ...data });
        }),
      },
    };
    const { service } = makeAuthService(prisma);
    await expect(service.login({ email: 'joel@example.com', password: 'falsch' }, {})).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
    const lockUpdate = updates.find((u) => u.failedLoginCount === 5);
    expect(lockUpdate).toBeDefined();
    expect(lockUpdate.lockedUntil).toBeInstanceOf(Date);
    expect(lockUpdate.lockedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('lehnt Anmeldungen ab, solange die Sperre läuft', async () => {
    const user = baseUser({ failedLoginCount: 5, lockedUntil: new Date(Date.now() + 10 * 60000) });
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(user), update: jest.fn() } };
    const { service } = makeAuthService(prisma);
    await expect(service.login({ email: 'joel@example.com', password: 'Str0ng!Passwort1' }, {})).rejects.toMatchObject({
      response: { code: 'ACCOUNT_LOCKED' },
    });
  });

  it('erlaubt Login auch ohne bestätigte E-Mail', async () => {
    const user = baseUser({ emailVerifiedAt: null });
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue(user),
      },
      session: { create: jest.fn().mockResolvedValue({ id: 'session-1' }) },
    };
    const { service } = makeAuthService(prisma);
    const result = await service.login({ email: 'joel@example.com', password: 'Str0ng!Passwort1' }, {});
    expect(result.accessToken).toBeTruthy();
    expect(result.user.emailVerifiedAt).toBeNull();
  });
});

describe('AuthService.refresh', () => {
  it('rotiert die Session und widerruft die alte', async () => {
    const raw = 'a'.repeat(96);
    const session = {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: sha256(raw),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
      deviceName: 'Testgerät',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    };
    const update = jest.fn().mockResolvedValue(session);
    const create = jest.fn().mockResolvedValue({ id: 'session-2' });
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session), update, create },
      user: { findUnique: jest.fn().mockResolvedValue(baseUser()) },
    };
    const { service } = makeAuthService(prisma);
    const result = await service.refresh(`session-1.${raw}`, {});
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date) }) }));
    expect(create).toHaveBeenCalled();
    expect(result.refreshCookieValue.startsWith('session-2.')).toBe(true);
    expect(result.accessToken).toBeTruthy();
  });

  it('lehnt ein falsches Refresh-Token ab', async () => {
    const session = {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: sha256('richtig'),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
    };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session), update: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue(baseUser()) },
    };
    const { service } = makeAuthService(prisma);
    await expect(service.refresh('session-1.falsch', {})).rejects.toMatchObject({
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
  });
});

/* ─── Plattform-Invite-Gate ─────────────────────────────────────────── */

function inviteRow(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'invite-1',
    code: 'NEXA-K7Q2XD-M9T4PA',
    maxUses: 1,
    usedCount: 0,
    revoked: false,
    expiresAt: null,
    createdAt: new Date(),
    createdById: 'admin-1',
    ...overrides,
  };
}

/** Prisma-Mock mit Transaktions-Support für den Registrierungs-Pfad. */
function registerPrisma(invite: any) {
  const tx = {
    platformInviteCode: {
      findUnique: jest.fn().mockResolvedValue(invite),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'user-new', status: 'ONLINE', ...data })),
    },
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    verificationToken: { create: jest.fn().mockResolvedValue({}) },
    platformInviteCode: tx.platformInviteCode,
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  return { prisma, tx };
}

const REGISTER_DTO = {
  email: 'neu@example.com',
  username: 'neu',
  password: 'Str0ng!Passwort1',
  dateOfBirth: '2000-01-01',
};

describe('AuthService.register – Plattform-Invite-Gate', () => {
  it('lehnt eine Registrierung ohne Invite-Code ab (INVITE_REQUIRED)', async () => {
    const { prisma, tx } = registerPrisma(inviteRow());
    const { service } = makeAuthService(prisma);
    await expect(service.register({ ...REGISTER_DTO })).rejects.toMatchObject({
      response: { code: 'INVITE_REQUIRED' },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('lehnt einen unbekannten Code ab (INVITE_INVALID)', async () => {
    const { prisma, tx } = registerPrisma(null);
    const { service } = makeAuthService(prisma);
    await expect(service.register({ ...REGISTER_DTO, platformInviteCode: 'NEXA-XXXXXX-YYYYYY' })).rejects.toMatchObject({
      response: { code: 'INVITE_INVALID' },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.platformInviteCode.updateMany).not.toHaveBeenCalled();
  });

  it('lehnt einen widerrufenen Code ab (INVITE_INVALID)', async () => {
    const { prisma, tx } = registerPrisma(inviteRow({ revoked: true }));
    const { service } = makeAuthService(prisma);
    await expect(service.register({ ...REGISTER_DTO, platformInviteCode: 'NEXA-K7Q2XD-M9T4PA' })).rejects.toMatchObject({
      response: { code: 'INVITE_INVALID' },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('lehnt einen aufgebrauchten Code ab (INVITE_INVALID)', async () => {
    const { prisma, tx } = registerPrisma(inviteRow({ usedCount: 1, maxUses: 1 }));
    const { service } = makeAuthService(prisma);
    await expect(service.register({ ...REGISTER_DTO, platformInviteCode: 'NEXA-K7Q2XD-M9T4PA' })).rejects.toMatchObject({
      response: { code: 'INVITE_INVALID' },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('lehnt einen abgelaufenen Code ab (INVITE_INVALID)', async () => {
    const { prisma, tx } = registerPrisma(inviteRow({ expiresAt: new Date(Date.now() - 60_000) }));
    const { service } = makeAuthService(prisma);
    await expect(service.register({ ...REGISTER_DTO, platformInviteCode: 'NEXA-K7Q2XD-M9T4PA' })).rejects.toMatchObject({
      response: { code: 'INVITE_INVALID' },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('registriert mit gültigem Code und verbraucht genau eine Nutzung', async () => {
    const { prisma, tx } = registerPrisma(inviteRow({ usedCount: 0, maxUses: 2 }));
    const { service } = makeAuthService(prisma);
    // Kleinschreibung wird tolerant normalisiert.
    const result = await service.register({ ...REGISTER_DTO, platformInviteCode: 'nexa-k7q2xd-m9t4pa' });
    expect(result.user.username).toBe('neu');
    expect(tx.platformInviteCode.findUnique).toHaveBeenCalledWith({ where: { code: 'NEXA-K7Q2XD-M9T4PA' } });
    expect(tx.platformInviteCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { usedCount: { increment: 1 } } }),
    );
    expect(tx.user.create).toHaveBeenCalledTimes(1);
  });

  it('bricht ab, wenn der Code parallel verbraucht wurde (bedingtes Update ohne Treffer)', async () => {
    const { prisma, tx } = registerPrisma(inviteRow());
    tx.platformInviteCode.updateMany.mockResolvedValue({ count: 0 });
    const { service } = makeAuthService(prisma);
    await expect(service.register({ ...REGISTER_DTO, platformInviteCode: 'NEXA-K7Q2XD-M9T4PA' })).rejects.toMatchObject({
      response: { code: 'INVITE_INVALID' },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});

describe('AuthService OAuth – Plattform-Invite-Gate', () => {
  function oauthPrisma(invite: any, identity: any = null) {
    const tx = {
      platformInviteCode: {
        findUnique: jest.fn().mockResolvedValue(invite),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'oauth-user', status: 'ONLINE', ...data })),
      },
      oAuthIdentity: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      oAuthIdentity: { findUnique: jest.fn().mockResolvedValue(identity) },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
    };
    return { prisma, tx };
  }

  const OAUTH_INPUT = {
    provider: 'GOOGLE' as const,
    providerUserId: 'google-123',
    email: 'neu@gmail.com',
    displayName: 'Neu Nutzer',
  };

  it('lehnt eine OAuth-Neuanlage ohne Invite-Code ab (INVITE_REQUIRED)', async () => {
    const { prisma, tx } = oauthPrisma(inviteRow());
    const { service } = makeAuthService(prisma);
    await expect(service.resolveOAuthAccount({ ...OAUTH_INPUT })).rejects.toMatchObject({
      response: { code: 'INVITE_REQUIRED' },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('erstellt ein OAuth-Konto mit gültigem Code und verbraucht ihn', async () => {
    const { prisma, tx } = oauthPrisma(inviteRow());
    const { service } = makeAuthService(prisma);
    const user = await service.resolveOAuthAccount({ ...OAUTH_INPUT, platformInviteCode: 'NEXA-K7Q2XD-M9T4PA' });
    expect(user.username).toBe('neu');
    expect(tx.platformInviteCode.updateMany).toHaveBeenCalled();
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.oAuthIdentity.create).toHaveBeenCalledTimes(1);
  });

  it('lässt ein bestehendes OAuth-Konto ohne Code durch (kein Gate beim Login)', async () => {
    const existing = baseUser();
    const { prisma } = oauthPrisma(null, { user: existing });
    const { service } = makeAuthService(prisma);
    const user = await service.resolveOAuthAccount({ ...OAUTH_INPUT });
    expect(user.id).toBe(existing.id);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('AuthService 2FA-Backup-Codes', () => {
  it('verbraucht einen Backup-Code genau einmal', async () => {
    const user = baseUser({
      totpEnabled: true,
      totpSecret: 'JBSWY3DPEHPK3PXP',
      backupCodes: [bcrypt.hashSync('backup-code-1', 4)],
    });
    const prisma = {
      user: {
        update: jest.fn().mockImplementation(({ data }: any) => {
          Object.assign(user, data);
          return Promise.resolve(user);
        }),
      },
    };
    const { service } = makeAuthService(prisma);
    await expect(service.verifyTotpOrBackup(user, 'backup-code-1')).resolves.toBe(true);
    expect(user.backupCodes).toHaveLength(0);
    // Zweite Verwendung desselben Codes muss scheitern.
    await expect(service.verifyTotpOrBackup(user, 'backup-code-1')).resolves.toBe(false);
  });
});
