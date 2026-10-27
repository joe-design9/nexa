import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions.service';
import { AuditService } from '../common/audit.service';
import { PERMISSIONS, hasPermission } from '@nexa/shared';

/* eslint-disable @typescript-eslint/no-explicit-any */

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  private async targetContext(serverId: string, actorId: string, targetUserId: string): Promise<{ server: any; actorCtx: any; targetMember: any; targetCtx: any }> {
    const { server, ctx } = await this.perms.serverContext(serverId, actorId);
    const targetMember = await this.perms.getMember(serverId, targetUserId);
    if (!targetMember) throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Mitglied nicht gefunden.' });
    const targetCtx = this.perms.memberContext(server, targetMember);
    return { server, actorCtx: ctx, targetMember, targetCtx };
  }

  private assertHierarchy(actorCtx: any, targetCtx: any): void {
    if (!this.perms.canActOnMember(actorCtx, targetCtx)) {
      throw new ForbiddenException({
        code: 'HIERARCHY',
        message: 'Du kannst keine Aktion gegen ein Mitglied mit gleicher oder höherer Rolle ausführen.',
      });
    }
  }

  async kick(serverId: string, actorId: string, targetUserId: string, reason?: string): Promise<{ kicked: boolean }> {
    const { actorCtx, targetMember, targetCtx } = await this.targetContext(serverId, actorId, targetUserId);
    this.perms.require(actorCtx.basePermissions, PERMISSIONS.KICK_MEMBERS);
    this.assertHierarchy(actorCtx, targetCtx);
    await this.prisma.member.delete({ where: { id: targetMember.id } });
    await this.audit.log({ actorId, action: 'MEMBER_KICK', serverId, targetType: 'USER', targetId: targetUserId, reason: reason ?? null });
    this.events.emit('nexa.member.leave', { serverId, userId: targetUserId, member: targetMember });
    return { kicked: true };
  }

  async ban(
    serverId: string,
    actorId: string,
    targetUserId: string,
    opts: { reason?: string; deleteMessageDays?: number; expiresInMinutes?: number },
  ): Promise<{ banned: boolean }> {
    const { actorCtx, targetCtx } = await this.targetContext(serverId, actorId, targetUserId);
    this.perms.require(actorCtx.basePermissions, PERMISSIONS.BAN_MEMBERS);
    this.assertHierarchy(actorCtx, targetCtx);
    const deleteDays = Math.min(Math.max(opts.deleteMessageDays ?? 0, 0), 7);
    const ban = await this.prisma.ban.upsert({
      where: { serverId_userId: { serverId, userId: targetUserId } },
      create: {
        serverId,
        userId: targetUserId,
        bannedById: actorId,
        reason: opts.reason ?? null,
        deleteMessageDays: deleteDays,
        expiresAt: opts.expiresInMinutes ? new Date(Date.now() + opts.expiresInMinutes * 60000) : null,
      },
      update: {
        bannedById: actorId,
        reason: opts.reason ?? null,
        deleteMessageDays: deleteDays,
        expiresAt: opts.expiresInMinutes ? new Date(Date.now() + opts.expiresInMinutes * 60000) : null,
      },
    });
    const member = await this.perms.getMember(serverId, targetUserId);
    if (member) await this.prisma.member.delete({ where: { id: member.id } });
    if (deleteDays > 0) {
      const since = new Date(Date.now() - deleteDays * 24 * 3600 * 1000);
      const channels = await this.prisma.channel.findMany({ where: { serverId }, select: { id: true } });
      await this.prisma.message.updateMany({
        where: {
          authorId: targetUserId,
          channelId: { in: channels.map((c: any) => c.id) },
          createdAt: { gte: since },
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });
    }
    await this.audit.log({ actorId, action: 'MEMBER_BAN', serverId, targetType: 'USER', targetId: targetUserId, reason: opts.reason ?? null });
    this.events.emit('nexa.member.leave', { serverId, userId: targetUserId, member: null });
    void ban;
    return { banned: true };
  }

  async unban(serverId: string, actorId: string, targetUserId: string): Promise<{ unbanned: boolean }> {
    const { ctx } = await this.perms.serverContext(serverId, actorId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.BAN_MEMBERS);
    await this.prisma.ban.deleteMany({ where: { serverId, userId: targetUserId } });
    await this.audit.log({ actorId, action: 'MEMBER_UNBAN', serverId, targetType: 'USER', targetId: targetUserId });
    return { unbanned: true };
  }

  async listBans(serverId: string, actorId: string): Promise<any[]> {
    const { ctx } = await this.perms.serverContext(serverId, actorId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.BAN_MEMBERS);
    const bans = await this.prisma.ban.findMany({
      where: { serverId },
      include: { user: true, bannedBy: true },
      orderBy: { createdAt: 'desc' },
    });
    return bans.map((b: any) => ({
      id: b.id,
      serverId: b.serverId,
      userId: b.userId,
      user: { id: b.user.id, username: b.user.username, displayName: b.user.displayName, avatarUrl: b.user.avatarUrl },
      bannedById: b.bannedById,
      reason: b.reason,
      deleteMessageDays: b.deleteMessageDays,
      expiresAt: b.expiresAt,
      createdAt: b.createdAt,
    }));
  }

  async timeout(serverId: string, actorId: string, targetUserId: string, minutes: number, reason?: string): Promise<{ timeoutUntil: Date }> {
    const { actorCtx, targetMember, targetCtx } = await this.targetContext(serverId, actorId, targetUserId);
    this.perms.require(actorCtx.basePermissions, PERMISSIONS.TIMEOUT_MEMBERS);
    this.assertHierarchy(actorCtx, targetCtx);
    if (!minutes || minutes <= 0) throw new BadRequestException({ code: 'INVALID_TIMEOUT', message: 'Bitte eine positive Minutenzahl angeben.' });
    const until = new Date(Date.now() + minutes * 60000);
    await this.prisma.member.update({ where: { id: targetMember.id }, data: { timeoutUntil: until } });
    await this.audit.log({ actorId, action: 'MEMBER_TIMEOUT', serverId, targetType: 'USER', targetId: targetUserId, reason: reason ?? `${minutes} Minuten` });
    this.events.emit('nexa.member.update', { serverId, userId: targetUserId });
    return { timeoutUntil: until };
  }

  async removeTimeout(serverId: string, actorId: string, targetUserId: string): Promise<{ cleared: boolean }> {
    const { actorCtx, targetMember, targetCtx } = await this.targetContext(serverId, actorId, targetUserId);
    this.perms.require(actorCtx.basePermissions, PERMISSIONS.TIMEOUT_MEMBERS);
    this.assertHierarchy(actorCtx, targetCtx);
    await this.prisma.member.update({ where: { id: targetMember.id }, data: { timeoutUntil: null } });
    await this.audit.log({ actorId, action: 'MEMBER_TIMEOUT_REMOVE', serverId, targetType: 'USER', targetId: targetUserId });
    return { cleared: true };
  }

  /** Bis zu 100 Nachrichten in einem Kanal gebündelt (soft) löschen. */
  async purge(actorId: string, channelId: string, amount: number, filterUserId?: string): Promise<{ purged: number }> {
    const { perms, server, channel } = await this.perms.channelAccess(actorId, channelId);
    this.perms.require(perms, PERMISSIONS.MANAGE_MESSAGES);
    const take = Math.min(Math.max(amount || 0, 1), 100);
    const messages = await this.prisma.message.findMany({
      where: { channelId, deletedAt: null, ...(filterUserId ? { authorId: filterUserId } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true },
    });
    if (messages.length) {
      await this.prisma.message.updateMany({
        where: { id: { in: messages.map((m: any) => m.id) } },
        data: { deletedAt: new Date() },
      });
      for (const m of messages) {
        this.events.emit('nexa.message.delete', { messageId: m.id, channelId, serverId: server?.id ?? channel.serverId ?? null });
      }
    }
    if (server) {
      await this.audit.log({
        actorId,
        action: 'MESSAGE_PURGE',
        serverId: server.id,
        targetType: 'CHANNEL',
        targetId: channelId,
        changes: { count: messages.length, filterUserId: filterUserId ?? null },
      });
    }
    return { purged: messages.length };
  }

  async auditLogs(serverId: string, actorId: string, filter: { action?: string; actorId?: string }): Promise<any[]> {
    const { ctx } = await this.perms.serverContext(serverId, actorId);
    if (
      !hasPermission(ctx.basePermissions, PERMISSIONS.MANAGE_SERVER) &&
      !hasPermission(ctx.basePermissions, PERMISSIONS.ADMINISTRATOR)
    ) {
      throw new ForbiddenException({ code: 'MISSING_PERMISSION', message: 'Für das Audit-Log brauchst du „Server verwalten“. ' });
    }
    const logs = await this.prisma.auditLog.findMany({
      where: {
        serverId,
        ...(filter.action ? { action: filter.action } : {}),
        ...(filter.actorId ? { actorId: filter.actorId } : {}),
      },
      include: { actor: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return logs;
  }
}
