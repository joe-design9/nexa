import { Module } from '@nestjs/common';
import { BadgesService } from './badges.service';
import { AdminBadgesController } from './admin-badges.controller';

/** Abzeichen-System: Service + Admin-Endpunkte. Prisma/Audit kommen aus
 *  dem globalen CommonModule; der Rollenschutz aus dem AdminGuard. */
@Module({
  controllers: [AdminBadgesController],
  providers: [BadgesService],
  exports: [BadgesService],
})
export class BadgesModule {}
