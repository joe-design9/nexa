import { MessagesService } from './messages.service';
import { PERMISSIONS } from '@nexa/shared';

/**
 * Nachrichten-Service-Tests ohne Live-DB/Redis: Prisma/Redis/Permissions
 * werden gemockt, der echte Service-Ablauf (Automod → Slowmode → Spam →
 * Mentions/Benachrichtigungen) läuft dagegen.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const ALL_TEXT_PERMS =
  PERMISSIONS.VIEW_CHANNELS |
  PERMISSIONS.SEND_MESSAGES |
  PERMISSIONS.READ_MESSAGE_HISTORY |
  PERMISSIONS.ADD_REACTIONS |
  PERMISSIONS.ATTACH_FILES |
  PERMISSIONS.EMBED_LINKS;

function makeService(overrides: {
  channel?: any;
  server?: any;
  member?: any;
  setNx?: boolean;
}) {
  const channel = overrides.channel ?? { id: 'chan-1', serverId: 'srv-1', type: 'TEXT', slowmodeSeconds: 0 };
  const server = overrides.server ?? {
    id: 'srv-1',
    automodEnabled: true,
    bannedWords: [],
    automodBlockLinks: false,
    automodMaxMentions: 5,
    automodSpamLimit: 5,
    requireRulesAccept: false,
    memberAgeMinutes: 0,
    verificationLevel: 'NONE',
  };
  const member = overrides.member ?? {
    id: 'mem-1',
    userId: 'user-1',
    joinedAt: new Date(Date.now() - 24 * 3600 * 1000),
    timeoutUntil: null,
    rulesAcceptedAt: new Date(),
  };

  const messageCreate = jest.fn().mockImplementation(({ data }: any) =>
    Promise.resolve({
      id: 'msg-1',
      ...data,
      author: { id: 'user-1', username: 'joel', displayName: 'Joel', avatarUrl: null, isBot: false, verified: false },
      attachments: [],
      reactions: [],
      replyTo: null,
      embeds: null,
      createdAt: new Date(),
      editedAt: null,
      deletedAt: null,
      pinned: false,
    }),
  );
  const notificationCreate = jest.fn().mockResolvedValue({ id: 'notif-1' });

  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        username: 'joel',
        displayName: 'Joel',
        emailVerifiedAt: new Date(),
        email: 'joel@example.com',
      }),
    },
    member: {
      findMany: jest.fn().mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-2' }, { userId: 'user-3' }]),
      update: jest.fn().mockResolvedValue({}),
    },
    role: { findMany: jest.fn().mockResolvedValue([]) },
    memberRole: { findMany: jest.fn().mockResolvedValue([]) },
    message: { create: messageCreate, findUnique: jest.fn(), findFirst: jest.fn() },
    readState: { upsert: jest.fn().mockResolvedValue({}) },
    notification: { create: notificationCreate },
    notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
    dmParticipant: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const redis: any = {
    setNx: jest.fn().mockResolvedValue(overrides.setNx ?? true),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    listPush: jest.fn().mockResolvedValue(1),
    listRange: jest.fn().mockResolvedValue([String(Date.now())]),
    listTrim: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    hget: jest.fn().mockResolvedValue(null),
    getPresence: jest.fn().mockResolvedValue({}),
  };

  const perms: any = {
    channelAccess: jest.fn().mockResolvedValue({ channel, perms: ALL_TEXT_PERMS, member, server }),
    getMember: jest.fn().mockResolvedValue(member),
    require: jest.fn(),
  };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  const events: any = { emit: jest.fn() };

  const service = new MessagesService(prisma, redis, perms, audit, events);
  return { service, prisma, redis, perms, audit, messageCreate, notificationCreate };
}

describe('MessagesService.sendMessage', () => {
  it('blockiert Nachrichten mit verbotenen Wörtern (Automod) und speichert sie nicht', async () => {
    const { service, messageCreate } = makeService({
      server: {
        id: 'srv-1', automodEnabled: true, bannedWords: ['schlechtwort'], automodBlockLinks: false,
        automodMaxMentions: 5, automodSpamLimit: 5, requireRulesAccept: false, memberAgeMinutes: 0, verificationLevel: 'NONE',
      },
    });
    await expect(service.sendMessage('user-1', 'chan-1', { content: 'Das ist ein schlechtwort hier' })).rejects.toMatchObject({
      response: { code: 'AUTOMOD_BLOCKED' },
    });
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it('blockiert eine zweite Nachricht innerhalb des Slowmode-Fensters', async () => {
    const { service, messageCreate } = makeService({
      channel: { id: 'chan-1', serverId: 'srv-1', type: 'TEXT', slowmodeSeconds: 10 },
      setNx: false, // Slowmode-Schlüssel existiert bereits → zu schnell
    });
    await expect(service.sendMessage('user-1', 'chan-1', { content: 'zweite Nachricht' })).rejects.toMatchObject({
      response: { code: 'SLOWMODE' },
      status: 429,
    });
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it('erzeugt Benachrichtigungen nur für erwähnte Nutzer', async () => {
    const { service, notificationCreate } = makeService({});
    const result = await service.sendMessage('user-1', 'chan-1', { content: 'Hallo <@user-2>, schau mal!' });
    expect(result.id).toBe('msg-1');
    expect(notificationCreate).toHaveBeenCalledTimes(1);
    expect(notificationCreate.mock.calls[0][0].data.userId).toBe('user-2');
    expect(notificationCreate.mock.calls[0][0].data.type).toBe('MENTION');
  });

  it('blockiert das Schreiben, solange die Mindest-Mitgliedsdauer (MEMBER_AGE) nicht erreicht ist', async () => {
    const { service, messageCreate } = makeService({
      server: {
        id: 'srv-1', automodEnabled: true, bannedWords: [], automodBlockLinks: false,
        automodMaxMentions: 5, automodSpamLimit: 5, requireRulesAccept: false, memberAgeMinutes: 60, verificationLevel: 'MEMBER_AGE',
      },
      member: {
        id: 'mem-1', userId: 'user-1', joinedAt: new Date(), timeoutUntil: null, rulesAcceptedAt: new Date(),
      },
    });
    await expect(service.sendMessage('user-1', 'chan-1', { content: 'Hallo zusammen' })).rejects.toMatchObject({
      response: { code: 'MEMBER_AGE_GATE' },
    });
    expect(messageCreate).not.toHaveBeenCalled();
  });
});
