/**
 * Zod-Schemas für alle API-Eingaben. Backend validiert damit Requests,
 * das Frontend nutzt dieselben Schemas für Formulare – eine Quelle der Wahrheit.
 */
import { z } from 'zod';
import { SERVER_CATEGORIES } from './types';
import { BADGE_KEYS } from './badges';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

/** Nutzername: wird vor der Prüfung in Kleinbuchstaben normalisiert. */
export const usernameSchema = z
  .string()
  .transform((value) => value.toLowerCase())
  .refine((value) => /^[a-z0-9_.]{2,32}$/.test(value), {
    message:
      'Nutzername: 2–32 Zeichen, nur Kleinbuchstaben, Ziffern, "_" und ".".',
  });

const urlOrEmptySchema = z.union([z.string().url(), z.literal('')]);

// ─── Auth ────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email().max(254),
  username: usernameSchema,
  displayName: z.string().min(1).max(80),
  password: z.string().min(8).max(128),
  dateOfBirth: z.coerce
    .date()
    .refine((date) => !Number.isNaN(date.getTime()) && date < new Date(), {
      message: 'Geburtsdatum muss in der Vergangenheit liegen.',
    }),
  /**
   * Plattform-Invite-Code: Pflicht für jede Kontoerstellung. Im Schema
   * optional, damit fehlende/ungültige Codes serverseitig einheitlich mit
   * den Fehlercodes INVITE_REQUIRED / INVITE_INVALID beantwortet werden
   * (Prüfung + atomares Verbrauchen passiert im Auth-Service).
   */
  platformInviteCode: z.string().trim().min(1).max(64).optional(),
});

/** Ein Abzeichen durch einen Plattform-Admin vergeben (Schlüssel aus dem Katalog). */
export const grantBadgeSchema = z.object({
  badgeKey: z.enum(BADGE_KEYS as [string, ...string[]]),
});

/** Plattform-Invite-Codes durch einen Plattform-Admin erzeugen (auch Batch). */
export const createPlatformInvitesSchema = z.object({
  count: z.number().int().min(1).max(100).default(1),
  maxUses: z.number().int().min(1).max(1000).default(1),
  expiresAt: z.coerce.date().optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
  captchaToken: z.string().optional(),
  twoFactorCode: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

// ─── Server ──────────────────────────────────────────────────────────────

export const serverTemplateSchema = z.enum([
  'gaming',
  'friends',
  'study',
  'blank',
]);

export const createServerSchema = z.object({
  name: z.string().min(2).max(100),
  category: z.enum(SERVER_CATEGORIES),
  template: serverTemplateSchema.optional(),
  isPublic: z.boolean().optional(),
  description: z.string().max(1000).optional(),
});

export const updateServerSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  category: z.enum(SERVER_CATEGORIES).optional(),
  isPublic: z.boolean().optional(),
  iconUrl: urlOrEmptySchema.optional(),
  bannerUrl: urlOrEmptySchema.optional(),
});

export const updateServerSettingsSchema = z.object({
  verificationLevel: z
    .enum(['NONE', 'EMAIL', 'ACCOUNT_AGE', 'MEMBER_AGE', 'PHONE'])
    .optional(),
  accountAgeMinutes: z.number().int().min(0).max(43200).optional(),
  memberAgeMinutes: z.number().int().min(0).max(43200).optional(),
  rulesText: z.string().max(4000).nullable().optional(),
  requireRulesAccept: z.boolean().optional(),
  welcomeMessage: z.string().max(2000).nullable().optional(),
  welcomeChannelId: z.string().nullable().optional(),
  systemChannelId: z.string().nullable().optional(),
  verificationRoleId: z.string().nullable().optional(),
  automodEnabled: z.boolean().optional(),
  bannedWords: z.array(z.string().max(40)).max(200).optional(),
  automodBlockLinks: z.boolean().optional(),
  automodMaxMentions: z.number().int().min(1).max(50).optional(),
  automodSpamLimit: z.number().int().min(2).max(20).optional(),
});

/** Persönlichen Server-Favoriten setzen/entfernen (nur für Mitglieder). */
export const setServerFavoriteSchema = z.object({
  favorite: z.boolean(),
});

// ─── Kategorien & Kanäle ─────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  position: z.number().int().optional(),
});

const channelTypeSchema = z.enum([
  'TEXT',
  'VOICE',
  'ANNOUNCEMENT',
  'FORUM',
  'STAGE',
]);

const createChannelBaseSchema = z.object({
  name: z.string().min(1).max(100),
  type: channelTypeSchema,
  categoryId: z.string().nullable().optional(),
  topic: z.string().max(1024).optional(),
  slowmodeSeconds: z.number().int().min(0).max(21600).optional().default(0),
  nsfw: z.boolean().optional().default(false),
  isPrivate: z.boolean().optional().default(false),
  position: z.number().int().optional(),
});

