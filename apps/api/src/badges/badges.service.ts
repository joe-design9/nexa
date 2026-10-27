import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { BADGE_CATALOG, badgeDefinition, isBadgeKey } from '@nexa/shared';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Serialisierte Ansicht einer Abzeichen-Vergabe (für Profil + Admin-UI). */
export function userBadgeDto(r: any): Record<string, unknown> {
  const def = badgeDefinition(String(r.badgeKey));
  return {
    key: r.badgeKey,
    icon: def?.icon ?? '🏅',
    category: def?.category ?? 'STATUS',
    grantedAt: r.grantedAt,
    grantedBy: r.grantedBy ? { id: r.grantedBy.id, username: r.grantedBy.username } : null,
  };
}

/**
 * Abzeichen-System: Katalog kommt aus @nexa/shared (code-definiert),
 * die Vergaben liegen als `UserBadge`-Zeilen in der DB.
 *
 * Vergabe/Entzug laufen ausschließlich über Plattform-Admins
 * (Admin-Endpunkte, AdminGuard) und werden im Plattform-Audit-Log
 * festgehalten. Einzige Ausnahmen ohne Admin: die Auto-Hooks
 * EARLY_ADOPTER (Registrierung, erste 100 Konten) und SERVER_FOUNDER
 * (erster eigener Server) in Auth-/Servers-Service sowie die
 * Seed-Vergaben – diese Zeilen haben grantedById = NULL.
 */
@Injectable()
export class BadgesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Der komplette Abzeichen-Katalog (Schlüssel, Icon, Kategorie). */
  catalog(): Record<string, unknown>[] {
    return BADGE_CATALOG.map((b) => ({ key: b.key, icon: b.icon, category: b.category }));
  }

  /** Alle Vergaben eines Nutzers, älteste zuerst. */
  async listForUser(userId: string): Promise<Record<string, unknown>[]> {
    const rows = await this.prisma.userBadge.findMany({
      where: { userId },
      include: { grantedBy: { select: { id: true, username: true } } },
      orderBy: { grantedAt: 'asc' },
    });
    return rows.map((r: any) => userBadgeDto(r));
  }

  /** Nur die Schlüssel der Abzeichen eines Nutzers (kompakte Anzeige). */
  async keysOf(userId: string): Promise<string[]> {
    const rows = await this.prisma.userBadge.findMany({
      where: { userId },
      select: { badgeKey: true },
      orderBy: { grantedAt: 'asc' },
    });
    return rows.map((r: any) => r.badgeKey as string);
  }

  /**
   * Abzeichen vergeben (nur Plattform-Admins, Endpunkt per AdminGuard).
   * Idempotent: Hat der Nutzer das Abzeichen schon, passiert nichts
   * weiter (kein zweiter Audit-Eintrag) und `alreadyGranted` ist true.
   */
  async grant(adminId: string, userId: string, badgeKey: string): Promise<Record<string, unknown>> {
    if (!isBadgeKey(badgeKey)) {
      throw new BadRequestException({ code: 'BADGE_UNKNOWN', message: 'Unbekanntes Abzeichen.' });
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Nutzer nicht gefunden.' });
    }
    const existing = await this.prisma.userBadge.findUnique({
      where: { userId_badgeKey: { userId, badgeKey } },
    });
    if (existing) {
      return { granted: false, alreadyGranted: true, badges: await this.listForUser(userId) };
    }
    await this.prisma.userBadge.create({ data: { userId, badgeKey, grantedById: adminId } });
    await this.audit.log({
      actorId: adminId,
      action: 'PLATFORM_BADGE_GRANT',
      targetType: 'USER',
      targetId: userId,
      changes: { badgeKey },
    });
    return { granted: true, alreadyGranted: false, badges: await this.listForUser(userId) };
  }

  /** Abzeichen wieder entfernen (nur Plattform-Admins, audit-geloggt). */
  async revoke(adminId: string, userId: string, badgeKey: string): Promise<Record<string, unknown>> {
    if (!isBadgeKey(badgeKey)) {
      throw new BadRequestException({ code: 'BADGE_UNKNOWN', message: 'Unbekanntes Abzeichen.' });
    }
    const existing = await this.prisma.userBadge.findUnique({
      where: { userId_badgeKey: { userId, badgeKey } },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'BADGE_NOT_HELD', message: 'Der Nutzer besitzt dieses Abzeichen nicht.' });
    }
    await this.prisma.userBadge.delete({ where: { id: existing.id } });
    await this.audit.log({
      actorId: adminId,
      action: 'PLATFORM_BADGE_REVOKE',
      targetType: 'USER',
      targetId: userId,
      changes: { badgeKey },
    });
    return { revoked: true, badges: await this.listForUser(userId) };
  }
}
