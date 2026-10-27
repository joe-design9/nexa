import { Module } from '@nestjs/common';
import { NexaGateway } from './gateway';
import { FriendsModule } from '../friends/friends.module';

@Module({
  imports: [FriendsModule],
  providers: [NexaGateway],
})
export class GatewayModule {}
