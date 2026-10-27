import { Controller, Get, Post, Query, Req, Res, Body } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify } from 'jose';
import { readFileSync } from 'fs';
import { AuthService } from './auth.service';
import { setRefreshCookie, readMeta } from './auth.controller';
import { Public } from '../common/public.decorator';

const STATE_COOKIE = 'nexa_oauth_state';
const INVITE_COOKIE = 'nexa_oauth_invite';

/**
 * Echte OAuth-Flows (Google OIDC, Apple Sign in).
 * Ohne konfigurierte Client-Daten: Redirect auf die Login-Seite mit
 * oauthError=not_configured (kein Fake-Login).
 *
 * Plattform-Invite-Gate: Wer sich per OAuth NEU registriert, braucht wie
 * bei der E-Mail-Registrierung einen Invite-Code. Der Code wird beim
 * Start als ?inviteCode= übergeben, in einem kurzlebigen httpOnly-Cookie
 * durch den Provider-Flow getragen und erst bei der Kontoanlage im
 * Callback geprüft/verbraucht. Bestehende Konten brauchen keinen Code.
 */
@Controller('auth/oauth')
export class OAuthController {
  constructor(private readonly auth: AuthService) {}

  private appUrl(): string {
    return process.env.APP_URL || 'http://localhost:3000';
  }

  private notConfigured(res: Response): void {
    res.redirect(`${this.appUrl()}/login?oauthError=not_configured`);
  }

  private setState(res: Response): string {
    const state = randomBytes(24).toString('hex');
    res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/auth' });
    return state;
  }

  private checkState(req: Request, res: Response, state: string | undefined): boolean {
    const cookieState = req.cookies?.[STATE_COOKIE] as string | undefined;
    res.clearCookie(STATE_COOKIE, { path: '/auth' });
    return Boolean(state && cookieState && state === cookieState);
  }

  private setInvite(res: Response, inviteCode: string | undefined): void {
    const code = String(inviteCode ?? '').trim();
    if (!code) return;
    res.cookie(INVITE_COOKIE, code, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/auth' });
  }

  private takeInvite(req: Request, res: Response): string | null {
    const code = (req.cookies?.[INVITE_COOKIE] as string | undefined) ?? undefined;
    res.clearCookie(INVITE_COOKIE, { path: '/auth' });
    return code ? code : null;
  }

  /** Invite-Fehler aus dem Callback als eigene Login-Fehlermeldung mappen. */
  private redirectForError(res: Response, err: unknown): void {
    const code = (err as { response?: { code?: string } } | null)?.response?.code;
    if (code === 'INVITE_REQUIRED') {
      res.redirect(`${this.appUrl()}/login?oauthError=invite_required`);
      return;
    }
    if (code === 'INVITE_INVALID') {
      res.redirect(`${this.appUrl()}/login?oauthError=invite_invalid`);
      return;
    }
    res.redirect(`${this.appUrl()}/login?oauthError=oauth_failed`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async complete(req: Request, res: Response, user: any): Promise<void> {
    const issued = await this.auth.issueSession(user, readMeta(req));
    setRefreshCookie(res, issued.refreshCookieValue, issued.refreshMaxAgeMs);
    res.redirect(`${this.appUrl()}/auth/complete#access_token=${issued.accessToken}&token_type=Bearer`);
  }

  // ─── Google ─────────────────────────────────────────────────────────────

  @Public()
  @Get('google')
  googleStart(@Query('inviteCode') inviteCode: string | undefined, @Res() res: Response): void {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return this.notConfigured(res);
    const state = this.setState(res);
    this.setInvite(res, inviteCode);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/auth/oauth/google/callback',
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  }

  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return this.notConfigured(res);
    if (!code || !this.checkState(req, res, state)) {
      res.redirect(`${this.appUrl()}/login?oauthError=invalid_state`);
      return;
    }
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/auth/oauth/google/callback',
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) throw new Error('token exchange failed');
      const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const info = (await infoRes.json()) as { sub: string; email?: string; name?: string; email_verified?: boolean };
      const user = await this.auth.resolveOAuthAccount({
        provider: 'GOOGLE',
        providerUserId: info.sub,
        email: info.email ?? null,
        displayName: info.name ?? null,
        platformInviteCode: this.takeInvite(req, res),
      });
      await this.complete(req, res, user);
    } catch (err) {
      this.redirectForError(res, err);
    }
  }

