import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('unreadOnly') unreadOnly?: string): Promise<unknown> {
    return this.notifications.list(user.id, unreadOnly === 'true');
  }

  @Post('read-all')
  readAll(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.notifications.markRead(user.id, id);
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.notifications.getPreferences(user.id);
  }

  @Put('preferences')
  putPreference(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>): Promise<unknown> {
    return this.notifications.putPreference(user.id, body);
  }
}
