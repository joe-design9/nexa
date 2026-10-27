import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AdminGuard } from '../common/admin.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { reportSchema } from '@nexa/shared';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('reports')
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(reportSchema)) dto: Record<string, unknown>): Promise<unknown> {
    return this.reports.create(user.id, dto);
  }
}

@UseGuards(AdminGuard)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(@Query('status') status?: string): Promise<unknown> {
    return this.reports.list(status);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>): Promise<unknown> {
    return this.reports.update(user.id, id, body);
  }
}
