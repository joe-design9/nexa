import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PERMISSIONS,
  hasPermission,
  computeServerPermissions,
  computeChannelPermissions,
} from '@nexa/shared';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MemberContext {
  member: any;
  roles: any[];
  everyoneRole: any;
  basePermissions: bigint;
  isOwner: boolean;
}

/**
 * Zentrale Berechtigungsprüfung. Die eigentliche Bitfeld-Mathematik liegt in
 * @nexa/shared (computeServerPermissions / computeChannelPermissions);
 * dieser Service lädt den Kontext aus der Datenbank.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMember(serverId: string, userId: string): Promise<any | null> {
    return this.prisma.member.findUnique({
      where: { serverId_userId: { serverId, userId } },
      include: { roles: { include: { role: true } } },
    });
  }

  /** Basis-Kontext eines Mitglieds auf einem Server (ohne Kanal-Overrides). */
  memberContext(server: any, member: any): MemberContext {
    const roles = (member.roles ?? []).map((mr: any) => mr.role).filter(Boolean);
    const everyoneRole = roles.find((r: any) => r.isDefault);
    const isOwner = server.ownerId === member.userId;
    const basePermissions = computeServerPermissions({
      isOwner,
      rolePermissions: roles.map((r: any) => r.permissions as bigint),
    });
    return { member, roles, everyoneRole, basePermissions, isOwner };
  }

  async serverContext(serverId: string, userId: string): Promise<{ server: any; ctx: MemberContext }> {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException({ code: 'SERVER_NOT_FOUND', message: 'Server nicht gefunden.' });
    const member = await this.getMember(serverId, userId);
    if (!member) {
      throw new ForbiddenException({ code: 'NOT_SERVER_MEMBER', message: 'Du bist kein Mitglied dieses Servers.' });
    }
    return { server, ctx: this.memberContext(server, member) };
  }

  /** Kanal-Berechtigungen inkl. Overrides (DM-Kanäle: siehe channelAccess). */
  channelPermissions(channel: any, ctx: MemberContext): bigint {
    const overrides = (channel.overrides ?? []).map((o: any) => ({
      targetType: o.targetType as 'ROLE' | 'MEMBER',
      roleId: o.roleId ?? null,
      memberId: o.memberId ?? null,
      allow: o.allow as bigint,
      deny: o.deny as bigint,
    }));
    return computeChannelPermissions({
      base: ctx.basePermissions,
      isOwner: ctx.isOwner,
      everyoneRoleId: ctx.everyoneRole?.id ?? '',
      memberId: ctx.member.id,
      memberRoleIds: ctx.roles.map((r: any) => r.id),
      overrides,
    });
  }

  async loadChannelWithOverrides(channelId: string): Promise<any | null> {
    return this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { overrides: true },
    });
  }

  /**
   * Voller Kanalzugriff für einen Nutzer:
   *  - DM/GROUP_DM: Teilnehmer sein.
   *  - Server-Kanal: Mitglied + VIEW_CHANNELS (kanalspezifisch berechnet).
   * Gibt { channel, perms } zurück; perms ist bei DMs ALL_PERMISSIONS-ähnlich
   * (VIEW+SEND), bei Server-Kanälen das berechnete Bitfeld.
   */
  async channelAccess(userId: string, channelId: string): Promise<{ channel: any; perms: bigint; member: any | null; server: any | null }> {
    const channel = await this.loadChannelWithOverrides(channelId);
    if (!channel) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'Kanal nicht gefunden.' });

    if (channel.type === 'DM' || channel.type === 'GROUP_DM') {
      const participant = await this.prisma.dmParticipant.findUnique({
        where: { channelId_userId: { channelId, userId } },
      });
      if (!participant) {
        throw new ForbiddenException({ code: 'NOT_DM_PARTICIPANT', message: 'Kein Zugriff auf diese Unterhaltung.' });
      }
      const perms =
        PERMISSIONS.VIEW_CHANNELS |
        PERMISSIONS.SEND_MESSAGES |
        PERMISSIONS.READ_MESSAGE_HISTORY |
        PERMISSIONS.ADD_REACTIONS |
        PERMISSIONS.ATTACH_FILES |
        PERMISSIONS.EMBED_LINKS |
        PERMISSIONS.CONNECT |
        PERMISSIONS.SPEAK |
        PERMISSIONS.VIDEO |
        PERMISSIONS.STREAM;
      return { channel, perms, member: null, server: null };
    }

    if (!channel.serverId) {
      throw new ForbiddenException({ code: 'CHANNEL_ACCESS_DENIED', message: 'Kein Zugriff auf diesen Kanal.' });
    }
    const { server, ctx } = await this.serverContext(channel.serverId, userId);
    const perms = this.channelPermissions(channel, ctx);
    if (!hasPermission(perms, PERMISSIONS.VIEW_CHANNELS)) {
      throw new ForbiddenException({ code: 'MISSING_VIEW_PERMISSION', message: 'Du darfst diesen Kanal nicht sehen.' });
    }
    return { channel, perms, member: ctx.member, server };
  }

  require(perms: bigint, perm: bigint, code = 'MISSING_PERMISSION', message = 'Dafür hast du keine Berechtigung.'): void {
    if (!hasPermission(perms, perm)) throw new ForbiddenException({ code, message });
  }

  /** Höchste Rollenposition eines Mitglieds (Eigentümer = +∞). */
  highestPosition(ctx: MemberContext): number {
    if (ctx.isOwner) return Number.POSITIVE_INFINITY;
    return Math.max(0, ...ctx.roles.map((r: any) => r.position as number));
  }

  /** Hierarchie: Darf der Akteur auf die Ziel-Rolle/-Mitglied einwirken? */
  canActOnRole(ctx: MemberContext, role: any): boolean {
    if (ctx.isOwner) return true;
    if (hasPermission(ctx.basePermissions, PERMISSIONS.ADMINISTRATOR)) return true;
    return this.highestPosition(ctx) > (role.position as number);
  }

  canActOnMember(ctx: MemberContext, targetCtx: MemberContext): boolean {
    if (targetCtx.isOwner) return false;
    if (ctx.isOwner) return true;
    if (hasPermission(ctx.basePermissions, PERMISSIONS.ADMINISTRATOR) && !targetCtx.isOwner) return true;
    return this.highestPosition(ctx) > this.highestPosition(targetCtx);
  }
}
