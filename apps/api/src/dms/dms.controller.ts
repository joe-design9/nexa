import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { DmsService } from './dms.service';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';

@Controller('dms')
export class DmsController {
  constructor(private readonly dms: DmsService) {}

  @Post()
  open(@CurrentUser() user: AuthUser, @Body() body: { userId: string }): Promise<unknown> {
    return this.dms.openDm(user.id, body.userId);
  }

  @Post('group')
  group(@CurrentUser() user: AuthUser, @Body() body: { userIds: string[]; name?: string }): Promise<unknown> {
    return this.dms.createGroup(user.id, body.userIds ?? [], body.name);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.dms.listDms(user.id);
  }

  @Post(':id/participants')
  add(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { userId: string }): Promise<unknown> {
    return this.dms.addParticipant(user.id, id, body.userId);
  }

  @Delete(':id/participants/:userId')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') targetUserId: string): Promise<unknown> {
    return this.dms.removeParticipant(user.id, id, targetUserId);
  }
}
