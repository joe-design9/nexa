import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './current-user.decorator';

/** Nur Plattform-Admins (User.isPlatformAdmin). Läuft nach dem AuthGuard. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!req.user) throw new ForbiddenException({ code: 'ADMIN_ONLY', message: 'Nur für Plattform-Admins.' });
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { isPlatformAdmin: true },
    });
    if (!user?.isPlatformAdmin) {
      throw new ForbiddenException({ code: 'ADMIN_ONLY', message: 'Nur für Plattform-Admins.' });
    }
    return true;
  }
}
