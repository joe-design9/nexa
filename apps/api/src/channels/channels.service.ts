import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions.service';
import { AuditService } from '../common/audit.service';
import { PERMISSIONS, hasPermission } from '@nexa/shared';
import { channelDto, messageDto } from '../common/dto';

/* eslint-disable @typescript-eslint/no-explicit-any */

const CREATABLE_TYPES = ['TEXT', 'VOICE', 'ANNOUNCEMENT', 'FORUM', 'STAGE'];

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Kategorien ─────────────────────────────────────────────────────────

  async createCategory(serverId: string, userId: string, dto: any): Promise<any> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_CHANNELS);
    const max = await this.prisma.channelCategory.aggregate({ where: { serverId }, _max: { position: true } });
    return this.prisma.channelCategory.create({
      data: { serverId, name: String(dto.name), position: (max._max.position ?? -1) + 1 },
    });
  }

  async updateCategory(serverId: string, categoryId: string, userId: string, dto: any): Promise<any> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_CHANNELS);
    const cat = await this.prisma.channelCategory.findUnique({ where: { id: categoryId } });
    if (!cat || cat.serverId !== serverId) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Kategorie nicht gefunden.' });
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = String(dto.name);
    if (dto.position !== undefined) data.position = Number(dto.position);
    return this.prisma.channelCategory.update({ where: { id: categoryId }, data });
  }

  async deleteCategory(serverId: string, categoryId: string, userId: string): Promise<{ deleted: boolean }> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_CHANNELS);
    const cat = await this.prisma.channelCategory.findUnique({ where: { id: categoryId } });
    if (!cat || cat.serverId !== serverId) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Kategorie nicht gefunden.' });
    await this.prisma.channelCategory.delete({ where: { id: categoryId } });
    return { deleted: true };
  }

  // ─── Kanäle ─────────────────────────────────────────────────────────────

  async createChannel(serverId: string, userId: string, dto: any): Promise<any> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_CHANNELS);
    const type = String(dto.type ?? 'TEXT');
    if (!CREATABLE_TYPES.includes(type)) {
      throw new BadRequestException({ code: 'INVALID_CHANNEL_TYPE', message: 'Dieser Kanaltyp kann hier nicht erstellt werden.' });
    }
    const max = await this.prisma.channel.aggregate({ where: { serverId }, _max: { position: true } });
    const channel = await this.prisma.channel.create({
      data: {
        serverId,
        categoryId: dto.categoryId ?? null,
        name: String(dto.name),
        type: type as never,
        topic: dto.topic ?? null,
        slowmodeSeconds: Number(dto.slowmodeSeconds ?? 0),
        nsfw: Boolean(dto.nsfw ?? false),
        isPrivate: Boolean(dto.isPrivate ?? false),
        position: (max._max.position ?? -1) + 1,
      },
    });
    // Private Kanäle: @everyone bekommt standardmäßig ein VIEW-Verbot (Override).
    if (channel.isPrivate && ctx.everyoneRole) {
      await this.prisma.channelPermissionOverride.create({
        data: {
          channelId: channel.id,
          targetType: 'ROLE',
          roleId: ctx.everyoneRole.id,
          allow: 0n,
          deny: PERMISSIONS.VIEW_CHANNELS,
        },
      });
    }
    await this.audit.log({ actorId: userId, action: 'CHANNEL_CREATE', serverId, targetType: 'CHANNEL', targetId: channel.id });
    const dtoOut = channelDto(channel, { myPermissions: ctx.basePermissions });
    this.events.emit('nexa.channel.create', { serverId, channel: dtoOut });
    return dtoOut;
  }

  /** Nur Kanäle, die das Mitglied sehen darf (inkl. Threads des Servers ausgeschlossen). */
  async listChannels(serverId: string, userId: string): Promise<any> {
    const { server, ctx } = await this.perms.serverContext(serverId, userId);
    void server;
    const categories = await this.prisma.channelCategory.findMany({
      where: { serverId },
      orderBy: { position: 'asc' },
    });
    const channels = await this.prisma.channel.findMany({
      where: { serverId, type: { not: 'THREAD' } },
      include: { overrides: true },
      orderBy: { position: 'asc' },
    });
    const visible = channels
      .map((c: any) => ({ channel: c, perms: this.perms.channelPermissions(c, ctx) }))
      .filter(({ perms }) => hasPermission(perms, PERMISSIONS.VIEW_CHANNELS))
      .map(({ channel, perms }) => channelDto(channel, { myPermissions: perms }));
    return { categories, channels: visible };
  }

  async updateChannel(channelId: string, userId: string, dto: any): Promise<any> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel?.serverId) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'Kanal nicht gefunden.' });
    const { ctx } = await this.perms.serverContext(channel.serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_CHANNELS);
    const data: Record<string, unknown> = {};
    for (const field of ['name', 'topic', 'slowmodeSeconds', 'nsfw', 'isPrivate', 'categoryId', 'position'] as const) {
      if (dto[field] !== undefined) data[field] = dto[field];
    }
    const updated = await this.prisma.channel.update({ where: { id: channelId }, data });
    await this.audit.log({ actorId: userId, action: 'CHANNEL_UPDATE', serverId: channel.serverId, targetType: 'CHANNEL', targetId: channelId, changes: data as Record<string, unknown> });
    const out = channelDto(updated, { myPermissions: ctx.basePermissions });
    this.events.emit('nexa.channel.update', { serverId: channel.serverId, channel: out });
    return out;
  }

  async deleteChannel(channelId: string, userId: string): Promise<{ deleted: boolean }> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel?.serverId) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'Kanal nicht gefunden.' });
    const { ctx } = await this.perms.serverContext(channel.serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_CHANNELS);
    await this.prisma.channel.delete({ where: { id: channelId } });
    await this.audit.log({ actorId: userId, action: 'CHANNEL_DELETE', serverId: channel.serverId, targetType: 'CHANNEL', targetId: channelId });
    this.events.emit('nexa.channel.delete', { serverId: channel.serverId, channelId });
    return { deleted: true };
  }

  async reorder(userId: string, items: { id: string; position: number; categoryId?: string | null }[]): Promise<{ reordered: boolean }> {
    if (!items.length) return { reordered: true };
    const first = await this.prisma.channel.findUnique({ where: { id: items[0].id } });
    if (!first?.serverId) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'Kanal nicht gefunden.' });
    const { ctx } = await this.perms.serverContext(first.serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_CHANNELS);
    for (const item of items) {
      const ch = await this.prisma.channel.findUnique({ where: { id: item.id } });
      if (ch && ch.serverId === first.serverId) {
        await this.prisma.channel.update({
          where: { id: item.id },
          data: { position: item.position, categoryId: item.categoryId ?? ch.categoryId },
        });
      }
    }
    return { reordered: true };
  }

  // ─── Berechtigungs-Overrides ────────────────────────────────────────────

  async getOverrides(channelId: string, userId: string): Promise<any[]> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel?.serverId) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'Kanal nicht gefunden.' });
    const { ctx } = await this.perms.serverContext(channel.serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_CHANNELS);
    const overrides = await this.prisma.channelPermissionOverride.findMany({ where: { channelId } });
    return overrides.map((o: any) => ({
      id: o.id,
      channelId: o.channelId,
      targetType: o.targetType,
      roleId: o.roleId ?? null,
      memberId: o.memberId ?? null,
      allow: (o.allow as bigint).toString(),
      deny: (o.deny as bigint).toString(),
    }));
  }

  /** Overrides eines Kanals vollständig ersetzen. */
  async putOverrides(channelId: string, userId: string, overrides: any[]): Promise<any[]> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel?.serverId) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'Kanal nicht gefunden.' });
    const serverId = channel.serverId;
    const { ctx } = await this.perms.serverContext(serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_CHANNELS);
    await this.prisma.channelPermissionOverride.deleteMany({ where: { channelId } });
    for (const o of overrides ?? []) {
      const targetType = o.targetType === 'MEMBER' ? 'MEMBER' : 'ROLE';
      if (targetType === 'ROLE') {
        const role = await this.prisma.role.findUnique({ where: { id: o.roleId } });
        if (!role || role.serverId !== serverId) continue;
      } else {
        const member = await this.prisma.member.findUnique({ where: { id: o.memberId } });
        if (!member || member.serverId !== serverId) continue;
      }
      await this.prisma.channelPermissionOverride.create({
        data: {
          channelId,
          targetType: targetType as never,
          roleId: targetType === 'ROLE' ? o.roleId : null,
          memberId: targetType === 'MEMBER' ? o.memberId : null,
          allow: BigInt(o.allow ?? '0'),
          deny: BigInt(o.deny ?? '0'),
        },
      });
    }
    await this.audit.log({ actorId: userId, action: 'CHANNEL_OVERRIDES_UPDATE', serverId, targetType: 'CHANNEL', targetId: channelId });
    return this.getOverrides(channelId, userId);
  }

  // ─── Threads & Foren ────────────────────────────────────────────────────

  /**
   * Thread in einem TEXT-/FORUM-Kanal anlegen. In Foren ist das der
   * eigentliche Beitrag: Der Thread trägt die Startnachricht.
   */
  async createThread(channelId: string, userId: string, dto: any): Promise<any> {
    const { channel, perms } = await this.perms.channelAccess(userId, channelId);
    this.perms.require(perms, PERMISSIONS.SEND_MESSAGES);
    if (!['TEXT', 'FORUM', 'ANNOUNCEMENT'].includes(channel.type)) {
      throw new BadRequestException({ code: 'THREADS_NOT_SUPPORTED', message: 'Threads sind in diesem Kanaltyp nicht möglich.' });
    }
    let starterMessage: any = null;
    if (dto.fromMessageId) {
      starterMessage = await this.prisma.message.findUnique({ where: { id: dto.fromMessageId } });
      if (!starterMessage || starterMessage.channelId !== channelId) {
        throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'Ausgangsnachricht nicht gefunden.' });
      }
    }
    const thread = await this.prisma.channel.create({
      data: {
        serverId: channel.serverId,
        categoryId: channel.categoryId,
        name: String(dto.name).slice(0, 100),
        type: 'THREAD',
        parentChannelId: channelId,
        starterMessageId: starterMessage?.id ?? null,
        position: 0,
      },
    });
    if (dto.starterContent) {
      const msg = await this.prisma.message.create({
        data: { channelId: thread.id, authorId: userId, content: String(dto.starterContent) },
        include: { author: true, attachments: true, reactions: true },
      });
      await this.prisma.channel.update({ where: { id: thread.id }, data: { starterMessageId: msg.id } });
      starterMessage = msg;
    }
    return {
      thread: channelDto(thread),
      starterMessage: starterMessage ? messageDto(starterMessage, userId) : null,
    };
  }

  async listThreads(channelId: string, userId: string): Promise<any[]> {
    await this.perms.channelAccess(userId, channelId);
    const threads = await this.prisma.channel.findMany({
      where: { parentChannelId: channelId },
      orderBy: { createdAt: 'desc' },
    });
    return threads.map((t: any) => channelDto(t));
  }

  async archiveThread(threadId: string, userId: string): Promise<any> {
    const thread = await this.prisma.channel.findUnique({ where: { id: threadId } });
    if (!thread || thread.type !== 'THREAD' || !thread.parentChannelId) {
      throw new NotFoundException({ code: 'THREAD_NOT_FOUND', message: 'Thread nicht gefunden.' });
    }
    const parent = await this.prisma.channel.findUnique({ where: { id: thread.parentChannelId } });
    const starter = thread.starterMessageId
      ? await this.prisma.message.findUnique({ where: { id: thread.starterMessageId } })
      : null;
    const isAuthor = starter?.authorId === userId;
    if (!isAuthor && parent?.serverId) {
      const { ctx } = await this.perms.serverContext(parent.serverId, userId);
      this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_CHANNELS);
    } else if (!isAuthor) {
      await this.perms.channelAccess(userId, thread.parentChannelId);
    }
    const updated = await this.prisma.channel.update({ where: { id: threadId }, data: { archived: true } });
    return channelDto(updated);
  }
}
