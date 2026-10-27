import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OAuthController } from './oauth.controller';

@Module({
  controllers: [AuthController, OAuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
