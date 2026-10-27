import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from '../common/admin.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createPlatformInvitesSchema } from '@nexa/shared';

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats(): Promise<unknown> {
    return this.admin.stats();
  }

  @Get('users')
  users(@Query('q') q?: string): Promise<unknown> {
    return this.admin.listUsers(q);
  }

  @Post('users/:id/ban')
  ban(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { reason?: string }): Promise<unknown> {
    return this.admin.banUser(user.id, id, body?.reason);
  }

  @Post('users/:id/unban')
  unban(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.admin.unbanUser(user.id, id);
  }

  @Post('users/:id/verify')
  verify(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { verified: boolean }): Promise<unknown> {
    return this.admin.setVerified(user.id, id, Boolean(body.verified));
  }

  @Get('servers')
  servers(): Promise<unknown> {
    return this.admin.listServers();
  }

  @Delete('servers/:id')
  deleteServer(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.admin.deleteServer(user.id, id);
  }

  @Get('audit')
  audit(): Promise<unknown> {
    return this.admin.platformAudit();
  }

  // ─── Plattform-Invite-Codes (Registrierungs-Gate, nur Admins) ─────────

  @Get('platform-invites')
  platformInvites(): Promise<unknown> {
    return this.admin.listPlatformInvites();
  }

  @Post('platform-invites')
  createPlatformInvites(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPlatformInvitesSchema)) dto: { count?: number; maxUses?: number; expiresAt?: Date },
  ): Promise<unknown> {
    return this.admin.createPlatformInvites(user.id, dto ?? {});
  }

  @Post('platform-invites/:id/revoke')
  revokePlatformInvite(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.admin.revokePlatformInvite(user.id, id);
  }
}
