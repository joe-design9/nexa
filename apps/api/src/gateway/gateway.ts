import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { AuthGuard } from '../common/auth.guard';
import { PermissionsService } from '../common/permissions.service';
import { FriendsService } from '../friends/friends.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Echtzeit-Gateway (Socket.IO, Namespace '/').
 *
 * Räume: `user:<id>`, `server:<id>`, `channel:<id>`.
 * Authentifizierung im Handshake über socket.handshake.auth.token
 * (Access-JWT oder Bot-Token). Nachrichten werden kanonisch per REST
 * geschrieben; das Gateway verteilt die daraus entstehenden Events.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class NexaGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NexaGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly authGuard: AuthGuard,
    private readonly perms: PermissionsService,
    private readonly friends: FriendsService,
  ) {}

  /** Redis-Adapter für mehrere API-Instanzen. */
  afterInit(server: Server): void {
    try {
      const pub = this.redis.createClient();
      const sub = pub.duplicate();
      server.adapter(createAdapter(pub, sub) as never);
    } catch (err) {
      this.logger.warn(`Redis-Adapter konnte nicht gesetzt werden: ${(err as Error).message}`);
    }
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = (client.handshake.auth?.token as string | undefined) ?? '';
    let authUser = token ? await this.authGuard.authenticateAccessToken(token) : null;
    if (!authUser && token) authUser = await this.authGuard.authenticateBotToken(token);
    if (!authUser) {
      client.disconnect(true);
      return;
    }
    client.data.userId = authUser.id;
    client.data.isBot = authUser.isBot;

    client.join(`user:${authUser.id}`);
    const memberships = await this.prisma.member.findMany({
      where: { userId: authUser.id },
      select: { serverId: true },
    });
    for (const m of memberships as any[]) client.join(`server:${m.serverId}`);
    client.data.serverIds = memberships.map((m: any) => m.serverId);

    const user = await this.prisma.user.findUnique({ where: { id: authUser.id } });
    if (user) {
      await this.redis.setOnline(user.id, client.id);
      const effective = user.status === 'INVISIBLE' ? 'OFFLINE' : user.status;
      await this.redis.setPresence(user.id, effective, user.customStatusText);
      client.data.effectiveStatus = effective;
      await this.broadcastPresence(user.id, effective, user.customStatusText);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    const wasLast = await this.redis.removeOnline(userId, client.id);
    if (wasLast) {
      await this.redis.clearPresence(userId);
      await this.broadcastPresence(userId, 'OFFLINE', null);
    }
  }

  /** Präsenz an alle Server-Räume des Nutzers + an die Nutzer-Räume seiner Freunde. */
  private async broadcastPresence(userId: string, status: string, customStatusText: string | null): Promise<void> {
    const memberships = await this.prisma.member.findMany({ where: { userId }, select: { serverId: true } });
    const payload = { userId, status, customStatusText };
    for (const m of memberships as any[]) {
      this.server.to(`server:${m.serverId}`).emit('presence:update', payload);
    }
    const friendIds = await this.friends.friendIds(userId);
    for (const fid of friendIds) {
      this.server.to(`user:${fid}`).emit('presence:update', payload);
    }
  }

  // ─── Eingehende Events ──────────────────────────────────────────────────

  @SubscribeMessage('channel:join')
  async onJoinChannel(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }): Promise<{ joined: boolean; error?: string }> {
    try {
      await this.perms.channelAccess(client.data.userId, body.channelId);
      await client.join(`channel:${body.channelId}`);
      return { joined: true };
    } catch (err) {
      return { joined: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('channel:leave')
  async onLeaveChannel(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }): Promise<{ left: boolean }> {
    await client.leave(`channel:${body.channelId}`);
    return { left: true };
  }

  @SubscribeMessage('typing')
  async onTyping(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }): Promise<void> {
    const userId = client.data.userId as string;
    // Serverseitige Drossel: höchstens 1 Tipp-Signal pro 2 Sekunden.
    const ok = await this.redis.setNx(`typing:${body.channelId}:${userId}`, '1', 2);
    if (!ok) return;
    client.to(`channel:${body.channelId}`).emit('typing:update', { channelId: body.channelId, userId, typing: true });
  }

  @SubscribeMessage('voice:state')
  async onVoiceState(@ConnectedSocket() client: Socket, @MessageBody() body: any): Promise<void> {
    const userId = client.data.userId as string;
    const state = {
      muted: Boolean(body.muted),
      deafened: Boolean(body.deafened),
      video: Boolean(body.video),
      sharing: Boolean(body.sharing),
    };
    await this.redis.hset(`voice:${body.channelId}`, userId, JSON.stringify(state));
    client.to(`channel:${body.channelId}`).emit('voice:update', { channelId: body.channelId, userId, state });
    const channel = await this.prisma.channel.findUnique({ where: { id: body.channelId }, select: { serverId: true } });
    if (channel?.serverId) {
      client.to(`server:${channel.serverId}`).emit('voice:update', { channelId: body.channelId, userId, state });
    }
  }

  @SubscribeMessage('presence:status')
  async onPresenceStatus(@ConnectedSocket() client: Socket, @MessageBody() body: { status: string }): Promise<{ ok: boolean }> {
    const userId = client.data.userId as string;
    const allowed = ['ONLINE', 'IDLE', 'DND', 'INVISIBLE'];
    if (!allowed.includes(body.status)) return { ok: false };
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: body.status as never },
    });
    const effective = body.status === 'INVISIBLE' ? 'OFFLINE' : body.status;
    await this.redis.setPresence(userId, effective, user.customStatusText);
    await this.broadcastPresence(userId, effective, user.customStatusText);
    return { ok: true };
  }

  // ─── Ausgehende Events (aus dem internen Event-Bus) ─────────────────────

  @OnEvent('nexa.message.create')
  onMessageCreate(payload: { message: any; channelId: string; serverId: string | null }): void {
    this.server.to(`channel:${payload.channelId}`).emit('message:create', payload.message);
  }

  @OnEvent('nexa.message.update')
  onMessageUpdate(payload: { message: any; channelId: string }): void {
    this.server.to(`channel:${payload.channelId}`).emit('message:update', payload.message);
  }

  @OnEvent('nexa.message.delete')
  onMessageDelete(payload: { messageId: string; channelId: string }): void {
    this.server.to(`channel:${payload.channelId}`).emit('message:delete', { id: payload.messageId, channelId: payload.channelId });
  }

  @OnEvent('nexa.reaction.add')
  onReactionAdd(payload: any): void {
    this.server.to(`channel:${payload.channelId}`).emit('reaction:add', payload);
  }

  @OnEvent('nexa.reaction.remove')
  onReactionRemove(payload: any): void {
    this.server.to(`channel:${payload.channelId}`).emit('reaction:remove', payload);
  }

  @OnEvent('nexa.channel.create')
  onChannelCreate(payload: { serverId: string; channel: any }): void {
    this.server.to(`server:${payload.serverId}`).emit('channel:create', payload.channel);
  }

  @OnEvent('nexa.thread.create')
  onThreadCreate(payload: { serverId: string; thread: any }): void {
    this.server.to(`server:${payload.serverId}`).emit('channel:create', payload.thread);
  }

  @OnEvent('nexa.channel.update')
  onChannelUpdate(payload: { serverId: string; channel: any }): void {
    this.server.to(`server:${payload.serverId}`).emit('channel:update', payload.channel);
  }

  @OnEvent('nexa.channel.delete')
  onChannelDelete(payload: { serverId: string; channelId: string }): void {
    this.server.to(`server:${payload.serverId}`).emit('channel:delete', { id: payload.channelId });
  }

  @OnEvent('nexa.server.update')
  onServerUpdate(payload: { serverId: string }): void {
    this.server.to(`server:${payload.serverId}`).emit('server:update', { id: payload.serverId });
  }

  @OnEvent('nexa.member.join')
  onMemberJoin(payload: { serverId: string; userId: string }): void {
    this.server.to(`server:${payload.serverId}`).emit('member:join', { serverId: payload.serverId, userId: payload.userId });
  }

  @OnEvent('nexa.member.leave')
  onMemberLeave(payload: { serverId: string; userId: string }): void {
    this.server.to(`server:${payload.serverId}`).emit('member:leave', { serverId: payload.serverId, userId: payload.userId });
  }

  @OnEvent('nexa.member.update')
  onMemberUpdate(payload: { serverId: string; userId: string }): void {
    this.server.to(`server:${payload.serverId}`).emit('member:update', { serverId: payload.serverId, userId: payload.userId });
  }

  @OnEvent('nexa.notification.new')
  onNotificationNew(payload: { userId: string }): void {
    this.server.to(`user:${payload.userId}`).emit('notification:new', { userId: payload.userId });
  }

  @OnEvent('nexa.voice.call')
  async onVoiceCall(payload: { channelId: string; callerId: string; messageId: string }): Promise<void> {
    const participants = await this.prisma.dmParticipant.findMany({
      where: { channelId: payload.channelId },
      select: { userId: true },
    });
    for (const p of participants as any[]) {
      if (p.userId !== payload.callerId) {
        this.server.to(`user:${p.userId}`).emit('voice:call', payload);
      }
    }
  }
}
