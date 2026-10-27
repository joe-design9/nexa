import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { publicUser } from '../common/dto';

/* eslint-disable @typescript-eslint/no-explicit-any */

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Besteht eine Blockierung in eine der beiden Richtungen? */
  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
        status: 'BLOCKED',
      },
    });
    return rows.length > 0;
  }

  async areFriends(a: string, b: string): Promise<boolean> {
    const row = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
        status: 'ACCEPTED',
      },
    });
    return Boolean(row);
  }

  private async withPresence(rows: any[], viewerId: string): Promise<any[]> {
    const otherIds = rows.map((r: any) => (r.requesterId === viewerId ? r.addresseeId : r.requesterId));
    const presence = await this.redis.getPresence(otherIds);
    const users = await this.prisma.user.findMany({
      where: { id: { in: otherIds } },
      include: { badges: { select: { badgeKey: true } } },
    });
    const byId = new Map(users.map((u: any) => [u.id, u]));
    return rows.map((r: any) => {
      const otherId = r.requesterId === viewerId ? r.addresseeId : r.requesterId;
      const u = byId.get(otherId);
      return {
        id: r.id,
        status: r.status,
        direction: r.requesterId === viewerId ? 'OUTGOING' : 'INCOMING',
        user: u ? publicUser(u) : null,
        presence: presence[otherId] ?? { status: 'OFFLINE', customStatusText: null },
        createdAt: r.createdAt,
      };
    });
  }

  async list(userId: string, tab: string): Promise<any[]> {
    const base = { OR: [{ requesterId: userId }, { addresseeId: userId }] };
    let rows: any[];
    switch (tab) {
      case 'pending':
        rows = await this.prisma.friendship.findMany({ where: { ...base, status: 'PENDING' } });
        break;
      case 'blocked':
        rows = await this.prisma.friendship.findMany({ where: { requesterId: userId, status: 'BLOCKED' } });
        break;
      case 'all':
        rows = await this.prisma.friendship.findMany({ where: { ...base, status: 'ACCEPTED' } });
        break;
      case 'online':
      default: {
        rows = await this.prisma.friendship.findMany({ where: { ...base, status: 'ACCEPTED' } });
        const merged = await this.withPresence(rows, userId);
        return merged.filter((r: any) => ['ONLINE', 'IDLE', 'DND'].includes(r.presence.status));
      }
    }
    return this.withPresence(rows, userId);
  }

  async request(userId: string, username: string): Promise<any> {
    const target = await this.prisma.user.findUnique({ where: { username: String(username) } });
    if (!target) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Nutzer nicht gefunden.' });
    if (target.id === userId) {
      throw new ForbiddenException({ code: 'CANNOT_FRIEND_SELF', message: 'Du kannst dich nicht selbst als Freund hinzufügen.' });
    }
    if (await this.isBlockedEitherWay(userId, target.id)) {
      throw new ForbiddenException({ code: 'BLOCKED', message: 'Anfrage nicht möglich (Blockierung).' });
    }
    // Privatsphäre des Ziels prüfen.
    if (target.friendRequestPrivacy === 'NONE') {
      throw new ForbiddenException({ code: 'FRIEND_REQUESTS_DISABLED', message: 'Dieser Nutzer nimmt keine Freundschaftsanfragen an.' });
    }
    if (target.friendRequestPrivacy === 'FRIENDS_OF_FRIENDS') {
      const mutual = await this.hasMutualFriend(userId, target.id);
      if (!mutual) {
        throw new ForbiddenException({ code: 'NO_MUTUAL_FRIENDS', message: 'Nur Freunde von Freunden können diesem Nutzer Anfragen senden.' });
      }
    }

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: target.id },
          { requesterId: target.id, addresseeId: userId },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'ACCEPTED') return { status: 'ACCEPTED', friendshipId: existing.id };
      if (existing.status === 'PENDING') {
        if (existing.requesterId === target.id) {
          // Gegenanfrage offen → direkt annehmen.
          const updated = await this.prisma.friendship.update({ where: { id: existing.id }, data: { status: 'ACCEPTED' } });
          return { status: 'ACCEPTED', friendshipId: updated.id };
        }
        return { status: 'PENDING', friendshipId: existing.id };
      }
    }
    const created = await this.prisma.friendship.create({
      data: { requesterId: userId, addresseeId: target.id, status: 'PENDING' },
    });
    await this.prisma.notification.create({
      data: {
        userId: target.id,
        type: 'FRIEND_REQUEST',
        title: 'Neue Freundschaftsanfrage',
        body: 'Du hast eine neue Freundschaftsanfrage erhalten.',
        data: { fromUserId: userId },
      },
    });
    return { status: 'PENDING', friendshipId: created.id };
  }

  private async hasMutualFriend(a: string, b: string): Promise<boolean> {
    const friendsOf = async (id: string): Promise<Set<string>> => {
      const rows = await this.prisma.friendship.findMany({
        where: { status: 'ACCEPTED', OR: [{ requesterId: id }, { addresseeId: id }] },
      });
      return new Set(rows.map((r: any) => (r.requesterId === id ? r.addresseeId : r.requesterId)));
    };
    const [fa, fb] = await Promise.all([friendsOf(a), friendsOf(b)]);
    for (const id of fa) if (fb.has(id)) return true;
    return false;
  }

  private async findPending(userId: string, friendshipId: string): Promise<any> {
    const row = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!row || row.status !== 'PENDING' || row.addresseeId !== userId) {
      throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Freundschaftsanfrage nicht gefunden.' });
    }
    return row;
  }

  async accept(userId: string, friendshipId: string): Promise<any> {
    const row = await this.findPending(userId, friendshipId);
    const updated = await this.prisma.friendship.update({ where: { id: row.id }, data: { status: 'ACCEPTED' } });
    return { status: updated.status, friendshipId: updated.id };
  }

  async decline(userId: string, friendshipId: string): Promise<{ declined: boolean }> {
    const row = await this.findPending(userId, friendshipId);
    await this.prisma.friendship.delete({ where: { id: row.id } });
    return { declined: true };
  }

  async remove(userId: string, friendshipId: string): Promise<{ removed: boolean }> {
    const row = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!row || row.status !== 'ACCEPTED' || (row.requesterId !== userId && row.addresseeId !== userId)) {
      throw new NotFoundException({ code: 'FRIENDSHIP_NOT_FOUND', message: 'Freundschaft nicht gefunden.' });
    }
    await this.prisma.friendship.delete({ where: { id: row.id } });
    return { removed: true };
  }

  async block(userId: string, targetId: string): Promise<{ blocked: boolean }> {
    if (targetId === userId) throw new ForbiddenException({ code: 'CANNOT_BLOCK_SELF', message: 'Du kannst dich nicht selbst blockieren.' });
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Nutzer nicht gefunden.' });
    await this.prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: targetId },
          { requesterId: targetId, addresseeId: userId },
        ],
      },
    });
    await this.prisma.friendship.create({ data: { requesterId: userId, addresseeId: targetId, status: 'BLOCKED' } });
    return { blocked: true };
  }

  async unblock(userId: string, targetId: string): Promise<{ unblocked: boolean }> {
    await this.prisma.friendship.deleteMany({
      where: { requesterId: userId, addresseeId: targetId, status: 'BLOCKED' },
    });
    return { unblocked: true };
  }

  /** Freund-IDs eines Nutzers (für Präsenz-Broadcasts im Gateway). */
  async friendIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    });
    return rows.map((r: any) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  }
}
