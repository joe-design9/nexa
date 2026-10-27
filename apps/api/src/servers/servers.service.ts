import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions.service';
import { AuditService } from '../common/audit.service';
import { PERMISSIONS, hasPermission, DEFAULT_EVERYONE_PERMISSIONS } from '@nexa/shared';
import { serverDto } from '../common/dto';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Beitritts-/Schreibsperren eines Mitglieds prüfen. Gibt Fehlercode+Text oder null zurück. */
export function joinGateError(member: any, server: any): { code: string; message: string } | null {
  if (server.requireRulesAccept && !member.rulesAcceptedAt) {
    return { code: 'RULES_NOT_ACCEPTED', message: 'Bitte akzeptiere zuerst die Serverregeln.' };
  }
  if (server.memberAgeMinutes > 0) {
    const elapsedMin = (Date.now() - new Date(member.joinedAt).getTime()) / 60000;
    if (elapsedMin < server.memberAgeMinutes) {
      return {
        code: 'MEMBER_AGE_GATE',
        message: `Du kannst erst nach ${server.memberAgeMinutes} Minuten Mitgliedschaft schreiben.`,
      };
    }
  }
  return null;
}

/** E-Mail-Bestätigung für serverseitige Aktionen erzwingen. */
export function assertEmailVerified(user: any): void {
  if (!user.emailVerifiedAt) {
    throw new ForbiddenException({
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Bitte bestätige zuerst deine E-Mail-Adresse.',
    });
  }
}

/**
 * Favoriten an den Listenanfang heben. Stabile Partition: Die Reihenfolge
 * innerhalb der Favoriten und innerhalb der übrigen Einträge bleibt exakt
 * wie übergeben (bisherige Sortierung, z. B. Beitrittsdatum aufsteigend).
 */
