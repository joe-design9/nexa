import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { AuthService } from '../auth/auth.service';
import { isPasswordAcceptable, passwordStrength } from '@nexa/shared';
import { profileUser, publicUser, selfUser, memberDto } from '../common/dto';
import { userBadgeDto } from '../badges/badges.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auth: AuthService,
  ) {}

  async getMe(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { badges: { select: { badgeKey: true }, orderBy: { grantedAt: 'asc' } } },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Konto nicht gefunden.' });
    return selfUser(user);
  }

  async updateMe(userId: string, dto: any): Promise<any> {
    const data: Record<string, unknown> = {};
    for (const field of ['displayName', 'about', 'pronouns', 'avatarUrl', 'bannerUrl', 'customStatusText', 'customStatusEmoji', 'locale', 'theme'] as const) {
      if (dto[field] !== undefined) data[field] = dto[field];
    }
    // Onboarding-Tutorial: gesehen-Flag als Zeitstempel ablegen (true = jetzt
    // gesehen, false = zurücksetzen, damit die Tour wieder automatisch kommt).
    if (dto.tutorialSeen === true) data.tutorialSeenAt = new Date();
    else if (dto.tutorialSeen === false) data.tutorialSeenAt = null;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: { badges: { select: { badgeKey: true }, orderBy: { grantedAt: 'asc' } } },
    });
    return selfUser(user);
  }

  /** Sichtbaren Präsenzstatus setzen (DB + Redis). INVISIBLE wirkt nach außen als OFFLINE. */
  async updateStatus(userId: string, status: string): Promise<{ status: string }> {
    const allowed = ['ONLINE', 'IDLE', 'DND', 'INVISIBLE'];
    if (!allowed.includes(status)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: 'Ungültiger Status.' });
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: status as never },
    });
    await this.redis.setPresence(userId, status, user.customStatusText);
    return { status };
  }

  async updatePrivacy(userId: string, dto: any): Promise<any> {
    const data: Record<string, unknown> = {};
    if (dto.dmPrivacy !== undefined) {
      if (!['EVERYONE', 'FRIENDS', 'NONE'].includes(dto.dmPrivacy)) {
        throw new BadRequestException({ code: 'INVALID_PRIVACY', message: 'Ungültige DM-Einstellung.' });
      }
      data.dmPrivacy = dto.dmPrivacy;
    }
    if (dto.friendRequestPrivacy !== undefined) {
      if (!['EVERYONE', 'FRIENDS_OF_FRIENDS', 'NONE'].includes(dto.friendRequestPrivacy)) {
        throw new BadRequestException({ code: 'INVALID_PRIVACY', message: 'Ungültige Einstellung für Freundschaftsanfragen.' });
      }
      data.friendRequestPrivacy = dto.friendRequestPrivacy;
    }
    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return { dmPrivacy: user.dmPrivacy, friendRequestPrivacy: user.friendRequestPrivacy };
  }

  /** Profil-Popup: öffentliche Daten + gemeinsame Server + optional Rollen in einem Server. */
  async getProfile(userId: string, viewerId: string, serverId?: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        badges: {
          include: { grantedBy: { select: { id: true, username: true } } },
          orderBy: { grantedAt: 'asc' },
        },
      },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Nutzer nicht gefunden.' });

    const viewerMemberships = await this.prisma.member.findMany({
      where: { userId: viewerId },
      select: { serverId: true },
    });
    const targetMemberships = await this.prisma.member.findMany({
      where: { userId },
      select: { serverId: true },
    });
    const viewerSet = new Set(viewerMemberships.map((m: any) => m.serverId));
    const commonServerIds = targetMemberships.map((m: any) => m.serverId).filter((id: string) => viewerSet.has(id));

    let roles: unknown[] | undefined;
    let member: unknown;
    if (serverId) {
      const m = await this.prisma.member.findUnique({
        where: { serverId_userId: { serverId, userId } },
        include: { roles: { include: { role: true } } },
      });
      if (m) {
        member = memberDto(m);
        roles = m.roles.map((mr: any) => mr.roleId);
      }
    }

    return {
      ...profileUser(user),
      badges: { verified: Boolean(user.verified), bot: Boolean(user.isBot) },
      // Gesammelte Abzeichen (Katalog-Schlüssel + Vergabe-Details) für das
      // Abzeichen-Raster im Profil. `badges` oben bleibt das alte
      // Verifiziert/Bot-Flag-Objekt; die Schlüssel stecken zusätzlich in
      // profileUser (publicUser.badges).
      badgeGrants: (user.badges ?? []).map((b: any) => userBadgeDto(b)),
      commonServerIds,
      member,
      roleIds: roles,
    };
  }

  async search(q: string, viewerId: string): Promise<any[]> {
    const query = (q || '').trim();
    if (query.length < 2) return [];
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: viewerId },
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { username: 'asc' },
      include: { badges: { select: { badgeKey: true } } },
    });
    return users.map((u: any) => publicUser(u));
  }

  /** DSGVO-Export: Profil, Mitgliedschaften, Nachrichten, Freundschaften, Sitzungen. */
  async exportData(userId: string): Promise<any> {
    const [user, memberships, messages, friendships, sessions] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.member.findMany({ where: { userId }, include: { server: { select: { id: true, name: true } }, roles: true } }),
      this.prisma.message.findMany({ where: { authorId: userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.friendship.findMany({
        where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      }),
      this.prisma.session.findMany({ where: { userId } }),
    ]);
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Konto nicht gefunden.' });
    const { passwordHash: _ph, totpSecret: _ts, backupCodes: _bc, ...safeUser } = user as any;
    return {
      exportedAt: new Date().toISOString(),
      profile: safeUser,
      memberships,
      messages: messages.map((m: any) => ({
        id: m.id, channelId: m.channelId, content: m.content, createdAt: m.createdAt, editedAt: m.editedAt,
      })),
      friendships,
      sessions: sessions.map((s: any) => ({
        id: s.id, deviceName: s.deviceName, userAgent: s.userAgent, ipAddress: s.ipAddress, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt,
      })),
    };
  }

  /**
   * Konto löschen (hart). Eigene Server mit weiteren Mitgliedern blockieren
   * die Löschung (409), außer ?force=true – dann werden sie mit gelöscht.
   * Nachrichten des Nutzers werden mit entfernt (DSGVO-Löschung; das Schema
   * erlaubt kein anonymes Weiterführen, da Message.authorId Pflicht ist).
   */
  async deleteMe(userId: string, password: string | undefined, force: boolean): Promise<{ deleted: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Konto nicht gefunden.' });
    if (user.passwordHash) {
      if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
        throw new ForbiddenException({ code: 'INVALID_PASSWORD', message: 'Das Passwort ist falsch.' });
      }
    }
    const owned = await this.prisma.server.findMany({
      where: { ownerId: userId },
      include: { _count: { select: { members: true } } },
    });
    const blocking = owned.filter((s: any) => s._count.members > 1);
    if (blocking.length > 0 && !force) {
      throw new ConflictException({
        code: 'OWNS_SERVERS',
        message: 'Du besitzt noch Server mit anderen Mitgliedern. Übertrage oder lösche sie zuerst – oder lösche das Konto mit ?force=true.',
      });
    }
    for (const server of owned) {
      await this.prisma.server.delete({ where: { id: server.id } });
    }
    await this.prisma.message.deleteMany({ where: { authorId: userId } });
    await this.prisma.user.delete({ where: { id: userId } });
    return { deleted: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ changed: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      throw new BadRequestException({ code: 'NO_PASSWORD_SET', message: 'Für dieses Konto ist kein Passwort gesetzt (Social Login).' });
    }
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new ForbiddenException({ code: 'INVALID_PASSWORD', message: 'Das aktuelle Passwort ist falsch.' });
    }
    if (!isPasswordAcceptable(newPassword)) {
      const strength = passwordStrength(newPassword);
      throw new BadRequestException({ code: 'WEAK_PASSWORD', message: `Das Passwort ist zu schwach. ${strength.feedback.join(' ')}`.trim() });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });
    await this.auth.revokeAllSessions(userId);
    return { changed: true };
  }
}
