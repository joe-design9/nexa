import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions.service';
import { PERMISSIONS } from '@nexa/shared';
import { messageDto } from '../common/dto';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Eingehende Webhooks (externe Dienste posten in einen Kanal) und
 * ausgehende Webhook-Abos (Events an externe URLs, HMAC-signiert).
 *
 * Jeder eingehende Webhook besitzt einen eigenen Pseudo-Nutzer
 * (isBot, username `webhook-<webhookId>`), weil Message.authorId ein echter
 * Nutzer sein muss. Anzeigename/Avatar aus dem Payload werden auf diesem
 * Pseudo-Nutzer fortgeschrieben.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
  ) {}

  private async assertWebhookPermission(userId: string, channelId: string): Promise<any> {
    const { channel, perms } = await this.perms.channelAccess(userId, channelId);
    this.perms.require(perms, PERMISSIONS.MANAGE_WEBHOOKS);
    return channel;
  }

  async createWebhook(userId: string, channelId: string, dto: any): Promise<any> {
    await this.assertWebhookPermission(userId, channelId);
    const token = randomBytes(32).toString('hex');
    const webhook = await this.prisma.webhook.create({
      data: {
        channelId,
        name: String(dto.name ?? 'Webhook').slice(0, 80),
        avatarUrl: dto.avatarUrl ?? null,
        token,
        createdById: userId,
      },
    });
    // Pseudo-Nutzer für diesen Webhook anlegen.
    await this.prisma.user.create({
      data: {
        email: `webhook-${webhook.id}@webhooks.nexa.local`,
        username: `webhook-${webhook.id}`,
        displayName: webhook.name,
        avatarUrl: webhook.avatarUrl,
        passwordHash: null,
        // Sentinel-Geburtsdatum wie bei Bots/OAuth (Schema-Pflichtfeld).
        dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
        emailVerifiedAt: new Date(),
        isBot: true,
      },
    });
    return {
      id: webhook.id,
      channelId: webhook.channelId,
      name: webhook.name,
      avatarUrl: webhook.avatarUrl,
      token: webhook.token, // nur bei der Erstellung im Klartext
      url: `/webhooks/${webhook.id}/${webhook.token}`,
      createdAt: webhook.createdAt,
    };
  }

  async listWebhooks(userId: string, channelId: string): Promise<any[]> {
    await this.assertWebhookPermission(userId, channelId);
    const hooks = await this.prisma.webhook.findMany({ where: { channelId }, orderBy: { createdAt: 'asc' } });
    return hooks.map((h: any) => ({
      id: h.id,
      channelId: h.channelId,
      name: h.name,
      avatarUrl: h.avatarUrl,
      createdAt: h.createdAt,
    }));
  }

  async deleteWebhook(userId: string, webhookId: string): Promise<{ deleted: boolean }> {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook) throw new NotFoundException({ code: 'WEBHOOK_NOT_FOUND', message: 'Webhook nicht gefunden.' });
    await this.assertWebhookPermission(userId, webhook.channelId);
    await this.prisma.webhook.delete({ where: { id: webhookId } });
    const pseudo = await this.prisma.user.findUnique({ where: { username: `webhook-${webhookId}` } });
    if (pseudo) await this.prisma.user.delete({ where: { id: pseudo.id } }).catch(() => undefined);
    return { deleted: true };
  }

  /** Öffentlicher Endpunkt: POST /webhooks/:id/:token (kein Login). */
  async execute(webhookId: string, token: string, dto: any): Promise<any> {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook || webhook.token !== token) {
      throw new UnauthorizedException({ code: 'WEBHOOK_TOKEN_INVALID', message: 'Webhook-Token ungültig.' });
    }
    const content = String(dto.content ?? '').trim();
    if (!content) throw new BadRequestException({ code: 'CONTENT_REQUIRED', message: 'Nachrichteninhalt fehlt.' });
    const pseudo = await this.prisma.user.findUnique({ where: { username: `webhook-${webhookId}` } });
    if (!pseudo) throw new NotFoundException({ code: 'WEBHOOK_USER_MISSING', message: 'Webhook-Nutzer fehlt.' });
    if (dto.username || dto.avatarUrl) {
      await this.prisma.user.update({
        where: { id: pseudo.id },
        data: {
          displayName: dto.username ? String(dto.username).slice(0, 80) : pseudo.displayName,
          avatarUrl: dto.avatarUrl ?? pseudo.avatarUrl,
        },
      });
    }
    const message = await this.prisma.message.create({
      data: { channelId: webhook.channelId, authorId: pseudo.id, content: content.slice(0, 4000) },
      include: { author: true, attachments: true, reactions: true },
    });
    return messageDto(message, pseudo.id);
  }

  // ─── Ausgehende Abos ────────────────────────────────────────────────────

  async createSubscription(userId: string, webhookId: string, dto: any): Promise<any> {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook) throw new NotFoundException({ code: 'WEBHOOK_NOT_FOUND', message: 'Webhook nicht gefunden.' });
    await this.assertWebhookPermission(userId, webhook.channelId);
    const event = String(dto.event ?? '');
    if (!['MESSAGE_CREATE', 'MEMBER_JOIN', 'MEMBER_LEAVE'].includes(event)) {
      throw new BadRequestException({ code: 'INVALID_EVENT', message: 'Ungültiges Webhook-Event.' });
    }
    const sub = await this.prisma.webhookSubscription.create({
      data: {
        webhookId,
        event: event as never,
        url: String(dto.url),
        secret: dto.secret ?? null,
        active: true,
      },
    });
    return sub;
  }

  async listSubscriptions(userId: string, webhookId: string): Promise<any[]> {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook) throw new NotFoundException({ code: 'WEBHOOK_NOT_FOUND', message: 'Webhook nicht gefunden.' });
    await this.assertWebhookPermission(userId, webhook.channelId);
    return this.prisma.webhookSubscription.findMany({ where: { webhookId }, orderBy: { createdAt: 'asc' } });
  }

  async deleteSubscription(userId: string, webhookId: string, subId: string): Promise<{ deleted: boolean }> {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook) throw new NotFoundException({ code: 'WEBHOOK_NOT_FOUND', message: 'Webhook nicht gefunden.' });
    await this.assertWebhookPermission(userId, webhook.channelId);
    await this.prisma.webhookSubscription.deleteMany({ where: { id: subId, webhookId } });
    return { deleted: true };
  }

  // ─── Event-Versand (ausgehend) ──────────────────────────────────────────

  @OnEvent('nexa.message.create')
  async onMessageCreate(payload: { message: any; raw: any; channelId: string; serverId: string | null }): Promise<void> {
    // Nachrichten von Webhook-Pseudo-Nutzern lösen keine ausgehenden Abos aus (Schleifenschutz).
    if (typeof payload.raw?.author?.username === 'string' && payload.raw.author.username.startsWith('webhook-')) return;
    if (!payload.serverId) return;
    await this.dispatch('MESSAGE_CREATE', payload.serverId, {
      channelId: payload.channelId,
      message: payload.message,
    }, payload.channelId);
  }

  @OnEvent('nexa.member.join')
  async onMemberJoin(payload: { serverId: string; userId: string }): Promise<void> {
    await this.dispatch('MEMBER_JOIN', payload.serverId, { serverId: payload.serverId, userId: payload.userId }, null);
  }

  @OnEvent('nexa.member.leave')
  async onMemberLeave(payload: { serverId: string; userId: string }): Promise<void> {
    await this.dispatch('MEMBER_LEAVE', payload.serverId, { serverId: payload.serverId, userId: payload.userId }, null);
  }

  /**
   * Versand an alle aktiven Abos des Servers. MESSAGE_CREATE-Abos sind an den
   * Webhook (→ Kanal) gebunden und feuern nur für Nachrichten desselben Kanals;
   * Mitgliedschafts-Events feuern für alle Webhooks des Servers.
   * Fire-and-forget, 3 s Timeout, Fehler werden nur geloggt.
   */
  private async dispatch(event: string, serverId: string, data: Record<string, unknown>, channelId: string | null): Promise<void> {
    try {
      const channels = await this.prisma.channel.findMany({ where: { serverId }, select: { id: true } });
      const channelIds = channels.map((c: any) => c.id);
      if (!channelIds.length) return;
      const subs = await this.prisma.webhookSubscription.findMany({
        where: {
          event: event as never,
          active: true,
          webhook: { channelId: event === 'MESSAGE_CREATE' && channelId ? channelId : { in: channelIds } },
        },
        include: { webhook: true },
      });
      const body = JSON.stringify({ event, serverId, timestamp: new Date().toISOString(), data });
      await Promise.all(
        subs.map(async (sub: any) => {
          try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (sub.secret) {
              const sig = createHmac('sha256', sub.secret).update(body).digest('hex');
              headers['X-Nexa-Signature'] = `sha256=${sig}`;
            }
            await fetch(sub.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(3000) });
          } catch (err) {
            this.logger.warn(`Webhook-Versand an ${sub.url} fehlgeschlagen: ${(err as Error).message}`);
          }
        }),
      );
    } catch (err) {
      this.logger.warn(`Webhook-Dispatch fehlgeschlagen: ${(err as Error).message}`);
    }
  }
}