  // ─── Apple ──────────────────────────────────────────────────────────────

  private appleConfigured(): boolean {
    return Boolean(
      process.env.APPLE_CLIENT_ID &&
        process.env.APPLE_TEAM_ID &&
        process.env.APPLE_KEY_ID &&
        (process.env.APPLE_PRIVATE_KEY || process.env.APPLE_PRIVATE_KEY_PATH),
    );
  }

  @Public()
  @Get('apple')
  appleStart(@Query('inviteCode') inviteCode: string | undefined, @Res() res: Response): void {
    if (!this.appleConfigured()) return this.notConfigured(res);
    const state = this.setState(res);
    this.setInvite(res, inviteCode);
    const params = new URLSearchParams({
      client_id: process.env.APPLE_CLIENT_ID as string,
      redirect_uri: process.env.APPLE_CALLBACK_URL || 'http://localhost:4000/auth/oauth/apple/callback',
      response_type: 'code',
      response_mode: 'form_post',
      scope: 'name email',
      state,
    });
    res.redirect(`https://appleid.apple.com/auth/authorize?${params.toString()}`);
  }

  @Public()
  @Post('apple/callback')
  async appleCallback(@Body() body: Record<string, string>, @Req() req: Request, @Res() res: Response): Promise<void> {
    if (!this.appleConfigured()) return this.notConfigured(res);
    const code = body.code;
    const state = body.state;
    if (!code || !this.checkState(req, res, state)) {
      res.redirect(`${this.appUrl()}/login?oauthError=invalid_state`);
      return;
    }
    try {
      const clientSecret = await this.buildAppleClientSecret();
      const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.APPLE_CLIENT_ID as string,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: process.env.APPLE_CALLBACK_URL || 'http://localhost:4000/auth/oauth/apple/callback',
        }),
      });
      const tokenData = (await tokenRes.json()) as { id_token?: string };
      if (!tokenData.id_token) throw new Error('apple token exchange failed');

      const JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
      const { payload } = await jwtVerify(tokenData.id_token, JWKS, {
        issuer: 'https://appleid.apple.com',
        audience: process.env.APPLE_CLIENT_ID as string,
      });

      // Der Name wird von Apple nur bei der ersten Zustimmung im `user`-Feld
      // des form_post-Bodys mitgeschickt (JSON-String).
      let displayName: string | null = null;
      if (body.user) {
        try {
          const parsed = JSON.parse(body.user) as { name?: { firstName?: string; lastName?: string } };
          const parts = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean);
          if (parts.length) displayName = parts.join(' ');
        } catch {
          displayName = null;
        }
      }

      const user = await this.auth.resolveOAuthAccount({
        provider: 'APPLE',
        providerUserId: String(payload.sub),
        // Apple-Relay-Adressen (privater E-Mail-Weiterleitungsdienst) sind
        // echte, zustellbare E-Mail-Adressen und werden wie normale behandelt.
        email: (payload.email as string | undefined) ?? null,
        displayName,
        platformInviteCode: this.takeInvite(req, res),
      });
      await this.complete(req, res, user);
    } catch (err) {
      this.redirectForError(res, err);
    }
  }

  /** client_secret für Apple = ES256-signiertes JWT (aud = Apple, sub = Client-ID). */
  private async buildAppleClientSecret(): Promise<string> {
    let pem = process.env.APPLE_PRIVATE_KEY || '';
    if (!pem && process.env.APPLE_PRIVATE_KEY_PATH) {
      pem = readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, 'utf8');
    }
    pem = pem.replace(/\\n/g, '\n');
    const key = await importPKCS8(pem, 'ES256');
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: process.env.APPLE_KEY_ID as string })
      .setIssuer(process.env.APPLE_TEAM_ID as string)
      .setSubject(process.env.APPLE_CLIENT_ID as string)
      .setAudience('https://appleid.apple.com')
      .setIssuedAt()
      .setExpirationTime('180d')
      .sign(key);
  }
}
