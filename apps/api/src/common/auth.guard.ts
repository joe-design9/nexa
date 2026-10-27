import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AuthUser } from './current-user.decorator';

export interface AccessTokenPayload {
  sub: string;
  username: string;
  isBot: boolean;
}

/**
 * Authentifizierung:
 *  - `Authorization: Bearer <Access-JWT>` (15 min, JWT_ACCESS_SECRET)
 *  - `Authorization: Bot <botUserId>.<Token>` für Bot-Konten
 * Plattform-gesperrte Nutzer werden abgelehnt.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();
    const header = req.headers.authorization;
    if (!header) {
      if (isPublic) return true;
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Nicht angemeldet.' });
    }
    const user = await this.authenticateHeader(header);
    if (user) req.user = user;
    if (!user && !isPublic) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Sitzung ungültig oder abgelaufen.' });
    }
    return true;
  }

  /** Header → AuthUser oder null. Wird auch vom Gateway genutzt. */
  async authenticateHeader(header: string): Promise<AuthUser | null> {
    if (header.startsWith('Bot ')) {
      return this.authenticateBotToken(header.slice(4).trim());
    }
    if (header.startsWith('Bearer ')) {
      return this.authenticateAccessToken(header.slice(7).trim());
    }
    return null;
  }

  async authenticateAccessToken(token: string): Promise<AuthUser | null> {
    try {
      const payload = jwt.verify(token, this.accessSecret()) as AccessTokenPayload & { scope?: string };
      if (payload.scope) return null; // z. B. 2FA-Zwischentoken ist kein Zugangstoken
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, isBot: true, isPlatformBanned: true },
      });
      if (!user) return null;
      if (user.isPlatformBanned) {
        throw new ForbiddenException({ code: 'PLATFORM_BANNED', message: 'Dieses Konto wurde von Nexa gesperrt.' });
      }
      return { id: user.id, username: user.username, isBot: user.isBot };
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      return null;
    }
  }

  /** Bot-Token-Format: `<botUserId>.<48 Hex-Zeichen>`, Hash per bcrypt geprüft. */
  async authenticateBotToken(token: string): Promise<AuthUser | null> {
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    const botUserId = token.slice(0, dot);
    const account = await this.prisma.botAccount.findUnique({ where: { botUserId } });
    if (!account) return null;
    const ok = await bcrypt.compare(token, account.tokenHash);
    if (!ok) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: botUserId },
      select: { id: true, username: true, isPlatformBanned: true },
    });
    if (!user || user.isPlatformBanned) return null;
    await this.prisma.botAccount.update({ where: { id: account.id }, data: { lastUsedAt: new Date() } });
    return { id: user.id, username: user.username, isBot: true, botAccountId: account.id };
  }

  private accessSecret(): string {
    return process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me';
  }
}
