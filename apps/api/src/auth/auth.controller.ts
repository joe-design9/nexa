import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, type SessionMeta } from './auth.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Public } from '../common/public.decorator';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { registerSchema, loginSchema } from '@nexa/shared';

export const REFRESH_COOKIE = 'nexa_refresh';

export function setRefreshCookie(res: Response, value: string, maxAgeMs: number): void {
  res.cookie(REFRESH_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/auth',
    maxAge: maxAgeMs,
    secure: process.env.NODE_ENV === 'production',
  });
}

export function readMeta(req: Request): SessionMeta {
  return {
    ipAddress: (req.ip || req.socket.remoteAddress || undefined) as string | undefined,
    userAgent: req.headers['user-agent'],
    deviceName: (req.body?.deviceName as string | undefined) ?? undefined,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: Record<string, unknown>,
  ): Promise<unknown> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: Record<string, unknown>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const result = await this.auth.login(dto, readMeta(req));
    if (result.accessToken) {
      setRefreshCookie(res, result.refreshCookieValue, result.refreshMaxAgeMs);
      return { accessToken: result.accessToken, user: result.user };
    }
    return result; // { requiresTwoFactor, twoFactorToken }
  }

  @Public()
  @Post('login/2fa')
  async loginTwoFactor(
    @Body() body: { twoFactorToken: string; code: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const issued = await this.auth.loginTwoFactor(body.twoFactorToken, String(body.code ?? ''), readMeta(req));
    setRefreshCookie(res, issued.refreshCookieValue, issued.refreshMaxAgeMs);
    return { accessToken: issued.accessToken, user: issued.user };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<unknown> {
    const cookie = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? undefined;
    const issued = await this.auth.refresh(cookie, readMeta(req));
    setRefreshCookie(res, issued.refreshCookieValue, issued.refreshMaxAgeMs);
    return { accessToken: issued.accessToken, user: issued.user };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ loggedOut: boolean }> {
    const cookie = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? undefined;
    await this.auth.logout(cookie);
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
    return { loggedOut: true };
  }

  @Get('sessions')
  async sessions(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.auth.listSessions(user.id);
  }

  @Delete('sessions/:id')
  async revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ revoked: boolean }> {
    await this.auth.revokeSession(user.id, id);
    return { revoked: true };
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string): Promise<unknown> {
    return this.auth.verifyEmail(token);
  }

  @Post('resend-verification')
  async resend(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.auth.resendVerification(user.id);
  }

  @Public()
  @Post('forgot-password')
  async forgot(@Body() body: { email: string }): Promise<unknown> {
    return this.auth.forgotPassword(body.email);
  }

  @Public()
  @Post('reset-password')
  async reset(@Body() body: { token: string; password: string }): Promise<unknown> {
    return this.auth.resetPassword(body.token, body.password);
  }

  @Post('2fa/setup')
  async setup2fa(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.auth.setupTwoFactor(user.id);
  }

  @Post('2fa/enable')
  async enable2fa(@CurrentUser() user: AuthUser, @Body() body: { code: string }): Promise<unknown> {
    return this.auth.enableTwoFactor(user.id, String(body.code ?? ''));
  }

  @Post('2fa/disable')
  async disable2fa(@CurrentUser() user: AuthUser, @Body() body: { code?: string; backupCode?: string }): Promise<unknown> {
    return this.auth.disableTwoFactor(user.id, String(body.code ?? body.backupCode ?? ''));
  }
}
