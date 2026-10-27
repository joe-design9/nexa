import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from './redis.service';
import { MailService } from './mail.service';
import { CaptchaService } from './captcha.service';
import { StorageService } from './storage.service';
import { AuditService } from './audit.service';
import { AuthGuard } from './auth.guard';
import { PermissionsService } from './permissions.service';

/** Globale Basis-Services (DB, Redis, Mail, Captcha, Storage, Audit, Guard). */
@Global()
@Module({
  providers: [
    PrismaService,
    RedisService,
    MailService,
    CaptchaService,
    StorageService,
    AuditService,
    AuthGuard,
    PermissionsService,
  ],
  exports: [
    PrismaService,
    RedisService,
    MailService,
    CaptchaService,
    StorageService,
    AuditService,
    AuthGuard,
    PermissionsService,
  ],
})
export class CommonModule {}
