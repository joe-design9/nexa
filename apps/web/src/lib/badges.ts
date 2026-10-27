// Nexa – Abzeichen-Helfer für die Web-UI.
// Der Katalog (Schlüssel, Icon, Kategorie) kommt aus @nexa/shared –
// identisch zu API und Seed. Namen/Beschreibungen stehen im
// i18n-Wörterbuch (badges.items), damit sie der Sprachwahl folgen.
import { BADGE_CATALOG, OWNER_BADGE_KEY, type BadgeCategory } from '@nexa/shared';
import type { Dict } from './i18n';

export { BADGE_CATALOG, OWNER_BADGE_KEY };

type BadgeItemTexts = { name: string; desc: string };

/** Lokalisierter Name eines Abzeichens (Fallback: Schlüssel). */
export function badgeName(t: Dict, key: string): string {
  return (t.badges.items as Record<string, BadgeItemTexts>)[key]?.name ?? key;
}

/** Lokalisierte Beschreibung eines Abzeichens. */
export function badgeDesc(t: Dict, key: string): string {
  return (t.badges.items as Record<string, BadgeItemTexts>)[key]?.desc ?? '';
}

/** Lokalisiertes Kategorie-Label (Fallback: Kategorie-Schlüssel). */
export function badgeCategoryLabel(t: Dict, category: string): string {
  return t.badges.categories[category as BadgeCategory] ?? category;
}

/** Icon-Glyphe aus dem Katalog (OWNER wird separat als Logo+Haken gezeigt). */
export function badgeIcon(key: string): string {
  return BADGE_CATALOG.find((b) => b.key === key)?.icon ?? '🏅';
}

/** Kategorie eines Abzeichens aus dem Katalog. */
export function badgeCategory(key: string): string {
  return BADGE_CATALOG.find((b) => b.key === key)?.category ?? 'STATUS';
}

/** Hat der Nutzer (Schlüssel-Liste aus PublicUser.badges) das Owner-Abzeichen? */
export function userHasOwnerBadge(badgeKeys: readonly string[] | null | undefined): boolean {
  return Boolean(badgeKeys && badgeKeys.includes(OWNER_BADGE_KEY));
}
