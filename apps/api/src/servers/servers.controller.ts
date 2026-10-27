import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Public } from '../common/public.decorator';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { createServerSchema, updateServerSchema, updateServerSettingsSchema, createInviteSchema, setServerFavoriteSchema } from '@nexa/shared';

@Controller()
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Post('servers')
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createServerSchema)) dto: Record<string, unknown>): Promise<unknown> {
    return this.servers.createServer(user.id, dto);
  }

  @Get('servers/my')
  my(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.servers.myServers(user.id);
  }

  @Get('servers/discover')
  discover(@Query('category') category?: string, @Query('q') q?: string): Promise<unknown> {
    return this.servers.discover(category, q);
  }

  @Get('servers/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.servers.getServer(id, user.id);
  }

  @Patch('servers/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateServerSettingsSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.servers.updateServer(id, user.id, dto);
  }

  @Patch('servers/:id/basic')
  updateBasic(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateServerSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.servers.updateServer(id, user.id, dto);
  }

  @Delete('servers/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.servers.deleteServer(id, user.id);
  }

  @Post('servers/:id/leave')
  leave(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.servers.leaveServer(id, user.id);
  }

  @Put('servers/:id/favorite')
  setFavorite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setServerFavoriteSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.servers.setFavorite(id, user.id, dto.favorite === true);
  }

  @Post('servers/:id/transfer')
  transfer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { userId: string }): Promise<unknown> {
    return this.servers.transferOwnership(id, user.id, body.userId);
  }

  @Post('servers/:id/accept-rules')
  acceptRules(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.servers.acceptRules(id, user.id);
  }

  @Post('servers/:id/verify-button')
  verifyButton(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.servers.verifyButton(id, user.id);
  }

  @Post('servers/:id/join')
  join(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.servers.joinPublic(id, user.id);
  }

  @Post('servers/:id/invites')
  createInvite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createInviteSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.servers.createInvite(id, user.id, dto);
  }

  @Get('servers/:id/invites')
  listInvites(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.servers.listInvites(id, user.id);
  }

  @Public()
  @Get('invites/:code')
  preview(@Param('code') code: string): Promise<unknown> {
    return this.servers.invitePreview(code);
  }

  @Post('invites/:code/accept')
  accept(@CurrentUser() user: AuthUser, @Param('code') code: string): Promise<unknown> {
    return this.servers.acceptInvite(code, user.id);
  }

  @Delete('invites/:code')
  deleteInvite(@CurrentUser() user: AuthUser, @Param('code') code: string): Promise<unknown> {
    return this.servers.deleteInvite(code, user.id);
  }
}
