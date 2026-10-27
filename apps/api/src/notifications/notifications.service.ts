import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { notificationDto } from '../common/dto';

/* eslint-disable @typescript-eslint/no-explicit-any */

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, unreadOnly: boolean): Promise<any[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((n: any) => notificationDto(n));
  }

  async markRead(userId: string, notificationId: string): Promise<{ read: boolean }> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: true };
  }

  async markAllRead(userId: string): Promise<{ read: boolean }> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: true };
  }

  async getPreferences(userId: string): Promise<any[]> {
    const prefs = await this.prisma.notificationPreference.findMany({ where: { userId } });
    return prefs.map((p: any) => ({
      id: p.id,
      userId: p.userId,
      serverId: p.serverId ?? null,
      channelId: p.channelId ?? null,
      level: p.level,
    }));
  }

  /** Präferenz pro Server ODER Kanal setzen (genau eines von beiden). */
  async putPreference(userId: string, dto: any): Promise<any> {
    const level = String(dto.level ?? '');
    if (!['ALL', 'MENTIONS', 'NOTHING'].includes(level)) {
      throw new BadRequestException({ code: 'INVALID_LEVEL', message: 'Ungültige Benachrichtigungsstufe.' });
    }
    const hasServer = Boolean(dto.serverId);
    const hasChannel = Boolean(dto.channelId);
    if (hasServer === hasChannel) {
      throw new BadRequestException({ code: 'INVALID_SCOPE', message: 'Bitte genau einen Server oder einen Kanal angeben.' });
    }
    if (hasServer) {
      const server = await this.prisma.server.findUnique({ where: { id: dto.serverId } });
      if (!server) throw new NotFoundException({ code: 'SERVER_NOT_FOUND', message: 'Server nicht gefunden.' });
      const existing = await this.prisma.notificationPreference.findFirst({ where: { userId, serverId: dto.serverId } });
      const saved = existing
        ? await this.prisma.notificationPreference.update({ where: { id: existing.id }, data: { level: level as never } })
        : await this.prisma.notificationPreference.create({ data: { userId, serverId: dto.serverId, level: level as never } });
      return { id: saved.id, serverId: saved.serverId, channelId: null, level: saved.level };
    }
    const channel = await this.prisma.channel.findUnique({ where: { id: dto.channelId } });
    if (!channel) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'Kanal nicht gefunden.' });
    const existing = await this.prisma.notificationPreference.findFirst({ where: { userId, channelId: dto.channelId } });
    const saved = existing
      ? await this.prisma.notificationPreference.update({ where: { id: existing.id }, data: { level: level as never } })
      : await this.prisma.notificationPreference.create({ data: { userId, channelId: dto.channelId, level: level as never } });
    return { id: saved.id, serverId: null, channelId: saved.channelId, level: saved.level };
  }
}
