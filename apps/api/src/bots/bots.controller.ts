import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { BotsService } from './bots.service';
import { WebhooksService } from './webhooks.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Public } from '../common/public.decorator';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { createBotSchema, createWebhookSchema } from '@nexa/shared';

@Controller('developers/bots')
export class BotsController {
  constructor(private readonly bots: BotsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createBotSchema)) dto: Record<string, unknown>): Promise<unknown> {
    return this.bots.createBot(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.bots.listBots(user.id);
  }

  @Post(':id/regenerate-token')
  regenerate(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.bots.regenerateToken(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.bots.deleteBot(user.id, id);
  }

  @Post(':id/join')
  join(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { inviteCode: string }): Promise<unknown> {
    return this.bots.joinViaInvite(user.id, id, body.inviteCode);
  }

  @Post(':id/commands')
  registerCommand(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>): Promise<unknown> {
    return this.bots.registerCommand(user.id, id, body);
  }

  @Delete(':id/commands/:serverId/:name')
  deleteCommand(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('serverId') serverId: string,
    @Param('name') name: string,
  ): Promise<unknown> {
    return this.bots.deleteCommand(user.id, id, serverId, name);
  }
}

@Controller('servers/:serverId/commands')
export class ServerCommandsController {
  constructor(private readonly bots: BotsService) {}

  @Get()
  list(@Param('serverId') serverId: string): Promise<unknown> {
    return this.bots.listCommands(serverId);
  }
}

@Controller()
export class BotServerAddController {
  constructor(private readonly bots: BotsService) {}

  @Post('servers/:id/bots')
  add(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { botUserId: string }): Promise<unknown> {
    return this.bots.addBotToServer(user.id, id, body.botUserId);
  }
}

@Controller()
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('channels/:id/webhooks')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createWebhookSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.webhooks.createWebhook(user.id, id, dto);
  }

  @Get('channels/:id/webhooks')
  list(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.webhooks.listWebhooks(user.id, id);
  }

  @Delete('webhooks/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.webhooks.deleteWebhook(user.id, id);
  }

  @Post('webhooks/:id/subscriptions')
  createSub(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>): Promise<unknown> {
    return this.webhooks.createSubscription(user.id, id, body);
  }

  @Get('webhooks/:id/subscriptions')
  listSubs(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.webhooks.listSubscriptions(user.id, id);
  }

  @Delete('webhooks/:id/subscriptions/:subId')
  deleteSub(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('subId') subId: string): Promise<unknown> {
    return this.webhooks.deleteSubscription(user.id, id, subId);
  }

  @Public()
  @Post('webhooks/:id/:token')
  execute(@Param('id') id: string, @Param('token') token: string, @Body() body: Record<string, unknown>): Promise<unknown> {
    return this.webhooks.execute(id, token, body);
  }
}
