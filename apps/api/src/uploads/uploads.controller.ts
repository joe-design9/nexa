import { Body, Controller, Post } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('presign')
  presign(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>): Promise<unknown> {
    return this.uploads.presign(user.id, body);
  }
}
