import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { createCategorySchema, createChannelSchema, updateChannelSchema } from '@nexa/shared';

@Controller()
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  // Kategorien
  @Post('servers/:id/categories')
  createCategory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createCategorySchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.channels.createCategory(id, user.id, dto);
  }

  @Patch('servers/:id/categories/:categoryId')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('categoryId') categoryId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.channels.updateCategory(id, categoryId, user.id, body);
  }

  @Delete('servers/:id/categories/:categoryId')
  deleteCategory(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('categoryId') categoryId: string): Promise<unknown> {
    return this.channels.deleteCategory(id, categoryId, user.id);
  }

  // Kanäle
  @Post('servers/:id/channels')
  createChannel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createChannelSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.channels.createChannel(id, user.id, dto);
  }

  @Get('servers/:id/channels')
  list(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.channels.listChannels(id, user.id);
  }

  @Post('channels/reorder')
  reorder(@CurrentUser() user: AuthUser, @Body() body: { items: { id: string; position: number; categoryId?: string | null }[] }): Promise<unknown> {
    return this.channels.reorder(user.id, body.items ?? []);
  }

  @Patch('channels/:id')
  updateChannel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateChannelSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.channels.updateChannel(id, user.id, dto);
  }

  @Delete('channels/:id')
  deleteChannel(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.channels.deleteChannel(id, user.id);
  }

  // Overrides
  @Get('channels/:id/overrides')
  getOverrides(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.channels.getOverrides(id, user.id);
  }

  @Put('channels/:id/overrides')
  putOverrides(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { overrides: unknown[] }): Promise<unknown> {
    return this.channels.putOverrides(id, user.id, body.overrides ?? []);
  }

  // Threads
  @Post('channels/:id/threads')
  createThread(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>): Promise<unknown> {
    return this.channels.createThread(id, user.id, body);
  }

  @Get('channels/:id/threads')
  listThreads(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.channels.listThreads(id, user.id);
  }

  @Post('channels/threads/:id/archive')
  archiveThread(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.channels.archiveThread(id, user.id);
  }
}
