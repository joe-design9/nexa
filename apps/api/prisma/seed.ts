/**
 * Nexa – Seed-Daten für die lokale Entwicklung.
 *
 * Idempotent: Existiert der Plattform-Admin (admin@nexa.local) bereits,
 * lässt das Skript die Demo-Daten unverändert und stellt nur sicher, dass
 * die Start-Plattform-Invite-Codes existieren (Registrierungs-Gate).
 *
 * Ausführen:  npm run db:seed   (im Workspace @nexa/api)
 * Demo-Zugänge stehen in der README (Abschnitt "Demo-Konten").
 */
import {
  ChannelType,
  FriendshipStatus,
  PresenceStatus,
  PrismaClient,
  VerificationLevel,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BCRYPT_COST = 12;
const DEMO_PASSWORD = 'NexaDemo!2026';
const ADMIN_PASSWORD = 'NexaAdmin!2026';

/**
 * Demo-Bot-Token (nur für lokale Entwicklung, steht auch in der README).
 * In der Datenbank liegt ausschließlich der bcrypt-Hash.
 */
export const DEMO_BOT_TOKEN = 'nexa-bot-demo-token-0123456789abcdef';

/**
 * Start-Plattform-Invite-Codes (je 1× nutzbar). Seit dem Invite-Gate ist
 * ohne Code keine Registrierung möglich – diese fünf Codes legt der Seed
 * idempotent an, damit der Betreiber sofort Einladungen verteilen kann.
 * Sie stehen auch in README.md und BUILD_STATUS.md (nur lokale Demo-Codes;
 * in Produktion eigene Codes per Admin-Version erzeugen und diese hier
 * ersetzen/entfernen).
 */
export const STARTER_PLATFORM_INVITE_CODES = [
  'NEXA-K7Q2XD-M9T4PA',
  'NEXA-R3W8ZN-B6K2HE',
  'NEXA-T5P9QA-D2X7MK',
  'NEXA-H8N4RE-W6Z3QB',
  'NEXA-Q2M7TX-P9D5KA',
] as const;

/** Legt fehlende Start-Invite-Codes an (vorhandene bleiben unverändert). */
async function ensureStarterInviteCodes(adminId: string): Promise<void> {
  for (const code of STARTER_PLATFORM_INVITE_CODES) {
    const existing = await prisma.platformInviteCode.findUnique({ where: { code } });
    if (!existing) {
      await prisma.platformInviteCode.create({
        data: { code, maxUses: 1, createdById: adminId },
      });
    }
  }
}

/** Ein Abzeichen idempotent vergeben (Upsert auf dem Unique-Index). */
async function grantSeedBadge(userId: string, badgeKey: string, grantedById: string): Promise<void> {
  await prisma.userBadge.upsert({
    where: { userId_badgeKey: { userId, badgeKey } },
    create: { userId, badgeKey, grantedById },
    update: {},
  });
}

/**
 * Demo-Abzeichen der Seed-Konten (idempotent, läuft auch bei bestehenden
 * Installationen im Kurzpfad): Der Plattform-Admin ist Owner, die vier
 * Demo-Nutzer sind die Beta-Teilnehmer der Demo. Vergeben wird über den
 * Admin als Akteur (grantedById) – weitere Abzeichen vergibt der Admin
 * später selbst über die Admin-Version.
 */
async function ensureSeedBadges(users: {
  adminId: string;
  lenaId?: string | null;
  maxId?: string | null;
  miaId?: string | null;
  jonasId?: string | null;
  botId?: string | null;
}): Promise<void> {
  const { adminId } = users;
  await grantSeedBadge(adminId, 'OWNER', adminId);
  await grantSeedBadge(adminId, 'ADMIN', adminId);
  if (users.lenaId) {
    await grantSeedBadge(users.lenaId, 'BETA', adminId);
    await grantSeedBadge(users.lenaId, 'EARLY_ADOPTER', adminId);
    await grantSeedBadge(users.lenaId, 'CHATTERBOX', adminId);
  }
  if (users.maxId) {
    await grantSeedBadge(users.maxId, 'BETA', adminId);
    await grantSeedBadge(users.maxId, 'MODERATOR', adminId);
  }
  if (users.miaId) {
    await grantSeedBadge(users.miaId, 'BETA', adminId);
    await grantSeedBadge(users.miaId, 'VERIFIED', adminId);
  }
  if (users.jonasId) {
    await grantSeedBadge(users.jonasId, 'BETA', adminId);
  }
  if (users.botId) {
    await grantSeedBadge(users.botId, 'BOT', adminId);
  }
}

// ─── Berechtigungs-Bits (Spiegel der Bitreihenfolge aus @nexa/shared) ────
// Reihenfolge: VIEW_CHANNELS, CREATE_INVITES, CHANGE_NICKNAME, MANAGE_NICKNAMES,
// SEND_MESSAGES, EMBED_LINKS, ATTACH_FILES, ADD_REACTIONS, USE_EXTERNAL_EMOJIS,
// MENTION_EVERYONE, MANAGE_MESSAGES, READ_MESSAGE_HISTORY, CONNECT, SPEAK,
// VIDEO, STREAM, PRIORITY_SPEAKER, USE_VOICE_ACTIVITY, MUTE_MEMBERS,
// DEAFEN_MEMBERS, MOVE_MEMBERS, KICK_MEMBERS, BAN_MEMBERS, TIMEOUT_MEMBERS,
// MANAGE_CHANNELS, MANAGE_ROLES, MANAGE_EMOJIS, MANAGE_WEBHOOKS,
// MANAGE_SERVER, ADMINISTRATOR.
const bit = (index: number): bigint => 1n << BigInt(index);
const VIEW_CHANNELS = bit(0);
const CREATE_INVITES = bit(1);
const CHANGE_NICKNAME = bit(2);
const MANAGE_NICKNAMES = bit(3);
const SEND_MESSAGES = bit(4);
const EMBED_LINKS = bit(5);
const ATTACH_FILES = bit(6);
const ADD_REACTIONS = bit(7);
const USE_EXTERNAL_EMOJIS = bit(8);
const MENTION_EVERYONE = bit(9);
const MANAGE_MESSAGES = bit(10);
const READ_MESSAGE_HISTORY = bit(11);
const CONNECT = bit(12);
const SPEAK = bit(13);
const VIDEO = bit(14);
const STREAM = bit(15);
const PRIORITY_SPEAKER = bit(16);
const USE_VOICE_ACTIVITY = bit(17);
const MUTE_MEMBERS = bit(18);
const DEAFEN_MEMBERS = bit(19);
const MOVE_MEMBERS = bit(20);
const KICK_MEMBERS = bit(21);
const BAN_MEMBERS = bit(22);
const TIMEOUT_MEMBERS = bit(23);
const MANAGE_CHANNELS = bit(24);
const MANAGE_ROLES = bit(25);
const MANAGE_SERVER = bit(28);

const DEFAULT_EVERYONE_PERMISSIONS =
  VIEW_CHANNELS |
  CREATE_INVITES |
  CHANGE_NICKNAME |
  SEND_MESSAGES |
  EMBED_LINKS |
  ATTACH_FILES |
  ADD_REACTIONS |
  USE_EXTERNAL_EMOJIS |
  READ_MESSAGE_HISTORY |
  CONNECT |
  SPEAK |
  VIDEO |
  STREAM |
  USE_VOICE_ACTIVITY;

const MODERATOR_PERMISSIONS =
  DEFAULT_EVERYONE_PERMISSIONS |
  MANAGE_NICKNAMES |
  MANAGE_MESSAGES |
  MUTE_MEMBERS |
  DEAFEN_MEMBERS |
  MOVE_MEMBERS |
  KICK_MEMBERS |
  BAN_MEMBERS |
  TIMEOUT_MEMBERS |
  MANAGE_CHANNELS;

const ADMIN_ROLE_PERMISSIONS =
  MANAGE_SERVER | MANAGE_ROLES | MANAGE_CHANNELS | BAN_MEMBERS | KICK_MEMBERS;

const VIP_PERMISSIONS =
  DEFAULT_EVERYONE_PERMISSIONS | MENTION_EVERYONE | PRIORITY_SPEAKER;

/** Datum vor `days` Tagen, zur angegebenen Uhrzeit (lokale Serverzeit). */
function daysAgo(days: number, hour = 12, minute = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function main(): Promise<void> {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@nexa.local' },
  });
  if (existingAdmin) {
    // Demo-Daten bleiben unverändert; nur die Start-Invite-Codes und die
    // Demo-Abzeichen werden auch bei bestehenden Installationen
    // nachgelegt (Registrierungs-Gate bzw. Abzeichen-System).
    await ensureStarterInviteCodes(existingAdmin.id);
    const byEmail = async (email: string) =>
      (await prisma.user.findUnique({ where: { email }, select: { id: true } }))?.id ?? null;
    await ensureSeedBadges({
      adminId: existingAdmin.id,
      lenaId: await byEmail('lena@nexa.local'),
      maxId: await byEmail('max@nexa.local'),
      miaId: await byEmail('mia@nexa.local'),
      jonasId: await byEmail('jonas@nexa.local'),
      botId: await byEmail('helper@bots.nexa.local'),
    });
    console.log(
      'Seed übersprungen: admin@nexa.local existiert bereits (idempotent). Start-Invite-Codes und Demo-Abzeichen geprüft/angelegt.',
    );
    return;
  }

  const [adminHash, demoHash, botTokenHash] = await Promise.all([
    bcrypt.hash(ADMIN_PASSWORD, BCRYPT_COST),
    bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST),
    bcrypt.hash(DEMO_BOT_TOKEN, BCRYPT_COST),
  ]);
  const now = new Date();

  // ─── Nutzer ────────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      email: 'admin@nexa.local',
      username: 'nexaadmin',
      displayName: 'Nexa Admin',
      passwordHash: adminHash,
      dateOfBirth: new Date('1995-05-10T00:00:00.000Z'),
      emailVerifiedAt: now,
      tutorialSeenAt: now, // Demo-Konten sind „Bestand“ – kein Auto-Tutorial
      verified: true,
      isPlatformAdmin: true,
      status: PresenceStatus.ONLINE,
      customStatusText: 'Baue gerade an Nexa 🚀',
      about: 'Plattform-Admin des Demo-Servers.',
    },
  });

  // Start-Invite-Codes für das Registrierungs-Gate (siehe Konstante oben).
  await ensureStarterInviteCodes(admin.id);

  const lena = await prisma.user.create({
    data: {
      email: 'lena@nexa.local',
      username: 'lena',
      displayName: 'Lena',
      passwordHash: demoHash,
      dateOfBirth: new Date('1998-03-14T00:00:00.000Z'),
      emailVerifiedAt: now,
      tutorialSeenAt: now,
      status: PresenceStatus.ONLINE,
      customStatusText: 'Im Lernmodus 📚',
      customStatusEmoji: '🎧',
      pronouns: 'sie/ihr',
      about: 'Informatik-Studentin, mag Strategie-Spiele und lange Lernnächte.',
    },
  });

  const max = await prisma.user.create({
    data: {
      email: 'max@nexa.local',
      username: 'max',
      displayName: 'Max',
      passwordHash: demoHash,
      dateOfBirth: new Date('2001-07-22T00:00:00.000Z'),
      emailVerifiedAt: now,
      tutorialSeenAt: now,
      status: PresenceStatus.IDLE,
      customStatusText: 'Kurz afk ☕',
      pronouns: 'er/ihn',
      about: 'Moderator im Gaming Hub. Sprich mich an, wenn etwas klemmt.',
    },
  });

  const mia = await prisma.user.create({
    data: {
      email: 'mia@nexa.local',
      username: 'mia',
      displayName: 'Mia',
      passwordHash: demoHash,
      dateOfBirth: new Date('2003-11-02T00:00:00.000Z'),
      emailVerifiedAt: now,
      tutorialSeenAt: now,
      verified: true,
      status: PresenceStatus.DND,
      customStatusText: 'Bitte nicht stören – Aufnahme läuft 🎙️',
      pronouns: 'sie/ihr',
      about: 'Macht Musik, schneidet Videos und hängt auf der Bühne ab.',
    },
  });

  const jonas = await prisma.user.create({
    data: {
      email: 'jonas@nexa.local',
      username: 'jonas',
      displayName: 'Jonas',
      passwordHash: demoHash,
      dateOfBirth: new Date('2004-01-30T00:00:00.000Z'),
      emailVerifiedAt: now,
      tutorialSeenAt: now,
      status: PresenceStatus.INVISIBLE,
      about: 'Neuling bei Nexa. Hauptsächlich zum Zocken hier.',
    },
  });

  // ─── Bot-Nutzer + BotAccount ───────────────────────────────────────────
  const botUser = await prisma.user.create({
    data: {
      email: 'helper@bots.nexa.local',
      username: 'nexa-helper',
      displayName: 'Nexa Helper',
      passwordHash: null,
      dateOfBirth: new Date('2020-01-01T00:00:00.000Z'),
      emailVerifiedAt: now,
      tutorialSeenAt: now,
      isBot: true,
      status: PresenceStatus.ONLINE,
      customStatusText: 'Ich helfe, wo ich kann 🤖',
      about: 'Demo-Bot von Nexa. Zeigt, wie Bots und Webhooks funktionieren.',
    },
  });

  await prisma.botAccount.create({
    data: {
      botUserId: botUser.id,
      ownerId: admin.id,
      tokenHash: botTokenHash,
      tokenPrefix: DEMO_BOT_TOKEN.slice(0, 12),
      description: 'Demo-Bot für lokale Entwicklung.',
    },
  });

  // Demo-Abzeichen: Admin = Owner, Demo-Nutzer = Beta-Teilnehmer.
  await ensureSeedBadges({
    adminId: admin.id,
    lenaId: lena.id,
    maxId: max.id,
    miaId: mia.id,
    jonasId: jonas.id,
    botId: botUser.id,
  });

  // ─── Server 1: Nexa Gaming Hub ─────────────────────────────────────────
  const gamingHub = await prisma.server.create({
    data: {
      name: 'Nexa Gaming Hub',
      description:
        'Der offizielle Demo-Server von Nexa: Gaming, Community und Support an einem Ort.',
      ownerId: admin.id,
      isPublic: true,
      category: 'Gaming',
      verificationLevel: VerificationLevel.EMAIL,
      requireRulesAccept: true,
      rulesText:
        '1. Sei respektvoll – kein Mobbing, keine Beleidigungen.\n' +
        '2. Kein Spam und keine unerlaubte Werbung.\n' +
        '3. Keine illegalen oder nicht jugendfreien Inhalte.\n' +
        '4. Halte dich an die Themen der Kanäle und an Anweisungen des Teams.',
      welcomeMessage:
        'Willkommen im Nexa Gaming Hub, {user}! 🎉 Lies dir kurz die Regeln durch, bestätige sie und schau in #allgemein vorbei.',
      automodEnabled: true,
      bannedWords: [],
      automodBlockLinks: false,
      automodMaxMentions: 5,
      automodSpamLimit: 5,
    },
  });

  const everyoneRole = await prisma.role.create({
    data: {
      serverId: gamingHub.id,
      name: '@everyone',
      color: '#99AAB5',
      position: 0,
      permissions: DEFAULT_EVERYONE_PERMISSIONS,
      isDefault: true,
      mentionable: false,
      hoist: false,
    },
  });

  const verifiedRole = await prisma.role.create({
    data: {
      serverId: gamingHub.id,
      name: 'Verifiziert',
      color: '#38BDF8',
      position: 1,
      permissions: DEFAULT_EVERYONE_PERMISSIONS,
      mentionable: false,
      hoist: false,
    },
  });

  const vipRole = await prisma.role.create({
    data: {
      serverId: gamingHub.id,
      name: 'VIP',
      color: '#EC4899',
      position: 2,
      permissions: VIP_PERMISSIONS,
      mentionable: true,
      hoist: true,
    },
  });

  const moderatorRole = await prisma.role.create({
    data: {
      serverId: gamingHub.id,
      name: 'Moderator',
      color: '#4ADE80',
      position: 3,
      permissions: MODERATOR_PERMISSIONS,
      mentionable: true,
      hoist: true,
    },
  });

  const adminRole = await prisma.role.create({
    data: {
      serverId: gamingHub.id,
      name: 'Admin',
      color: '#F59E0B',
      position: 4,
      permissions: ADMIN_ROLE_PERMISSIONS,
      mentionable: true,
      hoist: true,
    },
  });

  // Mitglieder des Gaming Hub: Admin (Owner), alle Demo-Nutzer, der Bot.
  const hubMembers = new Map<string, string>(); // userId -> memberId
  const addHubMember = async (
    userId: string,
    extraRoleIds: string[] = [],
  ): Promise<void> => {
    const member = await prisma.member.create({
      data: {
        serverId: gamingHub.id,
        userId,
        rulesAcceptedAt: now,
        isVerifiedByButton: extraRoleIds.includes(verifiedRole.id),
      },
    });
    hubMembers.set(userId, member.id);
    const roleIds = [everyoneRole.id, ...extraRoleIds];
    for (const roleId of roleIds) {
      await prisma.memberRole.create({ data: { memberId: member.id, roleId } });
    }
  };
  await addHubMember(admin.id, [adminRole.id, verifiedRole.id]);
  await addHubMember(lena.id, [adminRole.id, verifiedRole.id]);
  await addHubMember(max.id, [moderatorRole.id, verifiedRole.id]);
  await addHubMember(mia.id, [vipRole.id, verifiedRole.id]);
  await addHubMember(jonas.id, [verifiedRole.id]);
  await addHubMember(botUser.id, []);

  // Kategorien + Kanäle.
  const textCategory = await prisma.channelCategory.create({
    data: { serverId: gamingHub.id, name: 'Textkanäle', position: 0 },
  });
  const communityCategory = await prisma.channelCategory.create({
    data: { serverId: gamingHub.id, name: 'Community', position: 1 },
  });
  const voiceCategory = await prisma.channelCategory.create({
    data: { serverId: gamingHub.id, name: 'Sprachkanäle', position: 2 },
  });

  const announcements = await prisma.channel.create({
    data: {
      serverId: gamingHub.id,
      categoryId: textCategory.id,
      name: 'ankündigungen',
      type: ChannelType.ANNOUNCEMENT,
      topic: 'Offizielle Neuigkeiten rund um Nexa und den Server.',
      position: 0,
    },
  });
  const hubGeneral = await prisma.channel.create({
    data: {
      serverId: gamingHub.id,
      categoryId: textCategory.id,
      name: 'allgemein',
      type: ChannelType.TEXT,
      topic: 'Der Hauptkanal: Quatschen, Fragen, Memes (in Maßen).',
      position: 1,
    },
  });
  const media = await prisma.channel.create({
    data: {
      serverId: gamingHub.id,
      categoryId: textCategory.id,
      name: 'medien',
      type: ChannelType.TEXT,
      topic: 'Screenshots, Clips und Links zu euren besten Momenten.',
      position: 2,
    },
  });
  const introduction = await prisma.channel.create({
    data: {
      serverId: gamingHub.id,
      categoryId: communityCategory.id,
      name: 'vorstellung',
      type: ChannelType.FORUM,
      topic: 'Stell dich der Community vor – ein Thread pro Person.',
      position: 0,
    },
  });
  const support = await prisma.channel.create({
    data: {
      serverId: gamingHub.id,
      categoryId: communityCategory.id,
      name: 'support',
      type: ChannelType.TEXT,
      topic: 'Hilfe bei Problemen: erst suchen, dann hier fragen.',
      position: 1,
    },
  });
  await prisma.channel.create({
    data: {
      serverId: gamingHub.id,
      categoryId: voiceCategory.id,
      name: 'lounge',
      type: ChannelType.VOICE,
      topic: 'Offener Sprachkanal für alle.',
      position: 0,
    },
  });
  await prisma.channel.create({
    data: {
      serverId: gamingHub.id,
      categoryId: voiceCategory.id,
      name: 'team-talk',
      type: ChannelType.VOICE,
      topic: 'Absprachen fürs nächste Match.',
      position: 1,
    },
  });
  await prisma.channel.create({
    data: {
      serverId: gamingHub.id,
      categoryId: voiceCategory.id,
      name: 'Bühne',
      type: ChannelType.STAGE,
      topic: 'Events, Turnier-Kommentare und Community-Abende.',
      position: 2,
    },
  });

  // Verifizierungsrolle + Willkommens-/Systemkanal nachträglich verknüpfen.
  await prisma.server.update({
    where: { id: gamingHub.id },
    data: {
      verificationRoleId: verifiedRole.id,
      welcomeChannelId: hubGeneral.id,
      systemChannelId: hubGeneral.id,
    },
  });

  // Eigene Emojis (Twemoji-Grafiken per CDN).
  await prisma.customEmoji.createMany({
    data: [
      {
        serverId: gamingHub.id,
        name: 'feier',
        imageUrl:
          'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f389.png',
        createdById: admin.id,
      },
      {
        serverId: gamingHub.id,
        name: 'herz',
        imageUrl:
          'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2764.png',
        createdById: lena.id,
      },
      {
        serverId: gamingHub.id,
        name: 'rakete',
        imageUrl:
          'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f680.png',
        createdById: max.id,
      },
    ],
  });

  // Nachrichten in #allgemein (Markdown-Demos, Erwähnungen, Pin).
  const welcomeMessage = await prisma.message.create({
    data: {
      channelId: hubGeneral.id,
      authorId: admin.id,
      content:
        '👋 **Willkommen im Nexa Gaming Hub!**\n\n' +
        'Hier tauschen wir uns über Spiele, Events und alles rund um Nexa aus. ' +
        'Lies bitte die **Serverregeln** (beim Beitritt angezeigt) und stell dich in #vorstellung vor.',
      pinned: true,
      createdAt: daysAgo(6, 10, 0),
    },
  });
  const markdownDemo = await prisma.message.create({
    data: {
      channelId: hubGeneral.id,
      authorId: lena.id,
      content:
        'Kurze Markdown-Demo: **fett**, *kursiv*, __unterstrichen__, ~~durchgestrichen~~ ' +
        'und ein Spoiler: ||Der Boss fällt beim dritten Versuch um.||\n\n' +
        '> Zitate gehen natürlich auch.',
      createdAt: daysAgo(6, 10, 5),
    },
  });
  const codeDemo = await prisma.message.create({
    data: {
      channelId: hubGeneral.id,
      authorId: max.id,
      content:
        'Für alle, die ihren Rang lieber selbst berechnen:\n\n' +
        '```ts\nconst punkte = [120, 95, 140];\nconst summe = punkte.reduce((a, b) => a + b, 0);\nconsole.log("Gesamt:", summe);\n```\n\n' +
        'Funktioniert einfach mit `reduce`.',
      createdAt: daysAgo(5, 18, 20),
    },
  });
  await prisma.message.create({
    data: {
      channelId: hubGeneral.id,
      authorId: mia.id,
      content:
        `Hey <@${lena.id}>, schaffst du es heute Abend zur Turnier-Runde in der Lounge? 🎮`,
      mentionUserIds: [lena.id],
      createdAt: daysAgo(5, 18, 32),
    },
  });
  const lenaAnswer = await prisma.message.create({
    data: {
      channelId: hubGeneral.id,
      authorId: lena.id,
      content: 'Bin dabei! Muss nur vorher die Lernsession im anderen Server beenden. 📚',
      createdAt: daysAgo(5, 18, 35),
    },
  });
  await prisma.message.create({
    data: {
      channelId: hubGeneral.id,
      authorId: jonas.id,
      content:
        'Hallo zusammen, ich bin neu hier – danke für die nette Begrüßung! 🙌',
      createdAt: daysAgo(4, 20, 12),
    },
  });
  const linkMessage = await prisma.message.create({
    data: {
      channelId: hubGeneral.id,
      authorId: admin.id,
      content:
        'Die Projektseite findet ihr hier: https://nexa.local – dort stehen auch die Demo-Zugänge und der Schnellstart.',
      createdAt: daysAgo(4, 21, 0),
    },
  });
  const eventMessage = await prisma.message.create({
    data: {
      channelId: hubGeneral.id,
      authorId: mia.id,
      content:
        `Turnier am Samstag ab 19 Uhr auf der Bühne! <@${max.id}> moderiert, Preise gibt es auch 🏆`,
      mentionUserIds: [max.id],
      createdAt: daysAgo(3, 15, 45),
    },
  });
  await prisma.message.create({
    data: {
      channelId: hubGeneral.id,
      authorId: botUser.id,
      content:
        '🤖 Ich bin der Nexa Helper, ein Demo-Bot. In der README steht, wie Bots und Webhooks funktionieren.',
      createdAt: daysAgo(2, 9, 15),
    },
  });
  const latestMessage = await prisma.message.create({
    data: {
      channelId: hubGeneral.id,
      authorId: lena.id,
      content: 'GG gestern an alle – das Finale war richtig knapp! 🔥',
      createdAt: daysAgo(0, 9, 5),
    },
  });

  // Reaktionen auf einige Nachrichten.
  await prisma.reaction.createMany({
    data: [
      { messageId: welcomeMessage.id, userId: lena.id, emoji: '👋' },
      { messageId: welcomeMessage.id, userId: max.id, emoji: '👋' },
      { messageId: welcomeMessage.id, userId: jonas.id, emoji: '🎉' },
      { messageId: markdownDemo.id, userId: mia.id, emoji: '❤️' },
      { messageId: codeDemo.id, userId: lena.id, emoji: '🚀' },
      { messageId: linkMessage.id, userId: jonas.id, emoji: '👍' },
      { messageId: eventMessage.id, userId: lena.id, emoji: '🏆' },
      { messageId: eventMessage.id, userId: jonas.id, emoji: '🏆' },
      { messageId: latestMessage.id, userId: mia.id, emoji: '🔥' },
      { messageId: latestMessage.id, userId: max.id, emoji: '🔥' },
      { messageId: lenaAnswer.id, userId: mia.id, emoji: '👍' },
    ],
  });

  // Eine Ankündigung und je eine Nachricht in #medien / #support.
  await prisma.message.create({
    data: {
      channelId: announcements.id,
      authorId: admin.id,
      content:
        '📢 **Server-Update:** Der Nexa Gaming Hub hat jetzt eine Bühne für Events und ein Forum für Vorstellungen. Viel Spaß!',
      createdAt: daysAgo(3, 12, 0),
    },
  });
  await prisma.message.create({
    data: {
      channelId: media.id,
      authorId: jonas.id,
      content: 'Mein bester Screenshot diese Woche – kurz vor dem Sieg erwischt 📸',
      createdAt: daysAgo(2, 22, 40),
    },
  });
  await prisma.message.create({
    data: {
      channelId: support.id,
      authorId: max.id,
      content:
        'Kurz zur Info: Wenn Sprache im Voice-Chat nicht startet, prüft zuerst, ob Nexa im Browser Mikrofon-Zugriff hat. 🎙️',
      createdAt: daysAgo(1, 11, 30),
    },
  });

  // Thread in #vorstellung mit Ausgangsnachricht.
  const introStarter = await prisma.message.create({
    data: {
      channelId: introduction.id,
      authorId: lena.id,
      content:
        'Hallo zusammen, ich bin Lena 👋 Ich studiere Informatik, spiele am liebsten Strategie- und Koop-Spiele und moderiere nebenbei die Lerngruppe.',
      createdAt: daysAgo(5, 12, 0),
    },
  });
  const introThread = await prisma.channel.create({
    data: {
      serverId: gamingHub.id,
      categoryId: communityCategory.id,
      name: 'vorstellung-lena',
      type: ChannelType.THREAD,
      parentChannelId: introduction.id,
      starterMessageId: introStarter.id,
      position: 0,
      createdAt: daysAgo(5, 12, 0),
    },
  });
  await prisma.message.create({
    data: {
      channelId: introThread.id,
      authorId: mia.id,
      content: 'Willkommen, Lena! Schön, dass du da bist 💚',
      createdAt: daysAgo(5, 12, 20),
    },
  });
  await prisma.message.create({
    data: {
      channelId: introThread.id,
      authorId: jonas.id,
      content: 'Hi Lena! Vielleicht sieht man sich mal in der Lounge.',
      createdAt: daysAgo(5, 13, 5),
    },
  });

  // Einladungen für den Gaming Hub.
  await prisma.invite.create({
    data: {
      code: 'nexa-start',
      serverId: gamingHub.id,
      channelId: hubGeneral.id,
      createdById: admin.id,
      maxUses: 0,
      expiresAt: null,
    },
  });
  await prisma.invite.create({
    data: {
      code: 'gaming2026',
      serverId: gamingHub.id,
      channelId: hubGeneral.id,
      createdById: admin.id,
      maxUses: 50,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // ─── Server 2: Lerngruppe Informatik ───────────────────────────────────
  const studyServer = await prisma.server.create({
    data: {
      name: 'Lerngruppe Informatik',
      description:
        'Gemeinsam lernen statt allein verzweifeln: Fragen, Materialien und feste Lernrunden.',
      ownerId: lena.id,
      isPublic: true,
      category: 'Lerngruppe',
      verificationLevel: VerificationLevel.NONE,
      automodEnabled: true,
      automodMaxMentions: 5,
      automodSpamLimit: 5,
    },
  });
  const studyEveryone = await prisma.role.create({
    data: {
      serverId: studyServer.id,
      name: '@everyone',
      color: '#99AAB5',
      position: 0,
      permissions: DEFAULT_EVERYONE_PERMISSIONS,
      isDefault: true,
      mentionable: false,
    },
  });
  for (const user of [lena, max, mia, jonas]) {
    const member = await prisma.member.create({
      data: { serverId: studyServer.id, userId: user.id },
    });
    await prisma.memberRole.create({
      data: { memberId: member.id, roleId: studyEveryone.id },
    });
  }
  const studyCategory = await prisma.channelCategory.create({
    data: { serverId: studyServer.id, name: 'Lernen', position: 0 },
  });
  const studyGeneral = await prisma.channel.create({
    data: {
      serverId: studyServer.id,
      categoryId: studyCategory.id,
      name: 'allgemein',
      type: ChannelType.TEXT,
      topic: 'Alles rund um die Lerngruppe.',
      position: 0,
    },
  });
  const studyQuestions = await prisma.channel.create({
    data: {
      serverId: studyServer.id,
      categoryId: studyCategory.id,
      name: 'fragen',
      type: ChannelType.TEXT,
      topic: 'Verständnisfragen zu Vorlesung und Übungsblättern.',
      position: 1,
    },
  });
  const studyMaterial = await prisma.channel.create({
    data: {
      serverId: studyServer.id,
      categoryId: studyCategory.id,
      name: 'lernmaterial',
      type: ChannelType.TEXT,
      topic: 'Zusammenfassungen, Links und Übungsaufgaben.',
      position: 2,
    },
  });
  await prisma.channel.create({
    data: {
      serverId: studyServer.id,
      categoryId: studyCategory.id,
      name: 'gemeinsam-lernen',
      type: ChannelType.VOICE,
      topic: 'Stiller Lernraum mit Kamera an, Mikro aus.',
      position: 3,
    },
  });
  await prisma.message.create({
    data: {
      channelId: studyGeneral.id,
      authorId: lena.id,
      content:
        'Willkommen in der Lerngruppe! 🎓 Lernrunden sind immer **dienstags und donnerstags ab 18 Uhr** im Sprachkanal.',
      pinned: true,
      createdAt: daysAgo(6, 9, 0),
    },
  });
  await prisma.message.create({
    data: {
      channelId: studyQuestions.id,
      authorId: max.id,
      content:
        'Kann mir jemand den Unterschied zwischen `interface` und `type` in TypeScript an einem Beispiel erklären?',
      createdAt: daysAgo(2, 17, 10),
    },
  });
  await prisma.message.create({
    data: {
      channelId: studyQuestions.id,
      authorId: lena.id,
      content:
        'Kurz: Beides beschreibt Objektformen. `interface` ist erweiterbar (Declaration Merging), `type` kann auch Unions und Aliase abbilden. Für API-Modelle nehmen wir hier meist `interface`.',
      createdAt: daysAgo(2, 17, 25),
    },
  });
  await prisma.message.create({
    data: {
      channelId: studyMaterial.id,
      authorId: mia.id,
      content:
        'Ich habe meine Zusammenfassung zu Datenbanken hochgeladen – Normalformen sind auf Seite 3 ganz gut erklärt. 📄',
      createdAt: daysAgo(1, 14, 0),
    },
  });

  // ─── Server 3: Freunde & Chill ─────────────────────────────────────────
  const friendsServer = await prisma.server.create({
    data: {
      name: 'Freunde & Chill',
      description: 'Kleiner privater Server für den Freundeskreis.',
      ownerId: max.id,
      isPublic: false,
      category: 'Freunde',
      verificationLevel: VerificationLevel.NONE,
      automodEnabled: true,
      automodMaxMentions: 5,
      automodSpamLimit: 5,
    },
  });
  const friendsEveryone = await prisma.role.create({
    data: {
      serverId: friendsServer.id,
      name: '@everyone',
      color: '#99AAB5',
      position: 0,
      permissions: DEFAULT_EVERYONE_PERMISSIONS,
      isDefault: true,
      mentionable: false,
    },
  });
  for (const user of [admin, lena, max, mia, jonas]) {
    const member = await prisma.member.create({
      data: { serverId: friendsServer.id, userId: user.id },
    });
    await prisma.memberRole.create({
      data: { memberId: member.id, roleId: friendsEveryone.id },
    });
  }
  const friendsChat = await prisma.channel.create({
    data: {
      serverId: friendsServer.id,
      name: 'chat',
      type: ChannelType.TEXT,
      topic: 'Einfach quatschen.',
      position: 0,
    },
  });
  await prisma.channel.create({
    data: {
      serverId: friendsServer.id,
      name: 'chill-lounge',
      type: ChannelType.VOICE,
      topic: 'Entspannt zusammen abhängen.',
      position: 1,
    },
  });
  await prisma.message.create({
    data: {
      channelId: friendsChat.id,
      authorId: max.id,
      content: 'Server steht! 🎉 Nur für uns, keine Fremden, keine Regeln außer: nett sein.',
      pinned: true,
      createdAt: daysAgo(4, 19, 0),
    },
  });
  await prisma.message.create({
    data: {
      channelId: friendsChat.id,
      authorId: mia.id,
      content: 'Filmabend am Freitag? Ich bringe die Playlist mit 🍿',
      createdAt: daysAgo(1, 20, 30),
    },
  });

  // ─── Freundschaften ────────────────────────────────────────────────────
  await prisma.friendship.createMany({
    data: [
      {
        requesterId: lena.id,
        addresseeId: max.id,
        status: FriendshipStatus.ACCEPTED,
      },
      {
        requesterId: lena.id,
        addresseeId: mia.id,
        status: FriendshipStatus.ACCEPTED,
      },
      {
        requesterId: jonas.id,
        addresseeId: lena.id,
        status: FriendshipStatus.PENDING,
      },
      {
        requesterId: mia.id,
        addresseeId: jonas.id,
        status: FriendshipStatus.ACCEPTED,
      },
    ],
  });

  // ─── DMs: Lena & Max ───────────────────────────────────────────────────
  const dmChannel = await prisma.channel.create({
    data: {
      name: 'dm-lena-max',
      type: ChannelType.DM,
      position: 0,
    },
  });
  await prisma.dmParticipant.createMany({
    data: [
      { channelId: dmChannel.id, userId: lena.id },
      { channelId: dmChannel.id, userId: max.id },
    ],
  });
  await prisma.message.create({
    data: {
      channelId: dmChannel.id,
      authorId: max.id,
      content: 'Hey Lena, hast du die Notizen von gestern noch? 📝',
      createdAt: daysAgo(1, 16, 5),
    },
  });
  await prisma.message.create({
    data: {
      channelId: dmChannel.id,
      authorId: lena.id,
      content: 'Klar! Ich lade sie gleich in #lernmaterial hoch.',
      createdAt: daysAgo(1, 16, 8),
    },
  });
  await prisma.message.create({
    data: {
      channelId: dmChannel.id,
      authorId: max.id,
      content: 'Perfekt, danke dir! 🙏',
      createdAt: daysAgo(1, 16, 9),
    },
  });

  // ─── Gruppen-DM: Lena, Max & Mia ───────────────────────────────────────
  const groupDmChannel = await prisma.channel.create({
    data: {
      name: 'Lena, Max & Mia',
      type: ChannelType.GROUP_DM,
      position: 0,
    },
  });
  await prisma.dmParticipant.createMany({
    data: [
      { channelId: groupDmChannel.id, userId: lena.id },
      { channelId: groupDmChannel.id, userId: max.id },
      { channelId: groupDmChannel.id, userId: mia.id },
    ],
  });
  await prisma.message.create({
    data: {
      channelId: groupDmChannel.id,
      authorId: mia.id,
      content: 'Leute, Samstag Turnier – seid ihr beide am Start? 🏆',
      createdAt: daysAgo(2, 13, 0),
    },
  });
  await prisma.message.create({
    data: {
      channelId: groupDmChannel.id,
      authorId: lena.id,
      content: 'Ich bin dabei! Max moderiert doch, oder? 😄',
      createdAt: daysAgo(2, 13, 4),
    },
  });

  // ─── Zusammenfassung ───────────────────────────────────────────────────
  const [userCount, serverCount, channelCount, messageCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.server.count(),
      prisma.channel.count(),
      prisma.message.count(),
    ]);
  console.log('Seed abgeschlossen:');
  console.log(`  Nutzer:    ${userCount} (inkl. Admin + Bot "nexa-helper")`);
  console.log(`  Server:    ${serverCount} (Nexa Gaming Hub, Lerngruppe Informatik, Freunde & Chill)`);
  console.log(`  Kanäle:    ${channelCount} (inkl. Thread + DMs)`);
  console.log(`  Nachrichten: ${messageCount}`);
  console.log(
    `  Bot-Token: Prefix "${DEMO_BOT_TOKEN.slice(0, 12)}" (vollständiges Demo-Token siehe README, Abschnitt "Demo-Konten")`,
  );
  console.log('  Demo-Logins: siehe README, Abschnitt "Demo-Konten".');
}

main()
  .catch((error: unknown) => {
    console.error('Seed fehlgeschlagen:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
