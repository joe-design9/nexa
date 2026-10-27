import { Injectable, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccessToken } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions.service';
import { PERMISSIONS, hasPermission } from '@nexa/shared';

/* eslint-disable @typescript-eslint/no-explicit-any */

@Injectable()
export class VoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * LiveKit-Zugangstoken für einen Sprach-/Bühnen- oder DM-Kanal.
   * Raum = channelId. Veröffentlichen (Sprechen) nur mit SPEAK-Berechtigung;
   * in DM-Kanälen dürfen alle Teilnehmer sprechen.
   */
  async createToken(userId: string, channelId: string): Promise<{ token: string; url: string; room: string }> {
    const { channel, perms } = await this.perms.channelAccess(userId, channelId);
    if (!['VOICE', 'STAGE', 'DM', 'GROUP_DM'].includes(channel.type)) {
      throw new BadRequestException({ code: 'NOT_A_VOICE_CHANNEL', message: 'Dieser Kanal unterstützt keine Sprachverbindung.' });
    }
    this.perms.require(perms, PERMISSIONS.CONNECT);
    const canSpeak = hasPermission(perms, PERMISSIONS.SPEAK);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
    const apiSecret = process.env.LIVEKIT_API_SECRET || 'devsecret_change_me_32_chars_minimum';
    const token = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: user?.displayName ?? userId,
      ttl: '6h',
    });
    token.addGrant({
      roomJoin: true,
      room: channelId,
      canPublish: canSpeak,
      canSubscribe: true,
      canPublishData: true,
    });
    return { token: await token.toJwt(), url: process.env.LIVEKIT_URL || 'ws://localhost:7880', room: channelId };
  }

  /**
   * DM-Anruf „klingeln“: CALL-Systemnachricht + Benachrichtigungen +
   * Gateway-Event `voice:call` an alle anderen Teilnehmer.
   */
  async ringCall(userId: string, channelId: string): Promise<{ ringing: boolean; messageId: string }> {
    const { channel } = await this.perms.channelAccess(userId, channelId);
    if (channel.type !== 'DM' && channel.type !== 'GROUP_DM') {
      throw new BadRequestException({ code: 'RING_DM_ONLY', message: 'Anrufe können nur in Direktnachrichten gestartet werden.' });
    }
    const caller = await this.prisma.user.findUnique({ where: { id: userId } });
    const message = await this.prisma.message.create({
      data: {
        channelId,
        authorId: userId,
        content: `📞 ${caller?.displayName ?? 'Jemand'} hat einen Anruf gestartet.`,
        type: 'CALL',
      },
    });
    const participants = await this.prisma.dmParticipant.findMany({ where: { channelId }, select: { userId: true } });
    for (const p of participants as any[]) {
      if (p.userId === userId) continue;
      await this.prisma.notification.create({
        data: {
          userId: p.userId,
          type: 'DM',
          title: 'Eingehender Anruf',
          body: `${caller?.displayName ?? 'Jemand'} ruft dich an.`,
          data: { channelId, messageId: message.id, kind: 'CALL' },
        },
      });
    }
    this.events.emit('nexa.voice.call', { channelId, callerId: userId, messageId: message.id });
    return { ringing: true, messageId: message.id };
  }
}
