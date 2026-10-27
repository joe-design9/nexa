import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { UsersService } from './users.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { updateProfileSchema, changePasswordSchema } from '@nexa/shared';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.users.getMe(user.id);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.users.updateMe(user.id, dto);
  }

  @Patch('me/status')
  updateStatus(@CurrentUser() user: AuthUser, @Body() body: { status: string }): Promise<unknown> {
    return this.users.updateStatus(user.id, body.status);
  }

  @Patch('me/privacy')
  updatePrivacy(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>): Promise<unknown> {
    return this.users.updatePrivacy(user.id, body);
  }

  @Get('me/export')
  async exportData(@CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    const data = await this.users.exportData(user.id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="nexa-export.json"');
    res.send(JSON.stringify(data, null, 2));
  }

  @Delete('me')
  deleteMe(
    @CurrentUser() user: AuthUser,
    @Body() body: { password?: string },
    @Query('force') force?: string,
  ): Promise<unknown> {
    return this.users.deleteMe(user.id, body?.password, force === 'true');
  }

  @Post('me/change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.users.changePassword(user.id, String(dto.currentPassword ?? ''), String(dto.newPassword ?? dto.password ?? ''));
  }

  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query('q') q: string): Promise<unknown> {
    return this.users.search(q ?? '', user.id);
  }

  @Get(':id')
  profile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('serverId') serverId?: string,
  ): Promise<unknown> {
    return this.users.getProfile(id, user.id, serverId);
  }
}