/**
 * Textartige Kanäle müssen Slug-Namen tragen (Kleinbuchstaben, Ziffern,
 * Bindestriche); Sprach-/Stage-Kanäle dürfen auch Leerzeichen enthalten.
 */
export const createChannelSchema = createChannelBaseSchema.superRefine(
  (value, ctx) => {
    if (
      (value.type === 'TEXT' ||
        value.type === 'ANNOUNCEMENT' ||
        value.type === 'FORUM') &&
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.name)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message:
          'Textkanäle: nur Kleinbuchstaben, Ziffern und Bindestriche im Namen.',
      });
    }
  },
);

export const updateChannelSchema = createChannelBaseSchema
  .partial()
  .extend({
    archived: z.boolean().optional(),
  });

// ─── Nachrichten ─────────────────────────────────────────────────────────

export const attachmentInputSchema = z.object({
  fileName: z.string().min(1).max(255),
  url: z.string().min(1),
  storageKey: z.string().min(1),
  contentType: z.string().min(1).max(255),
  size: z.number().int().min(0).max(MAX_UPLOAD_BYTES),
});

export const sendMessageSchema = z
  .object({
    content: z.string().max(4000).optional().default(''),
    attachments: z.array(attachmentInputSchema).max(10).optional(),
    replyToId: z.string().optional(),
    nonce: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const hasContent = (value.content ?? '').trim().length > 0;
    const hasAttachments =
      value.attachments !== undefined && value.attachments.length > 0;
    if (!hasContent && !hasAttachments) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'Nachricht braucht Text oder mindestens einen Anhang.',
      });
    }
  });

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

// ─── Rollen ──────────────────────────────────────────────────────────────

/** Rechte als Dezimal-String eines BigInt-Bitfelds ODER als Namen-Liste. */
export const rolePermissionsInputSchema = z.union([
  z.string().regex(/^\d+$/, 'Rechte müssen eine Dezimalzahl sein.'),
  z.array(z.string().min(1)),
]);

export const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Farbe als #RRGGBB angeben.'),
  icon: z.string().max(16).optional(),
  permissions: rolePermissionsInputSchema,
  hoist: z.boolean().optional().default(false),
  mentionable: z.boolean().optional().default(true),
});

export const updateRoleSchema = createRoleSchema.partial().extend({
  position: z.number().int().optional(),
});

// ─── Einladungen ─────────────────────────────────────────────────────────

export const createInviteSchema = z.object({
  maxUses: z.number().int().min(0).max(100).optional().default(0),
  maxAgeMinutes: z
    .number()
    .int()
    .min(0)
    .max(10080)
    .optional()
    .default(0),
  channelId: z.string().optional(),
});

// ─── Freunde & Profil ────────────────────────────────────────────────────

export const friendRequestSchema = z.object({
  username: usernameSchema,
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  about: z.string().max(1000).nullable().optional(),
  pronouns: z.string().max(40).nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  customStatusText: z.string().max(128).nullable().optional(),
  customStatusEmoji: z.string().max(16).nullable().optional(),
  locale: z.enum(['de', 'en']).optional(),
  theme: z.enum(['dark', 'light']).optional(),
  // Onboarding-Tutorial: true = Tour als gesehen markieren, false = zurücksetzen.
  tutorialSeen: z.boolean().optional(),
});

export const updatePrivacySchema = z.object({
  dmPrivacy: z.enum(['EVERYONE', 'FRIENDS', 'NONE']).optional(),
  friendRequestPrivacy: z
    .enum(['EVERYONE', 'FRIENDS_OF_FRIENDS', 'NONE'])
    .optional(),
});

// ─── Meldungen, Bots, Webhooks ───────────────────────────────────────────

export const reportSchema = z.object({
  targetType: z.enum(['MESSAGE', 'USER', 'SERVER']),
  targetId: z.string().min(1),
  serverId: z.string().optional(),
  reason: z.string().min(5).max(1000),
});

export const createBotSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
});

export const createWebhookSchema = z.object({
  name: z.string().min(1).max(80),
  avatarUrl: z.string().optional(),
});

// ─── Abgeleitete Eingabe-Typen ───────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateServerInput = z.infer<typeof createServerSchema>;
export type UpdateServerInput = z.infer<typeof updateServerSchema>;
export type UpdateServerSettingsInput = z.infer<
  typeof updateServerSettingsSchema
>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type SetServerFavoriteInput = z.infer<typeof setServerFavoriteSchema>;
export type FriendRequestInput = z.infer<typeof friendRequestSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePrivacyInput = z.infer<typeof updatePrivacySchema>;
export type ReportInput = z.infer<typeof reportSchema>;
export type CreateBotInput = z.infer<typeof createBotSchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
