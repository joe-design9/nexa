import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthService } from '../auth/auth.service';
import { publicUser } from '../common/dto';
import { generatePlatformInviteCode } from '../common/invite-code';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Plattform-Administration (nur isPlatformAdmin, per AdminGuard geschützt). */

/** Serialisierte Ansicht eines Plattform-Invite-Codes inkl. abgeleitetem Status. */
export function platformInviteDto(r: any): Record<string, unknown> {
  const expired = r.expiresAt ? new Date(r.expiresAt).getTime() <= Date.now() : false;
  const status = r.revoked ? 'REVOKED' : expired ? 'EXPIRED' : r.usedCount >= r.maxUses ? 'EXHAUSTED' : 'ACTIVE';
  return {
    id: r.id,
    code: r.code,
    maxUses: r.maxUses,
    usedCount: r.usedCount,
    revoked: Boolean(r.revoked),
    expiresAt: r.expiresAt ?? null,
    createdAt: r.createdAt,
    createdBy: r.createdBy ? { id: r.createdBy.id, username: r.createdBy.username } : null,
    status,
  };
}
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async stats(): Promise<any> {
    const [users, servers, messages, channels, reportsOpen, bots] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.server.count(),
      this.prisma.message.count(),
      this.prisma.channel.count(),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.botAccount.count(),
    ]);
    return { users, servers, messages, channels, reportsOpen, bots };
  }

  async listUsers(q?: string): Promise<any[]> {
    const users = await this.prisma.user.findMany({
      where: q
        ? {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return users.map((u: any) => ({
      ...publicUser(u),
      email: u.email,
      emailVerifiedAt: u.emailVerifiedAt,
      isPlatformAdmin: u.isPlatformAdmin,
      isPlatformBanned: u.isPlatformBanned,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));
  }

  async banUser(adminId: string, userId: string, reason?: string): Promise<{ banned: boolean }> {
    await this.prisma.user.update({ where: { id: userId }, data: { isPlatformBanned: true } });
    await this.auth.revokeAllSessions(userId);
    await this.audit.log({ actorId: adminId, action: 'PLATFORM_USER_BAN', targetType: 'USER', targetId: userId, reason: reason ?? null });
    return { banned: true };
  }

  async unbanUser(adminId: string, userId: string): Promise<{ unbanned: boolean }> {
    await this.prisma.user.update({ where: { id: userId }, data: { isPlatformBanned: false } });
    await this.audit.log({ actorId: adminId, action: 'PLATFORM_USER_UNBAN', targetType: 'USER', targetId: userId });
    return { unbanned: true };
  }

  async setVerified(adminId: string, userId: string, verified: boolean): Promise<{ verified: boolean }> {
    await this.prisma.user.update({ where: { id: userId }, data: { verified } });
    await this.audit.log({ actorId: adminId, action: 'PLATFORM_USER_VERIFY', targetType: 'USER', targetId: userId, changes: { verified } });
    return { verified };
  }

  async listServers(): Promise<any[]> {
    const servers = await this.prisma.server.findMany({
      include: { _count: { select: { members: true, channels: true } }, owner: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return servers.map((s: any) => ({
      id: s.id,
      name: s.name,
      ownerId: s.ownerId,
      owner: s.owner,
      isPublic: s.isPublic,
      category: s.category,
      memberCount: s._count.members,
      channelCount: s._count.channels,
      createdAt: s.createdAt,
    }));
  }

  async deleteServer(adminId: string, serverId: string): Promise<{ deleted: boolean }> {
    await this.prisma.server.delete({ where: { id: serverId } });
    await this.audit.log({ actorId: adminId, action: 'PLATFORM_SERVER_DELETE', targetType: 'SERVER', targetId: serverId });
    return { deleted: true };
  }

  async platformAudit(): Promise<any[]> {
    return this.prisma.auditLog.findMany({
      where: { serverId: null },
      include: { actor: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ─── Plattform-Invite-Codes (Registrierungs-Gate) ──────────────────────

  /**
   * Erzeugt 1..100 neue Plattform-Invite-Codes (Batch). Die Klartext-Codes
   * werden nur in dieser Antwort zurückgegeben (sie stehen danach zwar in
   * der DB – das ist gewollt, damit der Admin sie in der Liste jederzeit
   * wieder kopieren kann – sind aber ausschließlich über die Admin-API
   * mit Admin-Rolle lesbar).
   */
  async createPlatformInvites(
    adminId: string,
    input: { count?: number; maxUses?: number; expiresAt?: Date | string | null },
  ): Promise<{ codes: Record<string, unknown>[] }> {
    const count = Math.min(Math.max(Math.floor(input.count ?? 1), 1), 100);
    const maxUses = Math.min(Math.max(Math.floor(input.maxUses ?? 1), 1), 1000);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    const created: any[] = [];
    for (let i = 0; i < count; i++) {
      // Kollisionen sind bei 32^12 Kombinationen praktisch ausgeschlossen;
      // bei einer Unique-Verletzung wird einfach ein neuer Code gewürfelt.
      let row: any = null;
      for (let attempt = 0; attempt < 5 && !row; attempt++) {
        try {
          row = await this.prisma.platformInviteCode.create({
            data: { code: generatePlatformInviteCode(), maxUses, expiresAt, createdById: adminId },
            include: { createdBy: { select: { id: true, username: true } } },
          });
        } catch (err: any) {
          if (err?.code !== 'P2002') throw err;
        }
      }
      if (row) created.push(row);
    }
    await this.audit.log({
      actorId: adminId,
      action: 'PLATFORM_INVITE_CREATE',
      targetType: 'PLATFORM_INVITE',
      changes: { count: created.length, maxUses, codes: created.map((c: any) => c.code) },
    });
    return { codes: created.map((c: any) => platformInviteDto(c)) };
  }

  /** Alle Plattform-Invite-Codes inkl. Nutzung, neueste zuerst. */
  async listPlatformInvites(): Promise<Record<string, unknown>[]> {
    const rows = await this.prisma.platformInviteCode.findMany({
      include: { createdBy: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r: any) => platformInviteDto(r));
  }

  /** Code widerrufen: Er kann danach nicht mehr zur Registrierung genutzt werden. */
  async revokePlatformInvite(adminId: string, id: string): Promise<Record<string, unknown>> {
    const existing = await this.prisma.platformInviteCode.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, username: true } } },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'INVITE_NOT_FOUND', message: 'Invite-Code nicht gefunden.' });
    }
    const updated = await this.prisma.platformInviteCode.update({
      where: { id },
      data: { revoked: true },
      include: { createdBy: { select: { id: true, username: true } } },
    });
    await this.audit.log({
      actorId: adminId,
      action: 'PLATFORM_INVITE_REVOKE',
      targetType: 'PLATFORM_INVITE',
      targetId: id,
      changes: { code: existing.code },
    });
    return platformInviteDto(updated);
  }
}
