import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * E-Mail-Versand. Ohne SMTP_HOST werden die Links nur ins Server-Log
 * geschrieben (Dev-Modus, z. B. MailHog bzw. Konsole).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transport: Transporter | null = null;

  constructor() {
    const host = process.env.SMTP_HOST;
    if (host) {
      this.transport = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 1025),
        secure: false,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
          : undefined,
      });
    }
  }

  private async send(to: string, subject: string, html: string, fallbackUrl?: string): Promise<void> {
    if (!this.transport) {
      this.logger.log(`[DEV-MAIL] An: ${to} | Betreff: ${subject} | Link: ${fallbackUrl ?? '(siehe HTML)'}`);
      // eslint-disable-next-line no-console
      console.log(`[Nexa Mail] ${subject} → ${to}: ${fallbackUrl ?? ''}`);
      return;
    }
    await this.transport.sendMail({
      from: process.env.SMTP_FROM || 'Nexa <no-reply@nexa.local>',
      to,
      subject,
      html,
    });
  }

  async sendVerifyEmail(to: string, token: string): Promise<void> {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const url = `${appUrl}/verify-email?token=${encodeURIComponent(token)}`;
    await this.send(
      to,
      'Nexa – Bitte bestätige deine E-Mail-Adresse',
      `<p>Willkommen bei Nexa!</p><p>Bitte bestätige deine E-Mail-Adresse über diesen Link (24 Stunden gültig):</p><p><a href="${url}">${url}</a></p>`,
      url,
    );
  }

  async sendResetEmail(to: string, token: string): Promise<void> {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const url = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.send(
      to,
      'Nexa – Passwort zurücksetzen',
      `<p>Du hast ein neues Passwort angefordert. Setze es über diesen Link zurück (1 Stunde gültig):</p><p><a href="${url}">${url}</a></p><p>Wenn du das nicht warst, ignoriere diese E-Mail.</p>`,
      url,
    );
  }
}
