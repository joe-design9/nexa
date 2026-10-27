import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions.service';
import { RedisService } from '../common/redis.service';
import { AuditService } from '../common/audit.service';
import { PERMISSIONS, hasPermission, namesToPermission } from '@nexa/shared';
import { roleDto, memberDto } from '../common/dto';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Berechtigungen aus DTO lesen: Dezimal-String oder Namen-Liste (Shared-Schema). */
export function parsePermissionsInput(value: unknown, fallback: bigint): bigint {
  if (value === undefined || value === null) return fallback;
  if (Array.isArray(value)) return namesToPermission(value as string[]);
  return BigInt(String(value));
}


@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  async listRoles(serverId: string, userId: string): Promise<any[]> {
    await this.perms.serverContext(serverId, userId);
    const roles = await this.prisma.role.findMany({ where: { serverId }, orderBy: { position: 'desc' } });
    return roles.map((r: any) => roleDto(r));
  }

  async createRole(serverId: string, userId: string, dto: any): Promise<any> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_ROLES);
    const max = await this.prisma.role.aggregate({ where: { serverId }, _max: { position: true } });
    const role = await this.prisma.role.create({
      data: {
        serverId,
        name: String(dto.name),
        color: dto.color ?? '#99AAB5',
        icon: dto.icon ?? null,
        position: (max._max.position ?? 0) + 1,
        permissions: parsePermissionsInput(dto.permissions, 0n),
        mentionable: dto.mentionable ?? true,
        hoist: dto.hoist ?? false,
      },
    });
    await this.audit.log({ actorId: userId, action: 'ROLE_CREATE', serverId, targetType: 'ROLE', targetId: role.id });
    return roleDto(role);
  }

  async updateRole(serverId: string, roleId: string, userId: string, dto: any): Promise<any> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_ROLES);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.serverId !== serverId) throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Rolle nicht gefunden.' });

    if (role.isDefault) {
      // @everyone: nur die Berechtigungen dürfen geändert werden.
      const keys = Object.keys(dto).filter((k) => dto[k] !== undefined);
      if (keys.some((k) => k !== 'permissions')) {
        throw new ForbiddenException({
          code: 'EVERYONE_ROLE_LOCKED',
          message: 'Für die @everyone-Rolle können nur die Berechtigungen geändert werden.',
        });
      }
      const updated = await this.prisma.role.update({
        where: { id: roleId },
        data: { permissions: parsePermissionsInput(dto.permissions, role.permissions as bigint) },
      });
      return roleDto(updated);
    }
    if (!this.perms.canActOnRole(ctx, role)) {
      throw new ForbiddenException({ code: 'ROLE_HIERARCHY', message: 'Diese Rolle steht in der Hierarchie über deiner höchsten Rolle.' });
    }
    const data: Record<string, unknown> = {};
    for (const field of ['name', 'color', 'icon', 'mentionable', 'hoist'] as const) {
      if (dto[field] !== undefined) data[field] = dto[field];
    }
    if (dto.permissions !== undefined) data.permissions = parsePermissionsInput(dto.permissions, 0n);
    const updated = await this.prisma.role.update({ where: { id: roleId }, data });
    await this.audit.log({ actorId: userId, action: 'ROLE_UPDATE', serverId, targetType: 'ROLE', targetId: roleId, changes: data as Record<string, unknown> });
    return roleDto(updated);
  }

  async deleteRole(serverId: string, roleId: string, userId: string): Promise<{ deleted: boolean }> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_ROLES);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.serverId !== serverId) throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Rolle nicht gefunden.' });
    if (role.isDefault) {
      throw new BadRequestException({ code: 'EVERYONE_ROLE_LOCKED', message: 'Die @everyone-Rolle kann nicht gelöscht werden.' });
    }
    if (!this.perms.canActOnRole(ctx, role)) {
      throw new ForbiddenException({ code: 'ROLE_HIERARCHY', message: 'Diese Rolle steht in der Hierarchie über deiner höchsten Rolle.' });
    }
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.audit.log({ actorId: userId, action: 'ROLE_DELETE', serverId, targetType: 'ROLE', targetId: roleId });
    return { deleted: true };
  }

  /** Reihenfolge der Rollen neu setzen (orderedIds von oben nach unten). */
  async reorderRoles(serverId: string, userId: string, orderedIds: string[]): Promise<any[]> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_ROLES);
    const roles = await this.prisma.role.findMany({ where: { serverId } });
    const byId = new Map(roles.map((r: any) => [r.id, r]));
    const total = roles.length;
    const updates: Promise<unknown>[] = [];
    orderedIds.forEach((id, idx) => {
      const role = byId.get(id);
      if (role && !role.isDefault) {
        updates.push(this.prisma.role.update({ where: { id }, data: { position: total - idx } }));
      }
    });
    await Promise.all(updates);
    return this.listRoles(serverId, userId);
  }

  async assignRole(serverId: string, targetUserId: string, roleId: string, userId: string): Promise<{ assigned: boolean }> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_ROLES);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.serverId !== serverId || role.isDefault) {
      throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Rolle nicht gefunden.' });
    }
    if (!this.perms.canActOnRole(ctx, role)) {
      throw new ForbiddenException({ code: 'ROLE_HIERARCHY', message: 'Diese Rolle steht in der Hierarchie über deiner höchsten Rolle.' });
    }
    const member = await this.perms.getMember(serverId, targetUserId);
    if (!member) throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Mitglied nicht gefunden.' });
    await this.prisma.memberRole.upsert({
      where: { memberId_roleId: { memberId: member.id, roleId } },
      create: { memberId: member.id, roleId },
      update: {},
    });
    await this.audit.log({ actorId: userId, action: 'MEMBER_ROLE_ADD', serverId, targetType: 'USER', targetId: targetUserId });
    return { assigned: true };
  }

  async removeRole(serverId: string, targetUserId: string, roleId: string, userId: string): Promise<{ removed: boolean }> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_ROLES);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.serverId !== serverId) throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Rolle nicht gefunden.' });
    if (!this.perms.canActOnRole(ctx, role)) {
      throw new ForbiddenException({ code: 'ROLE_HIERARCHY', message: 'Diese Rolle steht in der Hierarchie über deiner höchsten Rolle.' });
    }
    const member = await this.perms.getMember(serverId, targetUserId);
    if (!member) throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Mitglied nicht gefunden.' });
    await this.prisma.memberRole.deleteMany({ where: { memberId: member.id, roleId } });
    await this.audit.log({ actorId: userId, action: 'MEMBER_ROLE_REMOVE', serverId, targetType: 'USER', targetId: targetUserId });
    return { removed: true };
  }

  // ─── Mitglieder ─────────────────────────────────────────────────────────

  async listMembers(serverId: string, userId: string): Promise<any[]> {
    await this.perms.serverContext(serverId, userId);
    const members = await this.prisma.member.findMany({
      where: { serverId },
      include: { user: { include: { badges: { select: { badgeKey: true } } } }, roles: { include: { role: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    const presence = await this.redis.getPresence(members.map((m: any) => m.userId));
    return members.map((m: any) => memberDto(m, presence[m.userId]));
  }

  async updateNickname(serverId: string, targetUserId: string, userId: string, nickname: string | null): Promise<any> {
    const { ctx } = await this.perms.serverContext(serverId, userId);
    if (targetUserId === userId) {
      this.perms.require(ctx.basePermissions, PERMISSIONS.CHANGE_NICKNAME, 'MISSING_PERMISSION', 'Du darfst deinen Spitznamen nicht ändern.');
    } else {
      this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_NICKNAMES, 'MISSING_PERMISSION', 'Du darfst keine Spitznamen verwalten.');
    }
    const member = await this.perms.getMember(serverId, targetUserId);
    if (!member) throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Mitglied nicht gefunden.' });
    const updated = await this.prisma.member.update({
      where: { id: member.id },
      data: { nickname: nickname || null },
      include: { user: { include: { badges: { select: { badgeKey: true } } } }, roles: { include: { role: true } } },
    });
    const presence = await this.redis.getPresence([targetUserId]);
    return memberDto(updated, presence[targetUserId]);
  }
}
