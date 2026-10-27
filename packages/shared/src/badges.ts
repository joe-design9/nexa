/**
 * Nexa – Abzeichen-Katalog (Badges).
 *
 * Der Katalog ist code-definiert und für API, Web und Desktop identisch:
 * Schlüssel, Icon und Kategorie stehen hier; die lokalisierten Namen und
 * Beschreibungen pflegt das Web-Wörterbuch (apps/web/src/lib/i18n.ts,
 * Abschnitt `badges.items`) – ein Web-Test stellt sicher, dass jeder
 * Katalog-Schlüssel dort in beiden Sprachen vorhanden ist.
 *
 * Vergabe: Die Zuordnung Nutzer↔Abzeichen liegt in der DB (Modell
 * `UserBadge`). Plattform-Admins vergeben/entziehen alle Abzeichen über
 * die Admin-API; automatisch vergeben werden nur SERVER_FOUNDER (erster
 * eigener Server) und EARLY_ADOPTER (Registrierung, solange ≤ 100 Konten
 * existieren). BETA wird bewusst NICHT automatisch vergeben – es ist den
 * Beta-Teilnehmern vorbehalten und wird vom Admin (bzw. im Seed für die
 * Demo-Nutzer) gesetzt.
 */

export const BADGE_CATEGORIES = ['STATUS', 'EXCLUSIVE', 'ACTIVITY', 'COMMUNITY', 'SEASONAL'] as const;
export type BadgeCategory = (typeof BADGE_CATEGORIES)[number];

export interface BadgeDefinition {
  key: string;
  /** Emoji-Glyphe für Raster-/Listenanzeige. Ausnahme OWNER: Das echte
   *  Owner-Zeichen ist die Nexa-Logo+Haken-Kombination (Web-Komponente
   *  `OwnerMark`); die Krone dient nur als Text-/Fallback-Glyphe. */
  icon: string;
  category: BadgeCategory;
}

export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  // ── Status & Rollen ──────────────────────────────────────────────────
  { key: 'OWNER', icon: '👑', category: 'STATUS' },
  { key: 'ADMIN', icon: '🛡️', category: 'STATUS' },
  { key: 'MODERATOR', icon: '🔨', category: 'STATUS' },
  { key: 'VERIFIED', icon: '✔️', category: 'STATUS' },
  { key: 'DEVELOPER', icon: '💻', category: 'STATUS' },
  { key: 'BOT', icon: '🤖', category: 'STATUS' },
  // ── Exklusiv ─────────────────────────────────────────────────────────
  { key: 'BETA', icon: '🧪', category: 'EXCLUSIVE' },
  { key: 'EARLY_ADOPTER', icon: '🌱', category: 'EXCLUSIVE' },
  { key: 'LAUNCH_DAY', icon: '🚀', category: 'EXCLUSIVE' },
  { key: 'SUPPORTER', icon: '💎', category: 'EXCLUSIVE' },
  // ── Aktivität ────────────────────────────────────────────────────────
  { key: 'CHATTERBOX', icon: '💬', category: 'ACTIVITY' },
  { key: 'VOICE_REGULAR', icon: '🎙️', category: 'ACTIVITY' },
  { key: 'NIGHT_OWL', icon: '🌙', category: 'ACTIVITY' },
  { key: 'EARLY_BIRD', icon: '☀️', category: 'ACTIVITY' },
  { key: 'WEEK_STREAK', icon: '🔥', category: 'ACTIVITY' },
  { key: 'PLAYTESTER', icon: '🎮', category: 'ACTIVITY' },
  // ── Community ────────────────────────────────────────────────────────
  { key: 'SERVER_FOUNDER', icon: '🏠', category: 'COMMUNITY' },
  { key: 'INVITER', icon: '🎁', category: 'COMMUNITY' },
  { key: 'BUG_HUNTER', icon: '🐞', category: 'COMMUNITY' },
  { key: 'TRANSLATOR', icon: '🌍', category: 'COMMUNITY' },
  { key: 'CREATIVE', icon: '🎨', category: 'COMMUNITY' },
  { key: 'HELPER', icon: '🤝', category: 'COMMUNITY' },
  { key: 'EVENT_GUEST', icon: '🎉', category: 'COMMUNITY' },
  { key: 'EVENT_WINNER', icon: '🏆', category: 'COMMUNITY' },
  { key: 'MEMBER_OF_MONTH', icon: '⭐', category: 'COMMUNITY' },
  // ── Saisonal ─────────────────────────────────────────────────────────
  { key: 'HALLOWEEN_2026', icon: '🎃', category: 'SEASONAL' },
  { key: 'CHRISTMAS_2026', icon: '🎄', category: 'SEASONAL' },
] as const;

export const BADGE_KEYS: readonly string[] = BADGE_CATALOG.map((b) => b.key);

/** Der Schlüssel des Owner-Abzeichens (Sonderanzeige: Logo + Haken). */
export const OWNER_BADGE_KEY = 'OWNER';

const BADGE_BY_KEY = new Map<string, BadgeDefinition>(BADGE_CATALOG.map((b) => [b.key, b]));

/** Prüft, ob ein Wert ein bekannter Abzeichen-Schlüssel ist. */
export function isBadgeKey(value: unknown): value is string {
  return typeof value === 'string' && BADGE_BY_KEY.has(value);
}

/** Katalog-Eintrag zu einem Schlüssel (undefined bei unbekanntem Schlüssel). */
export function badgeDefinition(key: string): BadgeDefinition | undefined {
  return BADGE_BY_KEY.get(key);
}

/** Hat die Abzeichen-Liste eines Nutzers das Owner-Abzeichen? */
export function hasOwnerBadge(badgeKeys: readonly string[] | null | undefined): boolean {
  return Boolean(badgeKeys && badgeKeys.includes(OWNER_BADGE_KEY));
}