export function favoritesFirst<T extends { isFavorite?: boolean | null }>(items: readonly T[]): T[] {
  const favorites: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (item.isFavorite) favorites.push(item);
    else rest.push(item);
  }
  return [...favorites, ...rest];
}

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async createServer(userId: string, dto: any): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Konto nicht gefunden.' });
    assertEmailVerified(user);

    const server = await this.prisma.server.create({
      data: {
        name: String(dto.name),
        description: dto.description ?? null,
        category: dto.category ?? 'Community',
        isPublic: Boolean(dto.isPublic ?? false),
        iconUrl: dto.iconUrl ?? null,
        ownerId: userId,
      },
    });
    const everyone = await this.prisma.role.create({
      data: {
        serverId: server.id,
        name: '@everyone',
        position: 0,
        permissions: DEFAULT_EVERYONE_PERMISSIONS,
        isDefault: true,
        mentionable: false,
      },
    });
    await this.prisma.member.create({
      data: { serverId: server.id, userId, roles: { create: { roleId: everyone.id } } },
    });
    const category = await this.prisma.channelCategory.create({
      data: { serverId: server.id, name: 'Allgemein', position: 0 },
    });
    await this.prisma.channel.create({
      data: { serverId: server.id, categoryId: category.id, name: 'allgemein', type: 'TEXT', position: 0 },
    });
    await this.prisma.channel.create({
      data: { serverId: server.id, categoryId: category.id, name: 'lounge', type: 'VOICE', position: 1 },
    });
    await this.audit.log({ actorId: userId, action: 'SERVER_CREATE', serverId: server.id, targetType: 'SERVER', targetId: server.id });
    await this.grantServerFounderBadge(userId);
    const count = await this.prisma.member.count({ where: { serverId: server.id } });
    return serverDto(server, { memberCount: count, myPermissions: PERMISSIONS.ADMINISTRATOR, isFavorite: false });
  }

  /**
   * Auto-Vergabe SERVER_FOUNDER: Wer einen Server erstellt, erhält das
   * Abzeichen (Upsert auf dem Unique-Index = effektiv einmalig beim
   * ersten eigenen Server). Defensiv wie der EARLY_ADOPTER-Hook im
   * Auth-Service: kein Audit-Eintrag (System-Vergabe, grantedById NULL),
   * Fehler dürfen die Server-Erstellung nie kippen.
   */
  private async grantServerFounderBadge(userId: string): Promise<void> {
    try {
      const delegate = (this.prisma as any).userBadge;
      if (!delegate) return;
      await delegate.upsert({
        where: { userId_badgeKey: { userId, badgeKey: 'SERVER_FOUNDER' } },
        create: { userId, badgeKey: 'SERVER_FOUNDER', grantedById: null },
        update: {},
      });
    } catch {
      /* Abzeichen sind Beiwerk – Server-Erstellung nie daran scheitern lassen. */
    }
  }

  async myServers(userId: string): Promise<any[]> {
    const memberships = await this.prisma.member.findMany({
      where: { userId },
      include: {
        server: { include: { _count: { select: { members: true } } } },
        roles: { include: { role: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
    // Favoriten stehen ganz oben; innerhalb beider Gruppen bleibt die
    // Beitritts-Reihenfolge stabil (favoritesFirst ist eine stabile Partition).
    return favoritesFirst(memberships).map((m: any) => {
      const ctx = this.perms.memberContext(m.server, m);
      return serverDto(m.server, { myPermissions: ctx.basePermissions, isFavorite: Boolean(m.isFavorite) });
    });
  }

  async discover(category?: string, q?: string): Promise<any[]> {
    const servers = await this.prisma.server.findMany({
      where: {
        isPublic: true,
        ...(category ? { category } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      include: { _count: { select: { members: true } } },
      orderBy: { members: { _count: 'desc' } },
      take: 50,
    });
    return servers.map((s: any) => serverDto(s));
  }

  async getServer(serverId: string, userId: string): Promise<any> {
    const { server, ctx } = await this.perms.serverContext(serverId, userId);
    const memberCount = await this.prisma.member.count({ where: { serverId } });
    return {
      ...serverDto(server, { myPermissions: ctx.basePermissions, memberCount, isFavorite: Boolean(ctx.member.isFavorite) }),
      member: { id: ctx.member.id },
    };
  }

  async updateServer(serverId: string, userId: string, dto: any): Promise<any> {
    const { server, ctx } = await this.perms.serverContext(serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_SERVER);
    const allowed = [
      'name', 'iconUrl', 'bannerUrl', 'description', 'category', 'isPublic',
      'verificationLevel', 'accountAgeMinutes', 'memberAgeMinutes', 'rulesText',
      'requireRulesAccept', 'welcomeMessage', 'welcomeChannelId', 'systemChannelId',
      'verificationRoleId', 'automodEnabled', 'bannedWords', 'automodBlockLinks',
      'automodMaxMentions', 'automodSpamLimit',
    ] as const;
    const data: Record<string, unknown> = {};
    for (const field of allowed) if (dto[field] !== undefined) data[field] = dto[field];
    const updated = await this.prisma.server.update({ where: { id: serverId }, data });
    await this.audit.log({ actorId: userId, action: 'SERVER_UPDATE', serverId, targetType: 'SERVER', targetId: serverId, changes: data as Record<string, unknown> });
    this.events.emit('nexa.server.update', { serverId, server: updated });
    return serverDto(updated, { myPermissions: ctx.basePermissions });
  }

  async deleteServer(serverId: string, userId: string): Promise<{ deleted: boolean }> {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException({ code: 'SERVER_NOT_FOUND', message: 'Server nicht gefunden.' });
    if (server.ownerId !== userId) {
      throw new ForbiddenException({ code: 'NOT_SERVER_OWNER', message: 'Nur der Server-Eigentümer kann den Server löschen.' });
    }
    await this.prisma.server.delete({ where: { id: serverId } });
    await this.audit.log({ actorId: userId, action: 'SERVER_DELETE', targetType: 'SERVER', targetId: serverId });
    return { deleted: true };
  }

  async leaveServer(serverId: string, userId: string): Promise<{ left: boolean }> {
    const { server, ctx } = await this.perms.serverContext(serverId, userId);
    if (server.ownerId === userId) {
      throw new BadRequestException({
        code: 'OWNER_CANNOT_LEAVE',
        message: 'Der Eigentümer kann den Server nicht verlassen. Übertrage ihn zuerst an ein anderes Mitglied.',
      });
    }
    await this.prisma.member.delete({ where: { id: ctx.member.id } });
    await this.audit.log({ actorId: userId, action: 'MEMBER_LEAVE', serverId, targetType: 'USER', targetId: userId });
    this.events.emit('nexa.member.leave', { serverId, userId, member: ctx.member });
    return { left: true };
  }

  async transferOwnership(serverId: string, userId: string, targetUserId: string): Promise<any> {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException({ code: 'SERVER_NOT_FOUND', message: 'Server nicht gefunden.' });
    if (server.ownerId !== userId) {
      throw new ForbiddenException({ code: 'NOT_SERVER_OWNER', message: 'Nur der Eigentümer kann den Server übertragen.' });
    }
    const targetMember = await this.perms.getMember(serverId, targetUserId);
    if (!targetMember) {
      throw new BadRequestException({ code: 'TARGET_NOT_MEMBER', message: 'Der Zielnutzer ist kein Mitglied dieses Servers.' });
    }
    const updated = await this.prisma.server.update({ where: { id: serverId }, data: { ownerId: targetUserId } });
    await this.audit.log({ actorId: userId, action: 'SERVER_TRANSFER', serverId, targetType: 'USER', targetId: targetUserId });
    return serverDto(updated);
  }

  async acceptRules(serverId: string, userId: string): Promise<{ accepted: boolean }> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    await this.prisma.member.update({ where: { id: ctx.member.id }, data: { rulesAcceptedAt: new Date() } });
    return { accepted: true };
  }

  /** „Verifizieren“-Button: vergibt die konfigurierte Verifizierungsrolle. */
  async verifyButton(serverId: string, userId: string): Promise<{ verified: boolean }> {
    const { server, ctx } = await this.perms.serverContext(serverId, userId);
    if (!server.verificationRoleId) return { verified: false };
    const role = await this.prisma.role.findUnique({ where: { id: server.verificationRoleId } });
    if (role && role.serverId === serverId) {
      await this.prisma.memberRole.upsert({
        where: { memberId_roleId: { memberId: ctx.member.id, roleId: role.id } },
        create: { memberId: ctx.member.id, roleId: role.id },
        update: {},
      });
    }
    await this.prisma.member.update({ where: { id: ctx.member.id }, data: { isVerifiedByButton: true } });
    return { verified: true };
  }

  /**
   * Persönlichen Server-Favoriten setzen oder entfernen. Nur Mitglieder
   * können favorisieren – serverContext wirft sonst SERVER_NOT_FOUND (404)
   * bzw. NOT_SERVER_MEMBER (403). Favoriten erscheinen in `myServers`
   * und damit in der Serverliste ganz am Anfang.
   */
  async setFavorite(
    serverId: string,
    userId: string,
    favorite: boolean,
  ): Promise<{ serverId: string; isFavorite: boolean; favoritedAt: Date | null }> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    const updated = await this.prisma.member.update({
      where: { id: ctx.member.id },
      data: { isFavorite: favorite, favoritedAt: favorite ? new Date() : null },
    });
    return { serverId, isFavorite: Boolean(updated.isFavorite), favoritedAt: updated.favoritedAt ?? null };
  }

  // ─── Einladungen & Beitritt ─────────────────────────────────────────────

  async invitePreview(code: string): Promise<any> {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { server: { include: { _count: { select: { members: true } } } } },
    });
    if (!invite) throw new NotFoundException({ code: 'INVITE_NOT_FOUND', message: 'Einladung nicht gefunden.' });
    return {
      code: invite.code,
      server: {
        id: invite.server.id,
        name: invite.server.name,
        iconUrl: invite.server.iconUrl,
        description: invite.server.description,
        memberCount: invite.server._count.members,
      },
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      uses: invite.uses,
    };
  }

  /** Zentrale Beitrittslogik (Einladung & öffentlicher Direktbeitritt). */
  async joinServer(userId: string, server: any, invite?: any): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Konto nicht gefunden.' });

    const existing = await this.perms.getMember(server.id, userId);
    if (existing) return { alreadyMember: true, serverId: server.id };

    const ban = await this.prisma.ban.findUnique({ where: { serverId_userId: { serverId: server.id, userId } } });
    if (ban && (!ban.expiresAt || ban.expiresAt.getTime() > Date.now())) {
      throw new ForbiddenException({ code: 'SERVER_BANNED', message: 'Du wurdest von diesem Server gebannt.' });
    }
    if (invite) {
      if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException({ code: 'INVITE_EXPIRED', message: 'Diese Einladung ist abgelaufen.' });
      }
      if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
        throw new BadRequestException({ code: 'INVITE_EXHAUSTED', message: 'Diese Einladung wurde bereits zu oft verwendet.' });
      }
    }
    // Verifizierungsstufen, die VOR dem Beitritt gelten (MEMBER_AGE greift erst beim Schreiben).
    switch (server.verificationLevel) {
      case 'EMAIL':
        assertEmailVerified(user);
        break;
      case 'ACCOUNT_AGE': {
        const ageMin = (Date.now() - new Date(user.createdAt).getTime()) / 60000;
        if (ageMin < server.accountAgeMinutes) {
          throw new ForbiddenException({
            code: 'ACCOUNT_TOO_YOUNG',
            message: `Dein Konto muss mindestens ${server.accountAgeMinutes} Minuten alt sein.`,
          });
        }
        break;
      }
      case 'PHONE':
        if (!user.phoneVerifiedAt) {
          throw new ForbiddenException({ code: 'PHONE_NOT_VERIFIED', message: 'Für diesen Server ist eine verifizierte Telefonnummer nötig.' });
        }
        break;
      default:
        break;
    }

    const everyone = await this.prisma.role.findFirst({ where: { serverId: server.id, isDefault: true } });
    const member = await this.prisma.member.create({
      data: {
        serverId: server.id,
        userId,
        roles: everyone ? { create: { roleId: everyone.id } } : undefined,
      },
      include: { roles: { include: { role: true } } },
    });
    if (invite) {
      await this.prisma.invite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
    }

    // Willkommensnachricht als System-Nachricht in den Willkommens-/Systemkanal.
    const welcomeChannelId = server.welcomeChannelId || server.systemChannelId;
    if (welcomeChannelId) {
      const text = (server.welcomeMessage || 'Willkommen auf {server}, {user}!').replace('{user}', `<@${userId}>`).replace('{server}', server.name);
      await this.prisma.message.create({
        data: { channelId: welcomeChannelId, authorId: userId, content: text, type: 'SYSTEM' },
      });
    }
    await this.audit.log({ actorId: userId, action: 'MEMBER_JOIN', serverId: server.id, targetType: 'USER', targetId: userId });
    this.events.emit('nexa.member.join', { serverId: server.id, userId, member });
    return { joined: true, serverId: server.id, memberId: member.id };
  }

  async acceptInvite(code: string, userId: string): Promise<any> {
    const invite = await this.prisma.invite.findUnique({ where: { code }, include: { server: true } });
    if (!invite) throw new NotFoundException({ code: 'INVITE_NOT_FOUND', message: 'Einladung nicht gefunden.' });
    return this.joinServer(userId, invite.server, invite);
  }

  async joinPublic(serverId: string, userId: string): Promise<any> {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException({ code: 'SERVER_NOT_FOUND', message: 'Server nicht gefunden.' });
    if (!server.isPublic) {
      throw new ForbiddenException({ code: 'SERVER_NOT_PUBLIC', message: 'Dieser Server ist nicht öffentlich.' });
    }
    return this.joinServer(userId, server);
  }

  async createInvite(serverId: string, userId: string, dto: any): Promise<any> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.CREATE_INVITES);
    const code = randomBytes(6).toString('hex');
    const maxAgeMinutes = Number(dto.maxAgeMinutes ?? 0);
    const invite = await this.prisma.invite.create({
      data: {
        code,
        serverId,
        channelId: dto.channelId ?? null,
        createdById: userId,
        maxUses: Number(dto.maxUses ?? 0),
        expiresAt: maxAgeMinutes > 0 ? new Date(Date.now() + maxAgeMinutes * 60000) : null,
      },
    });
    return invite;
  }

  async listInvites(serverId: string, userId: string): Promise<any[]> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    const canManage = hasPermission(ctx.basePermissions, PERMISSIONS.MANAGE_SERVER);
    return this.prisma.invite.findMany({
      where: { serverId, ...(canManage ? {} : { createdById: userId }) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteInvite(code: string, userId: string): Promise<{ deleted: boolean }> {
    const invite = await this.prisma.invite.findUnique({ where: { code } });
    if (!invite) throw new NotFoundException({ code: 'INVITE_NOT_FOUND', message: 'Einladung nicht gefunden.' });
    if (invite.createdById !== userId) {
      const { ctx } = await this.perms.serverContext(invite.serverId, userId);
      this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_SERVER);
    }
    await this.prisma.invite.delete({ where: { id: invite.id } });
    return { deleted: true };
  }
}
