import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { channelDto, publicUser } from '../common/dto';

/* eslint-disable @typescript-eslint/no-explicit-any */

@Injectable()
export class DmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
  ) {}

  /** DM-Kanal mit einem Zielnutzer finden oder erstellen (inkl. Privatsphäre-Checks). */
  async openDm(userId: string, targetUserId: string): Promise<any> {
    if (targetUserId === userId) {
      throw new BadRequestException({ code: 'CANNOT_DM_SELF', message: 'Du kannst dir selbst keine DM schreiben.' });
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Nutzer nicht gefunden.' });
    if (await this.friends.isBlockedEitherWay(userId, targetUserId)) {
      throw new ForbiddenException({ code: 'BLOCKED', message: 'Unterhaltung nicht möglich (Blockierung).' });
    }
    if (target.dmPrivacy === 'NONE') {
      throw new ForbiddenException({ code: 'DM_CLOSED', message: 'Dieser Nutzer nimmt keine Direktnachrichten an.' });
    }
    if (target.dmPrivacy === 'FRIENDS' && !(await this.friends.areFriends(userId, targetUserId))) {
      throw new ForbiddenException({ code: 'DM_FRIENDS_ONLY', message: 'Dieser Nutzer nimmt nur Nachrichten von Freunden an.' });
    }

    // Bestehende 1:1-DM suchen: DM-Kanäle, in denen beide Teilnehmer sind.
    const myDms = await this.prisma.dmParticipant.findMany({
      where: { userId },
      include: { channel: { include: { dmParticipants: { include: { user: { include: { badges: { select: { badgeKey: true } } } } } } } } },
    });
    for (const row of myDms as any[]) {
      const ch = row.channel;
      if (ch.type === 'DM' && ch.dmParticipants.some((p: any) => p.userId === targetUserId)) {
        return this.dmDto(ch, userId);
      }
    }

    const channel = await this.prisma.channel.create({
      data: {
        name: target.displayName,
        type: 'DM',
        dmParticipants: { create: [{ userId }, { userId: targetUserId }] },
      },
      include: { dmParticipants: { include: { user: { include: { badges: { select: { badgeKey: true } } } } } } },
    });
    return this.dmDto(channel, userId);
  }

  /** Gruppen-DM: Ersteller + bis zu 9 weitere Nutzer (max. 10 Teilnehmer). */
  async createGroup(userId: string, userIds: string[], name?: string): Promise<any> {
    const unique = [...new Set((userIds ?? []).filter((id) => id !== userId))];
    if (unique.length === 0) throw new BadRequestException({ code: 'NO_PARTICIPANTS', message: 'Bitte wähle mindestens eine Person aus.' });
    if (unique.length > 9) throw new BadRequestException({ code: 'GROUP_TOO_LARGE', message: 'Eine Gruppen-DM hat höchstens 10 Teilnehmer.' });
    for (const id of unique) {
      if (await this.friends.isBlockedEitherWay(userId, id)) {
        throw new ForbiddenException({ code: 'BLOCKED', message: 'Eine Person in der Gruppe ist blockiert.' });
      }
    }
    const users = await this.prisma.user.findMany({ where: { id: { in: [userId, ...unique] } } });
    const groupName = name || users.map((u: any) => u.displayName).join(', ').slice(0, 100);
    const channel = await this.prisma.channel.create({
      data: {
        name: groupName,
        type: 'GROUP_DM',
        dmParticipants: { create: [userId, ...unique].map((id) => ({ userId: id })) },
      },
      include: { dmParticipants: { include: { user: { include: { badges: { select: { badgeKey: true } } } } } } },
    });
    return this.dmDto(channel, userId);
  }

  async listDms(userId: string): Promise<any[]> {
    const rows = await this.prisma.dmParticipant.findMany({
      where: { userId },
      include: { channel: { include: { dmParticipants: { include: { user: { include: { badges: { select: { badgeKey: true } } } } } } } } },
    });
    const result = [];
    for (const row of rows as any[]) {
      result.push(await this.dmDto(row.channel, userId, true));
    }
    result.sort((a, b) => {
      const ta = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const tb = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return tb - ta;
    });
    return result;
  }

  async addParticipant(userId: string, channelId: string, targetUserId: string): Promise<any> {
    const channel = await this.loadGroupChannel(userId, channelId);
    const count = await this.prisma.dmParticipant.count({ where: { channelId } });
    if (count >= 10) throw new BadRequestException({ code: 'GROUP_TOO_LARGE', message: 'Eine Gruppen-DM hat höchstens 10 Teilnehmer.' });
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Nutzer nicht gefunden.' });
    await this.prisma.dmParticipant.upsert({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      create: { channelId, userId: targetUserId },
      update: {},
    });
    const full = await this.prisma.channel.findUnique({
      where: { id: channel.id },
      include: { dmParticipants: { include: { user: { include: { badges: { select: { badgeKey: true } } } } } } },
    });
    return this.dmDto(full, userId);
  }

  async removeParticipant(userId: string, channelId: string, targetUserId: string): Promise<{ removed: boolean }> {
    await this.loadGroupChannel(userId, channelId);
    if (targetUserId !== userId) {
      throw new ForbiddenException({ code: 'CANNOT_REMOVE_OTHERS', message: 'Du kannst nur dich selbst aus der Gruppe entfernen.' });
    }
    await this.prisma.dmParticipant.deleteMany({ where: { channelId, userId: targetUserId } });
    return { removed: true };
  }

  private async loadGroupChannel(userId: string, channelId: string): Promise<any> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || (channel.type !== 'GROUP_DM' && channel.type !== 'DM')) {
      throw new NotFoundException({ code: 'DM_NOT_FOUND', message: 'Unterhaltung nicht gefunden.' });
    }
    const participant = await this.prisma.dmParticipant.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!participant) throw new ForbiddenException({ code: 'NOT_DM_PARTICIPANT', message: 'Kein Zugriff auf diese Unterhaltung.' });
    return channel;
  }

  private async dmDto(channel: any, viewerId: string, withLastMessage = false): Promise<any> {
    const dto: Record<string, unknown> = {
      ...channelDto(channel),
      participants: (channel.dmParticipants ?? []).map((p: any) => publicUser(p.user)),
    };
    if (withLastMessage) {
      const last = await this.prisma.message.findFirst({
        where: { channelId: channel.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: { author: { include: { badges: { select: { badgeKey: true } } } } },
      });
      const readState = await this.prisma.readState.findUnique({
        where: { userId_channelId: { userId: viewerId, channelId: channel.id } },
      });
      dto.lastMessage = last
        ? { id: last.id, content: last.content, createdAt: last.createdAt, author: publicUser(last.author) }
        : null;
      dto.unread = Boolean(last && last.authorId !== viewerId && (!readState || last.createdAt.getTime() > new Date(readState.lastReadAt).getTime()));
      dto.mentionCount = readState?.mentionCount ?? 0;
    }
    return dto;
  }
}
