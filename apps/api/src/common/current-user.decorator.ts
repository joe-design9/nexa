import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  username: string;
  isBot: boolean;
  botAccountId?: string;
}

/** Liefert den vom AuthGuard gesetzten Nutzer (oder ein Feld davon). */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | unknown => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return data ? req.user?.[data] : req.user;
  },
);
