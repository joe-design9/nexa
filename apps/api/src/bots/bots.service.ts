import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { PermissionsService } from '../common/permissions.service';
import { ServersService } from '../servers/servers.service';
import { PERMISSIONS } from '@nexa/shared';
import { publicUser } from '../common/dto';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Bot-Verwaltung für Entwickler.
 *
 * Bot-Token-Format: `<botUserId>.<48 Hex-Zeichen>`. Gespeichert wird nur der
 * bcrypt-Hash + ein Präfix (erste 16 Hex-Zeichen) zur Anzeige.
 *
 * Slash-Commands: Definitionen liegen als Redis-Hash `commands:<serverId>`
 * (Feld = Name, Wert = JSON { botUserId, name, description, responseTemplate }).
 * Bewusste Entscheidung: Das Prisma-Schema hat kein Command-Modell; Redis ist
 * hier die persistente Registry (kein TTL, überlebt API-Neustarts, solange das
 * Redis-Volume besteht). Die Ausführung erfolgt in MessagesService.
 */
@Injectable()
export class BotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly perms: PermissionsService,
    private readonly servers: ServersService,
  ) {}

  private async mintToken(botUserId: string): Promise<{ token: string; hash: string; prefix: string }> {
    const secret = randomBytes(24).toString('hex'); // 48 Hex-Zeichen
    const token = `${botUserId}.${secret}`;
    const hash = await bcrypt.hash(token, 12);
    return { token, hash, prefix: secret.slice(0, 16) };
  }

  async createBot(ownerId: string, dto: any): Promise<any> {
    const name = String(dto.name ?? '').trim();
    if (!name) throw new BadRequestException({ code: 'NAME_REQUIRED', message: 'Bitte einen Bot-Namen angeben.' });
    const suffix = randomBytes(3).toString('hex');
    const username = `bot_${name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 20)}_${suffix}`;
    const botUser = await this.prisma.user.create({
      data: {
        email: `bot-${randomBytes(8).toString('hex')}@bots.nexa.local`,
        username,
        displayName: name,
        passwordHash: null,
        // Bots haben kein Geburtsdatum; Sentinel wie bei OAuth (Schema-Pflichtfeld).
        dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
        emailVerifiedAt: new Date(),
        isBot: true,
        verified: true,
      },
    });
    const minted = await this.mintToken(botUser.id);
    const account = await this.prisma.botAccount.create({
      data: {
        botUserId: botUser.id,
        ownerId,
        tokenHash: minted.hash,
        tokenPrefix: minted.prefix,
        description: dto.description ?? null,
      },
    });
    // Das Token wird nur hier ein einziges Mal im Klartext zurückgegeben.
    return { bot: publicUser(botUser), botAccountId: account.id, token: minted.token, tokenPrefix: minted.prefix };
  }

  async listBots(ownerId: string): Promise<any[]> {
    const accounts = await this.prisma.botAccount.findMany({
      where: { ownerId },
      include: { botUser: true },
      orderBy: { createdAt: 'desc' },
    });
    return accounts.map((a: any) => ({
      id: a.id,
      bot: publicUser(a.botUser),
      tokenPrefix: a.tokenPrefix,
      description: a.description,
      createdAt: a.createdAt,
      lastUsedAt: a.lastUsedAt,
    }));
  }

  private async ownBot(ownerId: string, botAccountId: string): Promise<any> {
    const account = await this.prisma.botAccount.findUnique({
      where: { id: botAccountId },
      include: { botUser: true },
    });
    if (!account || account.ownerId !== ownerId) {
      throw new NotFoundException({ code: 'BOT_NOT_FOUND', message: 'Bot nicht gefunden.' });
    }
    return account;
  }

  async regenerateToken(ownerId: string, botAccountId: string): Promise<{ token: string; tokenPrefix: string }> {
    const account = await this.ownBot(ownerId, botAccountId);
    const minted = await this.mintToken(account.botUserId);
    await this.prisma.botAccount.update({
      where: { id: account.id },
      data: { tokenHash: minted.hash, tokenPrefix: minted.prefix },
    });
    return { token: minted.token, tokenPrefix: minted.prefix };
  }

  async deleteBot(ownerId: string, botAccountId: string): Promise<{ deleted: boolean }> {
    const account = await this.ownBot(ownerId, botAccountId);
    await this.prisma.user.delete({ where: { id: account.botUserId } });
    return { deleted: true };
  }

  /** Bot tritt einem Server per Einladungscode bei (volle Join-Prüfungen). */
  async joinViaInvite(ownerId: string, botAccountId: string, inviteCode: string): Promise<any> {
    const account = await this.ownBot(ownerId, botAccountId);
    const invite = await this.prisma.invite.findUnique({ where: { code: inviteCode }, include: { server: true } });
    if (!invite) throw new NotFoundException({ code: 'INVITE_NOT_FOUND', message: 'Einladung nicht gefunden.' });
    return this.servers.joinServer(account.botUserId, invite.server, invite);
  }

  /** Server-Admin fügt einen Bot direkt hinzu (MANAGE_SERVER). */
  async addBotToServer(actorId: string, serverId: string, botUserId: string): Promise<any> {
    const { server, ctx } = await this.perms.serverContext(serverId, actorId);
    this.perms.require(ctx.basePermissions, PERMISSIONS.MANAGE_SERVER);
    const botUser = await this.prisma.user.findUnique({ where: { id: botUserId } });
    if (!botUser?.isBot) throw new NotFoundException({ code: 'BOT_NOT_FOUND', message: 'Bot-Nutzer nicht gefunden.' });
    return this.servers.joinServer(botUserId, server);
  }

  // ─── Slash-Commands (Redis-Registry) ────────────────────────────────────

  async registerCommand(ownerId: string, botAccountId: string, dto: any): Promise<any> {
    const account = await this.ownBot(ownerId, botAccountId);
    const serverId = String(dto.serverId ?? '');
    const name = String(dto.name ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!serverId || !name || !dto.responseTemplate) {
      throw new BadRequestException({ code: 'INVALID_COMMAND', message: 'serverId, name und responseTemplate sind erforderlich.' });
    }
    const member = await this.perms.getMember(serverId, account.botUserId);
    if (!member) {
      throw new BadRequestException({ code: 'BOT_NOT_MEMBER', message: 'Der Bot ist kein Mitglied dieses Servers.' });
    }
    const def = {
      botUserId: account.botUserId,
      name,
      description: String(dto.description ?? ''),
      responseTemplate: String(dto.responseTemplate),
    };
    await this.redis.hset(`commands:${serverId}`, name, JSON.stringify(def));
    return def;
  }

  async listCommands(serverId: string): Promise<any[]> {
    const all = await this.redis.hgetall(`commands:${serverId}`);
    return Object.values(all).map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async deleteCommand(ownerId: string, botAccountId: string, serverId: string, name: string): Promise<{ deleted: boolean }> {
    const account = await this.ownBot(ownerId, botAccountId);
    const raw = await this.redis.hget(`commands:${serverId}`, name.toLowerCase());
    if (raw) {
      const def = JSON.parse(raw) as { botUserId: string };
      if (def.botUserId !== account.botUserId) {
        throw new NotFoundException({ code: 'COMMAND_NOT_FOUND', message: 'Command gehört zu einem anderen Bot.' });
      }
    }
    await this.redis.hdel(`commands:${serverId}`, name.toLowerCase());
    return { deleted: true };
  }
}
