import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { sendMessageSchema, editMessageSchema } from '@nexa/shared';

@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('channels/:id/messages')
  list(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ): Promise<unknown> {
    return this.messages.listMessages(user.id, id, { before, limit: limit ? Number(limit) : undefined });
  }

  @Post('channels/:id/messages')
  send(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.messages.sendMessage(user.id, id, dto);
  }

  @Get('channels/:id/messages/search')
  search(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('has') has?: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
  ): Promise<unknown> {
    return this.messages.searchMessages(user.id, id, { q, from, has, before, after });
  }

  @Get('channels/:id/pins')
  pins(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.messages.listPins(user.id, id);
  }

  @Post('channels/:id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { messageId?: string }): Promise<unknown> {
    return this.messages.markRead(user.id, id, body?.messageId);
  }

  @Get('users/me/read-states')
  readStates(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.messages.readStates(user.id);
  }

  @Patch('messages/:id')
  edit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(editMessageSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.messages.editMessage(user.id, id, dto);
  }

  @Delete('messages/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.messages.deleteMessage(user.id, id);
  }

  @Post('messages/:id/pin')
  pin(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.messages.pinMessage(user.id, id, true);
  }

  @Delete('messages/:id/pin')
  unpin(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.messages.pinMessage(user.id, id, false);
  }

  @Post('messages/:id/forward')
  forward(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { targetChannelId: string }): Promise<unknown> {
    return this.messages.forwardMessage(user.id, id, body.targetChannelId);
  }

  @Put('messages/:id/reactions/:emoji')
  addReaction(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('emoji') emoji: string): Promise<unknown> {
    return this.messages.addReaction(user.id, id, emoji);
  }

  @Delete('messages/:id/reactions/:emoji')
  removeReaction(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('emoji') emoji: string): Promise<unknown> {
    return this.messages.removeReaction(user.id, id, emoji);
  }
}
