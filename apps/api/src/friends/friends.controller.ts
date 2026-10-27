import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { friendRequestSchema } from '@nexa/shared';

@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('tab') tab?: string): Promise<unknown> {
    return this.friends.list(user.id, tab ?? 'all');
  }

  @Post('request')
  request(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(friendRequestSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.friends.request(user.id, String(dto.username ?? dto.userId ?? ''));
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.friends.accept(user.id, id);
  }

  @Post(':id/decline')
  decline(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.friends.decline(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.friends.remove(user.id, id);
  }

  @Post('block')
  block(@CurrentUser() user: AuthUser, @Body() body: { userId: string }): Promise<unknown> {
    return this.friends.block(user.id, body.userId);
  }

  @Post('unblock')
  unblock(@CurrentUser() user: AuthUser, @Body() body: { userId: string }): Promise<unknown> {
    return this.friends.unblock(user.id, body.userId);
  }
}
