import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';

/**
 * Captcha-Prüfung (Cloudflare Turnstile oder hCaptcha).
 *  - CAPTCHA_SECRET_KEY gesetzt → echte siteverify-Prüfung beim Anbieter.
 *  - sonst CAPTCHA_DEV_BYPASS=true → jedes nicht-leere Token wird akzeptiert.
 *  - sonst → Fehler (Captcha nicht konfiguriert).
 */
@Injectable()
export class CaptchaService {
  async verify(token: string | undefined | null): Promise<void> {
    const secret = process.env.CAPTCHA_SECRET_KEY;
    if (secret) {
      if (!token) throw new BadRequestException({ code: 'CAPTCHA_REQUIRED', message: 'Bitte bestätige das Captcha.' });
      const provider = (process.env.CAPTCHA_PROVIDER || 'turnstile').toLowerCase();
      const endpoint =
        provider === 'hcaptcha'
          ? 'https://hcaptcha.com/siteverify'
          : 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
      const body = new URLSearchParams({ secret, response: token });
      let res: Response;
      try {
        res = await fetch(endpoint, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
      } catch {
        throw new ServiceUnavailableException({ code: 'CAPTCHA_UNAVAILABLE', message: 'Captcha-Dienst nicht erreichbar.' });
      }
      const data = (await res.json()) as { success?: boolean };
      if (!data.success) {
        throw new BadRequestException({ code: 'CAPTCHA_FAILED', message: 'Captcha-Prüfung fehlgeschlagen.' });
      }
      return;
    }
    if (process.env.CAPTCHA_DEV_BYPASS === 'true') {
      if (!token || token.trim().length === 0) {
        throw new BadRequestException({ code: 'CAPTCHA_REQUIRED', message: 'Bitte bestätige das Captcha.' });
      }
      return;
    }
    throw new ServiceUnavailableException({ code: 'CAPTCHA_NOT_CONFIGURED', message: 'Captcha ist nicht konfiguriert.' });
  }

  /** Ob eine Captcha-Prüfung überhaupt erzwungen werden muss (Secret gesetzt). */
  get enforced(): boolean {
    return Boolean(process.env.CAPTCHA_SECRET_KEY);
  }
}
