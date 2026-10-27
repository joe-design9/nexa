import { Body, Controller, Param, Post } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Post('token')
  token(@CurrentUser() user: AuthUser, @Body() body: { channelId: string }): Promise<unknown> {
    return this.voice.createToken(user.id, body.channelId);
  }

  @Post('call/:channelId/ring')
  ring(@CurrentUser() user: AuthUser, @Param('channelId') channelId: string): Promise<unknown> {
    return this.voice.ringCall(user.id, channelId);
  }
}
