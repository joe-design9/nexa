import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RolesService } from './roles.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { createRoleSchema, updateRoleSchema } from '@nexa/shared';

@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('servers/:id/roles')
  list(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.roles.listRoles(id, user.id);
  }

  @Post('servers/:id/roles')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createRoleSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.roles.createRole(id, user.id, dto);
  }

  @Post('servers/:id/roles/reorder')
  reorder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { orderedIds: string[] }): Promise<unknown> {
    return this.roles.reorderRoles(id, user.id, body.orderedIds ?? []);
  }

  @Patch('servers/:id/roles/:roleId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.roles.updateRole(id, roleId, user.id, dto);
  }

  @Delete('servers/:id/roles/:roleId')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('roleId') roleId: string): Promise<unknown> {
    return this.roles.deleteRole(id, roleId, user.id);
  }

  @Post('servers/:id/members/:userId/roles/:roleId')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Param('roleId') roleId: string,
  ): Promise<unknown> {
    return this.roles.assignRole(id, targetUserId, roleId, user.id);
  }

  @Delete('servers/:id/members/:userId/roles/:roleId')
  unassign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Param('roleId') roleId: string,
  ): Promise<unknown> {
    return this.roles.removeRole(id, targetUserId, roleId, user.id);
  }

  @Get('servers/:id/members')
  members(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.roles.listMembers(id, user.id);
  }

  @Patch('servers/:id/members/:userId')
  nickname(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body() body: { nickname?: string | null },
  ): Promise<unknown> {
    return this.roles.updateNickname(id, targetUserId, user.id, body.nickname ?? null);
  }
}
