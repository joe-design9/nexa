import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { PermissionsService } from '../common/permissions.service';
import { AuditService } from '../common/audit.service';
import { PERMISSIONS, hasPermission, checkAutomod, parseMentions } from '@nexa/shared';
import { messageDto, channelDto } from '../common/dto';
import { joinGateError, assertEmailVerified } from '../servers/servers.service';
import { isAllowedContentType, maxUploadBytes } from '../uploads/upload.constants';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Autor einer Nachricht immer inkl. seiner Abzeichen-Schlüssel laden,
 *  damit die Chat-Autorenzeile Owner-Zeichen/Abzeichen zeigen kann. */
const AUTHOR_WITH_BADGES = { include: { badges: { select: { badgeKey: true } } } } as const;

const MESSAGE_INCLUDE = {
  author: AUTHOR_WITH_BADGES,
  attachments: true,
  reactions: true,
  replyTo: { include: { author: AUTHOR_WITH_BADGES } },
} as const;

interface OgEmbed {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly perms: PermissionsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Lesen ──────────────────────────────────────────────────────────────

  async listMessages(userId: string, channelId: string, opts: { before?: string; limit?: number }): Promise<any[]> {
    const { perms } = await this.perms.channelAccess(userId, channelId);
    this.perms.require(perms, PERMISSIONS.READ_MESSAGE_HISTORY);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    let cursorWhere: Record<string, unknown> = {};
    if (opts.before) {
      const cursor = await this.prisma.message.findUnique({ where: { id: opts.before } });
      if (cursor) cursorWhere = { createdAt: { lt: cursor.createdAt } };
    }
    const messages = await this.prisma.message.findMany({
      where: { channelId, deletedAt: null, ...cursorWhere },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return messages.reverse().map((m: any) => messageDto(m, userId));
  }

  async listPins(userId: string, channelId: string): Promise<any[]> {
    await this.perms.channelAccess(userId, channelId);
    const messages = await this.prisma.message.findMany({
      where: { channelId, pinned: true, deletedAt: null },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return messages.map((m: any) => messageDto(m, userId));
  }

  async searchMessages(
    userId: string,
    channelId: string,
    query: { q?: string; from?: string; has?: string; before?: string; after?: string },
  ): Promise<any[]> {
    await this.perms.channelAccess(userId, channelId);
    const where: Record<string, unknown> = { channelId, deletedAt: null };
    if (query.q) where.content = { contains: query.q, mode: 'insensitive' };
    if (query.from) where.authorId = query.from;
    const range: Record<string, Date> = {};
    if (query.before) range.lt = new Date(query.before);
    if (query.after) range.gt = new Date(query.after);
    if (Object.keys(range).length) where.createdAt = range;
    let messages = await this.prisma.message.findMany({
      where,
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    if (query.has === 'link') {
      messages = messages.filter((m: any) => /https?:\/\//i.test(m.content));
    } else if (query.has === 'file') {
      messages = messages.filter((m: any) => m.attachments.length > 0);
    } else if (query.has === 'image') {
      messages = messages.filter((m: any) => m.attachments.some((a: any) => a.contentType.startsWith('image/')));
    }
    return messages.map((m: any) => messageDto(m, userId));
  }

  // ─── Senden ─────────────────────────────────────────────────────────────

  async sendMessage(userId: string, channelId: string, dto: any): Promise<any> {
    const { channel, perms, member, server } = await this.perms.channelAccess(userId, channelId);
    if (channel.type === 'VOICE' || channel.type === 'STAGE') {
      throw new BadRequestException({ code: 'VOICE_CHANNEL_NO_TEXT', message: 'In Sprachkanälen können keine Nachrichten geschrieben werden.' });
    }
    this.perms.require(perms, PERMISSIONS.SEND_MESSAGES);

    const author = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!author) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Konto nicht gefunden.' });

    // Server-Gates: E-Mail bestätigt, Timeout, Regeln + Mitgliedsdauer.
    if (server) {
      assertEmailVerified(author);
      if (member?.timeoutUntil && member.timeoutUntil.getTime() > Date.now()) {
        throw new ForbiddenException({ code: 'USER_TIMEOUTED', message: 'Du bist auf diesem Server im Timeout und kannst nicht schreiben.' });
      }
      const gate = joinGateError(member, server);
      if (gate) throw new ForbiddenException(gate);
    }

    const content = String(dto.content ?? '');

    // Bot-Slash-Commands: `/name args` wird nicht als Nachricht gespeichert,
    // sondern vom registrierten Bot beantwortet (siehe BotsService).
    if (server && content.startsWith('/')) {
      const handled = await this.tryBotCommand(userId, author, channel, content);
      if (handled) return handled;
    }

    // Forum: Ein Beitrag in einem Forum-Kanal erzeugt einen Thread.
    if (channel.type === 'FORUM') {
      return this.createForumPost(userId, channel, dto, content);
    }

    if (dto.attachments?.length) {
      this.perms.require(perms, PERMISSIONS.ATTACH_FILES);
      this.validateAttachments(userId, dto.attachments);
    }

    if (server?.automodEnabled) {
      await this.runAutomod(userId, channel, server, content);
    }
    await this.runSlowmode(userId, channel, perms);
    if (server) await this.runSpamCheck(userId, channel, server);

    const created = await this.persistMessage({
      userId,
      channel,
      content,
      dto,
      perms,
      server,
    });
    return created;
  }

  private async persistMessage(input: {
    userId: string;
    channel: any;
    content: string;
    dto: any;
    perms: bigint;
    server: any | null;
  }): Promise<any> {
    const { userId, channel, content, dto, perms, server } = input;
    const parsed = parseMentions(content);

    let mentionUserIds = parsed.userIds;
    let mentionRoleIds = parsed.roleIds;
    if (server) {
      const members = await this.prisma.member.findMany({ where: { serverId: server.id }, select: { userId: true } });
      const memberIds = new Set(members.map((m: any) => m.userId));
      mentionUserIds = mentionUserIds.filter((id: string) => memberIds.has(id));
      const roles = await this.prisma.role.findMany({ where: { serverId: server.id }, select: { id: true } });
      const roleIds = new Set(roles.map((r: any) => r.id));
      mentionRoleIds = mentionRoleIds.filter((id: string) => roleIds.has(id));
      if ((parsed.everyone || parsed.here) && !hasPermission(perms, PERMISSIONS.MENTION_EVERYONE)) {
        // Ohne MENTION_EVERYONE wirkt @everyone/@here wie eine normale Erwähnung ohne Ping.
        parsed.everyone = false;
        parsed.here = false;
      }
    } else {
      const participants = await this.prisma.dmParticipant.findMany({ where: { channelId: channel.id }, select: { userId: true } });
      const pIds = new Set(participants.map((p: any) => p.userId));
      mentionUserIds = mentionUserIds.filter((id: string) => pIds.has(id));
    }

    let embeds: OgEmbed[] | null = null;
    if (hasPermission(perms, PERMISSIONS.EMBED_LINKS)) {
      embeds = await this.resolveEmbeds(content);
    }

    let replyToId: string | null = null;
    if (dto.replyToId) {
      const reply = await this.prisma.message.findUnique({ where: { id: dto.replyToId } });
      if (reply && reply.channelId === channel.id) replyToId = dto.replyToId;
    }

    const message = await this.prisma.message.create({
      data: {
        channelId: channel.id,
        authorId: userId,
        content,
        type: replyToId ? 'REPLY' : 'DEFAULT',
        replyToId,
        embeds: (embeds as never) ?? undefined,
        mentionUserIds,
        mentionRoleIds,
        mentionEveryone: parsed.everyone,
        attachments: dto.attachments?.length
          ? {
              create: dto.attachments.map((a: any) => ({
                fileName: String(a.fileName),
                url: String(a.url),
                storageKey: String(a.storageKey),
                contentType: String(a.contentType),
                size: Number(a.size),
                width: a.width ?? null,
                height: a.height ?? null,
              })),
            }
          : undefined,
      },
      include: MESSAGE_INCLUDE,
    });

    // Eigener Lesestatus ist sofort aktuell.
    await this.prisma.readState.upsert({
      where: { userId_channelId: { userId, channelId: channel.id } },
      create: { userId, channelId: channel.id, lastReadMessageId: message.id, lastReadAt: new Date(), mentionCount: 0 },
      update: { lastReadMessageId: message.id, lastReadAt: new Date(), mentionCount: 0 },
    });

    await this.createNotifications({
      authorId: userId,
      channel,
      server,
      message,
      mentionUserIds,
      mentionRoleIds,
      everyone: parsed.everyone,
      here: parsed.here,
    });

    const dtoOut = messageDto(message, userId);
    this.events.emit('nexa.message.create', {
      message: dtoOut,
      raw: message,
      channelId: channel.id,
      serverId: channel.serverId ?? null,
    });
    return dtoOut;
  }

  private async createForumPost(userId: string, channel: any, dto: any, content: string): Promise<any> {
    const name = (dto.threadName ? String(dto.threadName) : content.split('\n')[0].slice(0, 80)) || 'Neuer Beitrag';
    const thread = await this.prisma.channel.create({
      data: {
        serverId: channel.serverId,
        categoryId: channel.categoryId,
        name,
        type: 'THREAD',
        parentChannelId: channel.id,
        position: 0,
      },
    });
    const message = await this.prisma.message.create({
      data: { channelId: thread.id, authorId: userId, content },
      include: MESSAGE_INCLUDE,
    });
    await this.prisma.channel.update({ where: { id: thread.id }, data: { starterMessageId: message.id } });
    this.events.emit('nexa.thread.create', { serverId: channel.serverId, channelId: channel.id, thread: channelDto(thread) });
    return { forumThread: channelDto(thread), message: messageDto(message, userId) };
  }

  // ─── Bot-Commands ───────────────────────────────────────────────────────

  /**
   * Bot-Commands liegen als Hash `commands:<serverId>` in Redis
   * (Feld = Command-Name, Wert = JSON { botUserId, responseTemplate }).
   */
  private async tryBotCommand(userId: string, author: any, channel: any, content: string): Promise<any | null> {
    const match = /^\/([a-zA-Z0-9_-]+)\s*([\s\S]*)$/.exec(content.trim());
    if (!match) return null;
    const [, name, args] = match;
    const raw = await this.redis.hget(`commands:${channel.serverId}`, name.toLowerCase());
    if (!raw) return null;
    let def: { botUserId: string; responseTemplate: string };
    try {
      def = JSON.parse(raw);
    } catch {
      return null;
    }
    // Der Bot muss Mitglied des Servers sein, damit er antworten darf.
    const botMember = await this.perms.getMember(channel.serverId, def.botUserId);
    if (!botMember) return null;
    const text = def.responseTemplate
      .replaceAll('{user}', `<@${userId}>`)
      .replaceAll('{username}', author.username)
      .replaceAll('{args}', args.trim());
    const message = await this.prisma.message.create({
      data: { channelId: channel.id, authorId: def.botUserId, content: text },
      include: MESSAGE_INCLUDE,
    });
    const dtoOut = messageDto(message, userId);
    this.events.emit('nexa.message.create', { message: dtoOut, raw: message, channelId: channel.id, serverId: channel.serverId });
    return dtoOut;
  }

  // ─── Automod / Slowmode / Spam ──────────────────────────────────────────

  private async runAutomod(userId: string, channel: any, server: any, content: string): Promise<void> {
    const result = checkAutomod(content, {
      bannedWords: server.bannedWords ?? [],
      blockLinks: Boolean(server.automodBlockLinks),
      maxMentions: Number(server.automodMaxMentions ?? 5),
    });
    if (!result.blocked) return;
    // Verstoßzähler: 3 Verstöße in 10 Minuten → 10 Minuten Timeout.
    const key = `automod:viol:${server.id}:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 600);
    if (count >= 3) {
      const member = await this.perms.getMember(server.id, userId);
      if (member) {
        await this.prisma.member.update({
          where: { id: member.id },
          data: { timeoutUntil: new Date(Date.now() + 10 * 60 * 1000) },
        });
        await this.audit.log({
          actorId: userId,
          action: 'AUTOMOD_TIMEOUT',
          serverId: server.id,
          targetType: 'USER',
          targetId: userId,
          reason: result.reasons.join(', '),
        });
      }
      await this.redis.del(key);
    }
    // Die Nachricht wird nie gespeichert.
    throw new ForbiddenException({
      code: 'AUTOMOD_BLOCKED',
      message: `Deine Nachricht wurde vom Automod blockiert (${result.reasons.join(', ')}).`,
    });
  }

  private async runSlowmode(userId: string, channel: any, perms: bigint): Promise<void> {
    const slow = Number(channel.slowmodeSeconds ?? 0);
    if (slow <= 0) return;
    if (hasPermission(perms, PERMISSIONS.MANAGE_MESSAGES)) return;
    const key = `slow:${channel.id}:${userId}`;
    const ok = await this.redis.setNx(key, '1', slow);
    if (!ok) {
      throw new HttpException(
        { code: 'SLOWMODE', message: `Slowmode aktiv: Bitte warte ${slow} Sekunden zwischen Nachrichten.` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Burst-Schutz: mehr als automodSpamLimit Nachrichten in 5 s → blockieren. */
  private async runSpamCheck(userId: string, channel: any, server: any): Promise<void> {
    const limit = Number(server.automodSpamLimit ?? 5);
    if (limit <= 0) return;
    const key = `spam:${channel.id}:${userId}`;
    const now = Date.now();
    await this.redis.listPush(key, String(now));
    const stamps = (await this.redis.listRange(key, 0, -1)).map(Number).filter((t) => now - t <= 5000);
    await this.redis.listTrim(key, -(limit + 5), -1);
    await this.redis.expire(key, 10);
    if (stamps.length > limit) {
      await this.audit.log({
        actorId: userId,
        action: 'AUTOMOD_SPAM_BLOCK',
        serverId: server.id,
        targetType: 'CHANNEL',
        targetId: channel.id,
        reason: `${stamps.length} Nachrichten in 5s (Limit ${limit})`,
      });
      throw new HttpException(
        { code: 'SPAM_BLOCKED', message: 'Du schreibst zu schnell. Bitte warte einen Moment.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // ─── Benachrichtigungen ─────────────────────────────────────────────────

  /**
   * Benachrichtigungen entstehen für Erwähnungen (Nutzer/Rollen/@everyone/@here)
   * und für DM-Nachrichten. @here zählt nur für aktuell präsente Nutzer
   * (ONLINE/IDLE in Redis). Die Einstellung NOTHING (Kanal/Server) unterdrückt
   * sie; MENTIONS lässt nur Erwähnungen durch; ALL-Erlaubnis allein erzeugt
   * außerhalb von Erwähnungen/DMs keine Einträge (bewusst schlank gehalten:
   * ungelesene Kanäle zeigt der Lesestatus an).
   */
  private async createNotifications(input: {
    authorId: string;
    channel: any;
    server: any | null;
    message: any;
    mentionUserIds: string[];
    mentionRoleIds: string[];
    everyone: boolean;
    here: boolean;
  }): Promise<void> {
    const { authorId, channel, server, message } = input;
    const authorName = message.author?.displayName ?? 'Jemand';
    const targets = new Set<string>();

    if (!server) {
      // DM/Gruppen-DM: alle anderen Teilnehmer benachrichtigen.
      const participants = await this.prisma.dmParticipant.findMany({
        where: { channelId: channel.id },
        select: { userId: true },
      });
      for (const p of participants) if (p.userId !== authorId) targets.add(p.userId);
    } else {
      for (const id of input.mentionUserIds) if (id !== authorId) targets.add(id);
      if (input.mentionRoleIds.length) {
        const roleMembers = await this.prisma.memberRole.findMany({
          where: { roleId: { in: input.mentionRoleIds } },
          include: { member: { select: { userId: true } } },
        });
        for (const rm of roleMembers) if (rm.member.userId !== authorId) targets.add(rm.member.userId);
      }
      if (input.everyone || input.here) {
        const members = await this.prisma.member.findMany({ where: { serverId: server.id }, select: { userId: true } });
        if (input.everyone) {
          for (const m of members) if (m.userId !== authorId) targets.add(m.userId);
        } else {
          const presence = await this.redis.getPresence(members.map((m: any) => m.userId));
          for (const m of members) {
            if (m.userId === authorId) continue;
            const st = presence[m.userId]?.status;
            if (st === 'ONLINE' || st === 'IDLE') targets.add(m.userId);
          }
        }
      }
    }

    for (const targetId of targets) {
      // Präferenzen prüfen: NOTHING auf Kanal- oder Server-Ebene unterdrückt.
      const prefs = await this.prisma.notificationPreference.findMany({
        where: {
          userId: targetId,
          OR: [{ channelId: channel.id }, ...(server ? [{ serverId: server.id }] : [])],
        },
      });
      if (prefs.some((p: any) => p.level === 'NOTHING')) continue;

      const isDm = !server;
      await this.prisma.notification.create({
        data: {
          userId: targetId,
          type: isDm ? 'DM' : 'MENTION',
          title: isDm ? `Neue Nachricht von ${authorName}` : `Du wurdest von ${authorName} erwähnt`,
          body: String(message.content ?? '').slice(0, 200),
          data: { channelId: channel.id, serverId: server?.id ?? null, messageId: message.id },
        },
      });
      await this.prisma.readState.upsert({
        where: { userId_channelId: { userId: targetId, channelId: channel.id } },
        create: { userId: targetId, channelId: channel.id, mentionCount: 1, lastReadAt: new Date(0) },
        update: { mentionCount: { increment: 1 } },
      });
      this.events.emit('nexa.notification.new', { userId: targetId, channelId: channel.id });
    }
  }

  // ─── OpenGraph ──────────────────────────────────────────────────────────

  /** Erste URL im Text → OpenGraph-Vorschau (2,5 s Timeout, 1 h Redis-Cache). */
  private async resolveEmbeds(content: string): Promise<OgEmbed[] | null> {
    const match = /https?:\/\/[^\s<>()]+/i.exec(content);
    if (!match) return null;
    const url = match[0];
    const cacheKey = `og:${url}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as OgEmbed[];
      } catch {
        /* weiter mit Live-Abruf */
      }
    }
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(2500),
        headers: { 'User-Agent': 'NexaBot/1.0 (+https://nexa.local)' },
      });
      const html = await res.text();
      const pick = (property: string): string | null => {
        const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i');
        const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, 'i');
        return re.exec(html)?.[1] ?? re2.exec(html)?.[1] ?? null;
      };
      const titleTag = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1] ?? null;
      const embed: OgEmbed = {
        url,
        title: pick('og:title') ?? titleTag,
        description: pick('og:description'),
        image: pick('og:image'),
        siteName: pick('og:site_name'),
      };
      const result = [embed];
      await this.redis.set(cacheKey, JSON.stringify(result), 3600);
      return result;
    } catch {
      return null; // Embed-Fehler blockieren das Senden nie.
    }
  }

  // ─── Bearbeiten / Löschen / Pins / Weiterleiten / Reaktionen ───────────

  async editMessage(userId: string, messageId: string, dto: any): Promise<any> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'Nachricht nicht gefunden.' });
    if (message.authorId !== userId) {
      throw new ForbiddenException({ code: 'NOT_MESSAGE_AUTHOR', message: 'Du kannst nur eigene Nachrichten bearbeiten.' });
    }
    const parsed = parseMentions(String(dto.content ?? ''));
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: String(dto.content ?? ''),
        editedAt: new Date(),
        mentionUserIds: parsed.userIds,
        mentionRoleIds: parsed.roleIds,
        mentionEveryone: parsed.everyone,
      },
      include: MESSAGE_INCLUDE,
    });
    const out = messageDto(updated, userId);
    this.events.emit('nexa.message.update', { message: out, channelId: message.channelId, serverId: null });
    return out;
  }

  async deleteMessage(userId: string, messageId: string): Promise<{ deleted: boolean }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { channel: true },
    });
    if (!message || message.deletedAt) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'Nachricht nicht gefunden.' });
    let byModerator = false;
    if (message.authorId !== userId) {
      const { perms } = await this.perms.channelAccess(userId, message.channelId);
      this.perms.require(perms, PERMISSIONS.MANAGE_MESSAGES);
      byModerator = true;
    }
    await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
    if (byModerator && message.channel.serverId) {
      await this.audit.log({
        actorId: userId,
        action: 'MESSAGE_DELETE',
        serverId: message.channel.serverId,
        targetType: 'MESSAGE',
        targetId: messageId,
      });
    }
    this.events.emit('nexa.message.delete', { messageId, channelId: message.channelId, serverId: message.channel.serverId ?? null });
    return { deleted: true };
  }

  async pinMessage(userId: string, messageId: string, pinned: boolean): Promise<any> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'Nachricht nicht gefunden.' });
    const { perms } = await this.perms.channelAccess(userId, message.channelId);
    this.perms.require(perms, PERMISSIONS.MANAGE_MESSAGES, 'MISSING_PERMISSION', 'Zum Anpinnen brauchst du die Berechtigung „Nachrichten verwalten“.');
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { pinned },
      include: MESSAGE_INCLUDE,
    });
    return messageDto(updated, userId);
  }

  async forwardMessage(userId: string, messageId: string, targetChannelId: string): Promise<any> {
    const source = await this.prisma.message.findUnique({ where: { id: messageId }, include: { attachments: true } });
    if (!source || source.deletedAt) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'Nachricht nicht gefunden.' });
    await this.perms.channelAccess(userId, source.channelId); // Lesezugriff auf die Quelle
    const { channel, perms, server } = await this.perms.channelAccess(userId, targetChannelId);
    this.perms.require(perms, PERMISSIONS.SEND_MESSAGES);
    const created = await this.prisma.message.create({
      data: {
        channelId: targetChannelId,
        authorId: userId,
        content: source.content,
        forwardedFromId: source.id,
        attachments: source.attachments.length
          ? {
              create: source.attachments.map((a: any) => ({
                fileName: a.fileName,
                url: a.url,
                storageKey: a.storageKey,
                contentType: a.contentType,
                size: a.size,
                width: a.width,
                height: a.height,
              })),
            }
          : undefined,
      },
      include: MESSAGE_INCLUDE,
    });
    const out = messageDto(created, userId);
    this.events.emit('nexa.message.create', { message: out, raw: created, channelId: targetChannelId, serverId: server?.id ?? channel.serverId ?? null });
    return out;
  }

  async addReaction(userId: string, messageId: string, emojiRaw: string): Promise<any> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, include: { channel: true } });
    if (!message || message.deletedAt) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'Nachricht nicht gefunden.' });
    const { perms } = await this.perms.channelAccess(userId, message.channelId);
    this.perms.require(perms, PERMISSIONS.ADD_REACTIONS);

    let emoji = decodeURIComponent(emojiRaw);
    let customEmojiId: string | null = null;
    if (emoji.startsWith('custom:')) {
      customEmojiId = emoji.slice('custom:'.length);
      const custom = await this.prisma.customEmoji.findUnique({ where: { id: customEmojiId } });
      if (!custom) throw new NotFoundException({ code: 'EMOJI_NOT_FOUND', message: 'Eigenes Emoji nicht gefunden.' });
      if (message.channel.serverId && custom.serverId !== message.channel.serverId && !hasPermission(perms, PERMISSIONS.USE_EXTERNAL_EMOJIS)) {
        throw new ForbiddenException({ code: 'EXTERNAL_EMOJI_FORBIDDEN', message: 'Externe Emojis sind hier nicht erlaubt.' });
      }
      emoji = custom.name;
    }
    await this.prisma.reaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      create: { messageId, userId, emoji, customEmojiId },
      update: {},
    });
    this.events.emit('nexa.reaction.add', { messageId, channelId: message.channelId, userId, emoji, customEmojiId });
    return { added: true, emoji };
  }

  async removeReaction(userId: string, messageId: string, emojiRaw: string): Promise<{ removed: boolean }> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'Nachricht nicht gefunden.' });
    await this.perms.channelAccess(userId, message.channelId);
    let emoji = decodeURIComponent(emojiRaw);
    if (emoji.startsWith('custom:')) {
      const custom = await this.prisma.customEmoji.findUnique({ where: { id: emoji.slice('custom:'.length) } });
      if (custom) emoji = custom.name;
    }
    await this.prisma.reaction.deleteMany({ where: { messageId, userId, emoji } });
    this.events.emit('nexa.reaction.remove', { messageId, channelId: message.channelId, userId, emoji });
    return { removed: true };
  }

  // ─── Lesestatus ─────────────────────────────────────────────────────────

  async markRead(userId: string, channelId: string, messageId?: string): Promise<{ read: boolean }> {
    await this.perms.channelAccess(userId, channelId);
    const last = messageId
      ? await this.prisma.message.findUnique({ where: { id: messageId } })
      : await this.prisma.message.findFirst({ where: { channelId }, orderBy: { createdAt: 'desc' } });
    await this.prisma.readState.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: {
        userId,
        channelId,
        lastReadMessageId: last?.id ?? null,
        lastReadAt: last?.createdAt ?? new Date(),
        mentionCount: 0,
      },
      update: {
        lastReadMessageId: last?.id ?? undefined,
        lastReadAt: last?.createdAt ?? new Date(),
        mentionCount: 0,
      },
    });
    return { read: true };
  }

  /** Ungelesen-Karte: pro Kanal { unread, mentionCount } aus Lesestatus + letzter Nachricht. */
  async readStates(userId: string): Promise<Record<string, { unread: boolean; mentionCount: number; lastReadAt: string | null }>> {
    const [memberships, dmChannels] = await Promise.all([
      this.prisma.member.findMany({ where: { userId }, select: { serverId: true } }),
      this.prisma.dmParticipant.findMany({ where: { userId }, select: { channelId: true } }),
    ]);
    const serverIds = memberships.map((m: any) => m.serverId);
    const channels = await this.prisma.channel.findMany({
      where: {
        OR: [
          ...(serverIds.length ? [{ serverId: { in: serverIds } }] : []),
          ...(dmChannels.length ? [{ id: { in: dmChannels.map((d: any) => d.channelId) } }] : []),
        ],
      },
      select: { id: true },
    });
    const states = await this.prisma.readState.findMany({ where: { userId } });
    const stateByChannel = new Map(states.map((s: any) => [s.channelId, s]));
    const out: Record<string, { unread: boolean; mentionCount: number; lastReadAt: string | null }> = {};
    for (const ch of channels) {
      const last = await this.prisma.message.findFirst({
        where: { channelId: ch.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true, authorId: true },
      });
      const st = stateByChannel.get(ch.id);
      const unread = Boolean(
        last && last.authorId !== userId && (!st || last.createdAt.getTime() > new Date(st.lastReadAt).getTime()),
      );
      out[ch.id] = {
        unread,
        mentionCount: st?.mentionCount ?? 0,
        lastReadAt: st ? new Date(st.lastReadAt).toISOString() : null,
      };
    }
    return out;
  }

  private validateAttachments(userId: string, attachments: any[]): void {
    for (const a of attachments) {
      const key = String(a.storageKey ?? '');
      if (!key.startsWith(`uploads/${userId}/`)) {
        throw new BadRequestException({ code: 'ATTACHMENT_NOT_OWNED', message: 'Anhang gehört nicht zu deinem Upload-Bereich.' });
      }
      if (!isAllowedContentType(String(a.contentType ?? ''))) {
        throw new BadRequestException({ code: 'FILE_TYPE_NOT_ALLOWED', message: 'Dieser Dateityp ist nicht erlaubt.' });
      }
      if (Number(a.size ?? 0) > maxUploadBytes()) {
        throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Ein Anhang ist zu groß.' });
      }
    }
  }
}
