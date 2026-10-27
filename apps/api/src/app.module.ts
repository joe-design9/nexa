import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CommonModule } from './common/common.module';
import { AuthGuard } from './common/auth.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ServersModule } from './servers/servers.module';
import { RolesModule } from './roles/roles.module';
import { ChannelsModule } from './channels/channels.module';
import { UploadsModule } from './uploads/uploads.module';
import { MessagesModule } from './messages/messages.module';
import { FriendsModule } from './friends/friends.module';
import { DmsModule } from './dms/dms.module';
import { VoiceModule } from './voice/voice.module';
import { ModerationModule } from './moderation/moderation.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { BadgesModule } from './badges/badges.module';
import { BotsModule } from './bots/bots.module';
import { NotificationsModule } from './notifications/notifications.module';
import { GatewayModule } from './gateway/gateway.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    CommonModule,
    AuthModule,
    UsersModule,
    ServersModule,
    RolesModule,
    ChannelsModule,
    UploadsModule,
    MessagesModule,
    FriendsModule,
    DmsModule,
    VoiceModule,
    ModerationModule,
    ReportsModule,
    AdminModule,
    BadgesModule,
    BotsModule,
    NotificationsModule,
    GatewayModule,
  ],
  providers: [
    // Globaler Auth-Guard (öffentliche Routen per @Public()).
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
})
export class AppModule {}
