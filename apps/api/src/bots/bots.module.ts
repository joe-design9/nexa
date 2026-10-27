import { Module } from '@nestjs/common';
import { BotsService } from './bots.service';
import { WebhooksService } from './webhooks.service';
import { BotsController, WebhooksController, BotServerAddController, ServerCommandsController } from './bots.controller';
import { ServersModule } from '../servers/servers.module';

@Module({
  imports: [ServersModule],
  controllers: [BotsController, WebhooksController, BotServerAddController, ServerCommandsController],
  providers: [BotsService, WebhooksService],
  exports: [BotsService, WebhooksService],
})
export class BotsModule {}
