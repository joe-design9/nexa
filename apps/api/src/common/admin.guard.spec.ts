import { AdminGuard } from './admin.guard';

/**
 * AdminGuard: Die Admin-Endpunkte (u. a. Plattform-Invite-Verwaltung)
 * dürfen ausschließlich mit der Plattform-Admin-Rolle durchkommen –
 * unabhängig davon, ob die UI den Bereich anzeigt.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function contextWith(user: any) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}

describe('AdminGuard', () => {
  it('lässt Plattform-Admins durch', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ isPlatformAdmin: true }) } };
    const guard = new AdminGuard(prisma as never);
    await expect(guard.canActivate(contextWith({ id: 'admin-1' }))).resolves.toBe(true);
  });

  it('lehnt normale Nutzer mit ADMIN_ONLY ab', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ isPlatformAdmin: false }) } };
    const guard = new AdminGuard(prisma as never);
    await expect(guard.canActivate(contextWith({ id: 'user-1' }))).rejects.toMatchObject({
      response: { code: 'ADMIN_ONLY' },
    });
  });

  it('lehnt Anfragen ohne Authentifizierung ab', async () => {
    const prisma = { user: { findUnique: jest.fn() } };
    const guard = new AdminGuard(prisma as never);
    await expect(guard.canActivate(contextWith(undefined))).rejects.toMatchObject({
      response: { code: 'ADMIN_ONLY' },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('lehnt gelöschte/unbekannte Konten ab', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const guard = new AdminGuard(prisma as never);
    await expect(guard.canActivate(contextWith({ id: 'ghost' }))).rejects.toMatchObject({
      response: { code: 'ADMIN_ONLY' },
    });
  });
});
