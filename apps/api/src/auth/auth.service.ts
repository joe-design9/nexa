import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../common/mail.service';
import { CaptchaService } from '../common/captcha.service';
import { normalizePlatformInviteCode } from '../common/invite-code';
import { isPasswordAcceptable, passwordStrength, validateAge, MIN_AGE } from '@nexa/shared';
import { selfUser } from '../common/dto';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SessionMeta {
  ipAddress?: string;
  userAgent?: string;
  deviceName?: string;
}

export interface IssuedSession {
  accessToken: string;
  refreshCookieValue: string;
  refreshMaxAgeMs: number;
  user: Record<string, unknown>;
}

const BCRYPT_COST = 12;

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly captcha: CaptchaService,
  ) {}

  private accessSecret(): string {
    return process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me';
  }

  private refreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me';
  }

  accessTtlSeconds(): number {
    return Number(process.env.JWT_ACCESS_TTL || 900);
  }

  refreshTtlSeconds(): number {
    return Number(process.env.JWT_REFRESH_TTL || 2592000);
  }

  signAccessToken(user: { id: string; username: string; isBot: boolean }): string {
    return jwt.sign({ sub: user.id, username: user.username, isBot: user.isBot }, this.accessSecret(), {
      expiresIn: this.accessTtlSeconds(),
    });
  }

  // ─── Plattform-Invite-Gate ──────────────────────────────────────────────

  /**
   * Prüft einen Plattform-Invite-Code und verbraucht eine Nutzung ATOMAR
   * innerhalb der übergebenen Transaktion: Das Inkrement läuft als
   * bedingtes Update auf dem gelesenen usedCount-Stand (optimistische
   * Sperre) – zwei gleichzeitige Registrierungen mit demselben Einmal-Code
   * können so nicht beide durchkommen. Schlägt die Kontoanlage danach
   * fehl, rollt die Transaktion auch das Inkrement zurück.
   *
   * Fehlercodes: INVITE_REQUIRED (kein Code übermittelt),
   * INVITE_INVALID (unbekannt, widerrufen, abgelaufen oder aufgebraucht).
   */
  async consumePlatformInvite(tx: any, rawCode: unknown): Promise<void> {
    const code = normalizePlatformInviteCode(rawCode);
    if (!code) {
      throw new BadRequestException({
        code: 'INVITE_REQUIRED',
        message: 'Für die Registrierung ist ein Plattform-Invite-Code erforderlich. Bitte gib deinen Einladungscode ein.',
      });
    }
    const invite = await tx.platformInviteCode.findUnique({ where: { code } });
    const now = Date.now();
    if (
      !invite ||
      invite.revoked ||
      (invite.expiresAt && new Date(invite.expiresAt).getTime() <= now) ||
      invite.usedCount >= invite.maxUses
    ) {
      throw new BadRequestException({
        code: 'INVITE_INVALID',
        message: 'Dieser Invite-Code ist ungültig, abgelaufen oder bereits vollständig verwendet.',
      });
    }
    const updated = await tx.platformInviteCode.updateMany({
      where: { id: invite.id, revoked: false, usedCount: invite.usedCount },
      data: { usedCount: { increment: 1 } },
    });
    if (updated.count !== 1) {
      // Parallel verbraucht/widerrufen – nicht still doppelt nutzen.
      throw new BadRequestException({
        code: 'INVITE_INVALID',
        message: 'Dieser Invite-Code ist ungültig, abgelaufen oder bereits vollständig verwendet.',
      });
    }
  }

  // ─── Registrierung ──────────────────────────────────────────────────────

  async register(dto: any): Promise<{ user: Record<string, unknown>; emailVerificationRequired: boolean; note: string }> {
    if (dto.captchaToken !== undefined || this.captcha.enforced) {
      await this.captcha.verify(dto.captchaToken);
    }
    const email = String(dto.email).toLowerCase().trim();
    const username = String(dto.username).trim();
    const password = String(dto.password);

    if (!validateAge(dto.dateOfBirth)) {
      throw new BadRequestException({
        code: 'UNDERAGE',
        message: `Du musst mindestens ${MIN_AGE} Jahre alt sein, um Nexa zu nutzen.`,
      });
    }
    if (!isPasswordAcceptable(password)) {
      const strength = passwordStrength(password);
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: `Das Passwort ist zu schwach. ${strength.feedback.join(' ')}`.trim(),
      });
    }
    const existingEmail = await this.prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'Diese E-Mail-Adresse wird bereits verwendet.' });
    }
    const existingUsername = await this.prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      throw new ConflictException({ code: 'USERNAME_TAKEN', message: 'Dieser Benutzername ist bereits vergeben.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    // Plattform-Invite-Gate: Code-Prüfung + Verbrauch und Kontoanlage laufen
    // in EINER Transaktion – ohne gültigen Code entsteht kein Konto, und
    // ein Code wird nur verbraucht, wenn das Konto wirklich angelegt wird.
    const user = await this.prisma.$transaction(async (tx: any) => {
      await this.consumePlatformInvite(tx, dto.platformInviteCode);
      try {
        return await tx.user.create({
          data: {
            email,
            username,
            displayName: dto.displayName ? String(dto.displayName) : username,
            passwordHash,
            dateOfBirth: new Date(dto.dateOfBirth),
          },
        });
      } catch (err: any) {
        // Rennen gegen die Vorabprüfung oben: Unique-Verletzung sauber mappen.
        if (err?.code === 'P2002') {
          const target = String(err?.meta?.target ?? '');
          if (target.includes('email')) {
            throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'Diese E-Mail-Adresse wird bereits verwendet.' });
          }
          throw new ConflictException({ code: 'USERNAME_TAKEN', message: 'Dieser Benutzername ist bereits vergeben.' });
        }
        throw err;
      }
    });

    await this.maybeGrantEarlyAdopter(user.id);

    const rawToken = await this.createVerificationToken(user.id, 'EMAIL_VERIFY', 24);
    await this.mail.sendVerifyEmail(user.email, rawToken);

    return {
      user: selfUser(user),
      emailVerificationRequired: true,
      note: 'Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach. Unbestätigte Konten können keine Server erstellen und nicht in Server-Kanälen schreiben.',
    };
  }

  // ─── Login / Sessions ───────────────────────────────────────────────────

  async login(dto: any, meta: SessionMeta): Promise<any> {
    const identifier = String(dto.email ?? dto.username ?? '').toLowerCase().trim();
    const password = String(dto.password ?? '');
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'E-Mail/Benutzername oder Passwort ist falsch.' });
    }
    if (user.isPlatformBanned) {
      throw new ForbiddenException({ code: 'PLATFORM_BANNED', message: 'Dieses Konto wurde von Nexa gesperrt.' });
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new ForbiddenException({
        code: 'ACCOUNT_LOCKED',
        message: 'Dieses Konto ist wegen zu vieler Fehlversuche vorübergehend gesperrt. Bitte warte 15 Minuten.',
      });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const fails = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: fails,
          lockedUntil: fails >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : user.lockedUntil,
        },
      });
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'E-Mail/Benutzername oder Passwort ist falsch.' });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    if (user.totpEnabled) {
      const twoFactorToken = jwt.sign({ sub: user.id, scope: '2fa' }, this.accessSecret(), { expiresIn: 300 });
      return { requiresTwoFactor: true, twoFactorToken };
    }
    return this.issueSession(user, meta);
  }

  /** Zweiter Faktor nach dem Login (TOTP oder Backup-Code, einmalig nutzbar). */
  async loginTwoFactor(twoFactorToken: string, code: string, meta: SessionMeta): Promise<IssuedSession> {
    let payload: { sub: string; scope?: string };
    try {
      payload = jwt.verify(twoFactorToken, this.accessSecret()) as { sub: string; scope?: string };
    } catch {
      throw new UnauthorizedException({ code: 'TWO_FACTOR_TOKEN_INVALID', message: 'Die Zwei-Faktor-Sitzung ist abgelaufen. Bitte melde dich erneut an.' });
    }
    if (payload.scope !== '2fa') {
      throw new UnauthorizedException({ code: 'TWO_FACTOR_TOKEN_INVALID', message: 'Ungültiges Zwei-Faktor-Token.' });
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'Konto nicht gefunden.' });
    const ok = await this.verifyTotpOrBackup(user, code);
    if (!ok) {
      throw new UnauthorizedException({ code: 'TWO_FACTOR_INVALID', message: 'Der Zwei-Faktor-Code ist falsch.' });
    }
    return this.issueSession(user, meta);
  }

  /** TOTP prüfen; falls kein Treffer, Backup-Codes (bcrypt) prüfen und verbrauchen. */
  async verifyTotpOrBackup(user: any, code: string): Promise<boolean> {
    if (user.totpSecret) {
      const valid = speakeasy.totp.verify({
        secret: user.totpSecret,
        encoding: 'base32',
        token: code,
        window: 1,
      });
      if (valid) return true;
    }
    const codes: string[] = user.backupCodes ?? [];
    for (let i = 0; i < codes.length; i++) {
      if (await bcrypt.compare(code, codes[i])) {
        const remaining = codes.filter((_, idx) => idx !== i);
        await this.prisma.user.update({ where: { id: user.id }, data: { backupCodes: remaining } });
        return true;
      }
    }
    return false;
  }

  /** Neue Session erzeugen: Access-JWT + Refresh-Token (Hash in DB). */
  async issueSession(user: any, meta: SessionMeta): Promise<IssuedSession> {
    const rawRefresh = randomBytes(48).toString('hex');
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(rawRefresh),
        deviceName: meta.deviceName ?? null,
        userAgent: meta.userAgent ?? null,
        ipAddress: meta.ipAddress ?? null,
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds() * 1000),
      },
    });
    return {
      accessToken: this.signAccessToken(user),
      refreshCookieValue: `${session.id}.${rawRefresh}`,
      refreshMaxAgeMs: this.refreshTtlSeconds() * 1000,
      user: selfUser(user),
    };
  }

  /** Refresh-Rotation: alte Session widerrufen, neues Token-Paar ausstellen. */
  async refresh(cookieValue: string | undefined, meta: SessionMeta): Promise<IssuedSession> {
    if (!cookieValue) throw new UnauthorizedException({ code: 'NO_REFRESH_TOKEN', message: 'Keine Sitzung vorhanden.' });
    const dot = cookieValue.indexOf('.');
    if (dot <= 0) throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: 'Sitzung ungültig.' });
    const sessionId = cookieValue.slice(0, dot);
    const raw = cookieValue.slice(dot + 1);
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.refreshTokenHash !== sha256(raw)
    ) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: 'Sitzung ungültig oder abgelaufen.' });
    }
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.isPlatformBanned) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: 'Sitzung ungültig.' });
    }
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    const issued = await this.issueSession(user, {
      ipAddress: meta.ipAddress ?? session.ipAddress ?? undefined,
      userAgent: meta.userAgent ?? session.userAgent ?? undefined,
      deviceName: session.deviceName ?? undefined,
    });
    return issued;
  }

  async logout(cookieValue: string | undefined): Promise<void> {
    if (!cookieValue) return;
    const sessionId = cookieValue.split('.')[0];
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listSessions(userId: string): Promise<any[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((s: any) => ({
      id: s.id,
      deviceName: s.deviceName,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ─── E-Mail-Verifizierung & Passwort-Reset ──────────────────────────────

  async createVerificationToken(userId: string, type: 'EMAIL_VERIFY' | 'PASSWORD_RESET', hours: number): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    await this.prisma.verificationToken.create({
      data: {
        userId,
        type,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + hours * 3600 * 1000),
      },
    });
    return raw;
  }

  private async consumeToken(raw: string, type: 'EMAIL_VERIFY' | 'PASSWORD_RESET'): Promise<any> {
    const token = await this.prisma.verificationToken.findFirst({
      where: { tokenHash: sha256(raw), type },
      include: { user: true },
    });
    if (!token || token.usedAt || token.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({ code: 'TOKEN_INVALID', message: 'Der Link ist ungültig oder abgelaufen.' });
    }
    await this.prisma.verificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
    return token.user;
  }

  async verifyEmail(rawToken: string): Promise<{ verified: boolean }> {
    const user = await this.consumeToken(rawToken, 'EMAIL_VERIFY');
    await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    return { verified: true };
  }

  async resendVerification(userId: string): Promise<{ sent: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'Konto nicht gefunden.' });
    if (user.emailVerifiedAt) return { sent: false };
    const raw = await this.createVerificationToken(user.id, 'EMAIL_VERIFY', 24);
    await this.mail.sendVerifyEmail(user.email, raw);
    return { sent: true };
  }

  /** Immer Erfolg melden (keine Auskunft, ob die E-Mail existiert). */
  async forgotPassword(emailRaw: string): Promise<{ sent: boolean }> {
    const email = String(emailRaw || '').toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.passwordHash) {
      const raw = await this.createVerificationToken(user.id, 'PASSWORD_RESET', 1);
      await this.mail.sendResetEmail(user.email, raw);
    }
    return { sent: true };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<{ reset: boolean }> {
    if (!isPasswordAcceptable(newPassword)) {
      const strength = passwordStrength(newPassword);
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: `Das Passwort ist zu schwach. ${strength.feedback.join(' ')}`.trim(),
      });
    }
    const user = await this.consumeToken(rawToken, 'PASSWORD_RESET');
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
    await this.revokeAllSessions(user.id);
    return { reset: true };
  }

  // ─── Zwei-Faktor-Einrichtung ────────────────────────────────────────────

  async setupTwoFactor(userId: string): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'Konto nicht gefunden.' });
    const secret = speakeasy.generateSecret({ name: `Nexa (${user.username})`, issuer: 'Nexa' });
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: secret.base32 } });
    const otpauthUrl = secret.otpauth_url as string;
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret: secret.base32, otpauthUrl, qrDataUrl };
  }

  async enableTwoFactor(userId: string, code: string): Promise<{ enabled: boolean; backupCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.totpSecret) {
      throw new BadRequestException({ code: 'TWO_FACTOR_NOT_SETUP', message: 'Bitte richte zuerst die Zwei-Faktor-Authentifizierung ein.' });
    }
    const valid = speakeasy.totp.verify({ secret: user.totpSecret, encoding: 'base32', token: code, window: 1 });
    if (!valid) throw new BadRequestException({ code: 'TWO_FACTOR_INVALID', message: 'Der Code ist falsch.' });
    const plain: string[] = [];
    const hashed: string[] = [];
    for (let i = 0; i < 8; i++) {
      const c = randomBytes(5).toString('hex');
      plain.push(c);
      hashed.push(await bcrypt.hash(c, BCRYPT_COST));
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true, backupCodes: hashed },
    });
    return { enabled: true, backupCodes: plain };
  }

  async disableTwoFactor(userId: string, code: string): Promise<{ disabled: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.totpEnabled) return { disabled: true };
    const ok = await this.verifyTotpOrBackup(user, code);
    if (!ok) throw new BadRequestException({ code: 'TWO_FACTOR_INVALID', message: 'Der Code ist falsch.' });
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null, backupCodes: [] },
    });
    return { disabled: true };
  }

  // ─── OAuth-Kontoauflösung ───────────────────────────────────────────────

  /**
   * Findet oder erstellt ein Konto für eine OAuth-Identität:
   *  1) bestehende Verknüpfung (provider, providerUserId)
   *  2) Konto mit gleicher (vom Anbieter verifizierter) E-Mail → verknüpfen
   *  3) neues Konto anlegen (Nutzername aus E-Mail-Präfix + Suffix bei Kollision)
   */
  async resolveOAuthAccount(input: {
    provider: 'GOOGLE' | 'APPLE';
    providerUserId: string;
    email: string | null;
    displayName: string | null;
    /**
     * Plattform-Invite-Code aus dem OAuth-Start (Cookie). Nur für die
     * NEUANLAGE eines Kontos nötig (Pfad 3); bestehende Konten und
     * Verknüpfungen (Pfad 1/2) loggen sich wie bisher ohne Code ein.
     */
    platformInviteCode?: string | null;
  }): Promise<any> {
    const identity = await this.prisma.oAuthIdentity.findUnique({
      where: { provider_providerUserId: { provider: input.provider, providerUserId: input.providerUserId } },
      include: { user: true },
    });
    if (identity) return identity.user;

    if (input.email) {
      const byEmail = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (byEmail) {
        await this.prisma.oAuthIdentity.create({
          data: {
            userId: byEmail.id,
            provider: input.provider,
            providerUserId: input.providerUserId,
            email: input.email,
          },
        });
        return byEmail;
      }
    }

    if (!input.email) {
      throw new BadRequestException({
        code: 'OAUTH_EMAIL_MISSING',
        message: 'Der Anbieter hat keine E-Mail-Adresse übermittelt; Konto kann nicht erstellt werden.',
      });
    }
    const email = input.email.toLowerCase();
    let base = email.split('@')[0].replace(/[^a-zA-Z0-9_]+/g, '_').slice(0, 24) || 'nexa_user';
    let username = base;
    let counter = 0;
    while (await this.prisma.user.findUnique({ where: { username } })) {
      counter += 1;
      username = `${base}${counter}`;
    }
    // Neuanlage nur mit gültigem Plattform-Invite-Code (Gate wie bei der
    // E-Mail-Registrierung): Verbrauch + Konto + Identität in einer
    // Transaktion, damit kein halb angelegtes Konto ohne Code entsteht.
    const user = await this.prisma.$transaction(async (tx: any) => {
      await this.consumePlatformInvite(tx, input.platformInviteCode);
      const created = await tx.user.create({
        data: {
          email,
          username,
          displayName: input.displayName || username,
          passwordHash: null,
          // Das Schema verlangt ein Geburtsdatum. OAuth-Anbieter liefern keins;
          // 1970-01-01 ist ein reiner Platzhalter (Sentinel) – das Alter wird
          // dabei nicht behauptet, das Konto ist per Anbieter-E-Mail verifiziert.
          dateOfBirth: new Date('1970-01-01T00:00:00.000Z'),
          emailVerifiedAt: new Date(),
        },
      });
      await tx.oAuthIdentity.create({
        data: { userId: created.id, provider: input.provider, providerUserId: input.providerUserId, email },
      });
      return created;
    });
    await this.maybeGrantEarlyAdopter(user.id);
    return user;
  }

  /**
   * Auto-Vergabe EARLY_ADOPTER: Die ersten 100 Konten der Plattform
   * erhalten das Abzeichen automatisch bei der Registrierung (E-Mail
   * und OAuth-Neuanlage). Bewusst defensiv (Delegate-Check + try/catch):
   * Ein Fehler hier darf die Registrierung niemals kippen, und in
   * Unit-Tests ohne userBadge-Mock ist der Hook ein No-Op. Es gibt
   * keinen Admin-Audit-Eintrag (grantedById = NULL = System-Vergabe).
   */
  private async maybeGrantEarlyAdopter(userId: string): Promise<void> {
    try {
      const delegate = (this.prisma as any).userBadge;
      if (!delegate) return;
      const total = await this.prisma.user.count();
      if (total > 100) return;
      await delegate.upsert({
        where: { userId_badgeKey: { userId, badgeKey: 'EARLY_ADOPTER' } },
        create: { userId, badgeKey: 'EARLY_ADOPTER', grantedById: null },
        update: {},
      });
    } catch {
      /* Abzeichen sind Beiwerk – Registrierung nie daran scheitern lassen. */
    }
  }
}
