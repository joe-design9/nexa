import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { BadgesService } from './badges.service';
import { AdminGuard } from '../common/admin.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { grantBadgeSchema } from '@nexa/shared';

/**
 * Admin-Endpunkte für das Abzeichen-System. Wie die Invite-Verwaltung
 * serverseitig per AdminGuard geschützt – die zugehörige UI erscheint
 * zusätzlich nur in der Admin-Desktop-Version.
 */
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminBadgesController {
  constructor(private readonly badges: BadgesService) {}

  /** Gesamter Abzeichen-Katalog (für die Auswahl in der Admin-UI). */
  @Get('badges')
  catalog(): Record<string, unknown>[] {
    return this.badges.catalog();
  }

  /** Aktuelle Abzeichen eines Nutzers. */
  @Get('users/:id/badges')
  userBadges(@Param('id') id: string): Promise<Record<string, unknown>[]> {
    return this.badges.listForUser(id);
  }

  /** Abzeichen vergeben. */
  @Post('users/:id/badges')
  grant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(grantBadgeSchema)) dto: { badgeKey: string },
  ): Promise<Record<string, unknown>> {
    return this.badges.grant(user.id, id, dto.badgeKey);
  }

  /** Abzeichen entfernen. */
  @Delete('users/:id/badges/:badgeKey')
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('badgeKey') badgeKey: string,
  ): Promise<Record<string, unknown>> {
    return this.badges.revoke(user.id, id, badgeKey);
  }
}
