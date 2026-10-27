import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';

@Controller()
export class ModerationController {
  constructor(private readonly mod: ModerationService) {}

  @Post('servers/:id/members/:userId/kick')
  kick(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') target: string, @Body() body: { reason?: string }): Promise<unknown> {
    return this.mod.kick(id, user.id, target, body?.reason);
  }

  @Post('servers/:id/members/:userId/ban')
  ban(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') target: string,
    @Body() body: { reason?: string; deleteMessageDays?: number; expiresInMinutes?: number },
  ): Promise<unknown> {
    return this.mod.ban(id, user.id, target, body ?? {});
  }

  @Delete('servers/:id/members/:userId/ban')
  unban(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') target: string): Promise<unknown> {
    return this.mod.unban(id, user.id, target);
  }

  @Get('servers/:id/bans')
  bans(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.mod.listBans(id, user.id);
  }

  @Post('servers/:id/members/:userId/timeout')
  timeout(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') target: string,
    @Body() body: { minutes: number; reason?: string },
  ): Promise<unknown> {
    return this.mod.timeout(id, user.id, target, Number(body.minutes), body.reason);
  }

  @Delete('servers/:id/members/:userId/timeout')
  removeTimeout(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') target: string): Promise<unknown> {
    return this.mod.removeTimeout(id, user.id, target);
  }

  @Post('channels/:id/purge')
  purge(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { amount: number; userId?: string }): Promise<unknown> {
    return this.mod.purge(user.id, id, Number(body.amount), body.userId);
  }

  @Get('servers/:id/audit-logs')
  auditLogs(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
  ): Promise<unknown> {
    return this.mod.auditLogs(id, user.id, { action, actorId });
  }
}
