import {
  BADGE_CATALOG,
  BADGE_KEYS,
  BADGE_CATEGORIES,
  badgeDefinition,
  isBadgeKey,
  hasOwnerBadge,
} from './badges';

/**
 * Der Abzeichen-Katalog ist der Vertrag zwischen API, Web und Seed:
 * Schlüssel müssen eindeutig sein, jede Kategorie gültig, jedes
 * Abzeichen braucht eine Icon-Glyphe. (Namen/Beschreibungen liegen im
 * Web-Wörterbuch und werden dort per Paritäts-Test abgedeckt.)
 */
describe('BADGE_CATALOG', () => {
  it('enthält alle geforderten Abzeichen-Schlüssel', () => {
    const expected = [
      // Status & Rollen
      'OWNER', 'ADMIN', 'MODERATOR', 'VERIFIED', 'DEVELOPER', 'BOT',
      // Exklusiv
      'BETA', 'EARLY_ADOPTER', 'LAUNCH_DAY', 'SUPPORTER',
      // Aktivität
      'CHATTERBOX', 'VOICE_REGULAR', 'NIGHT_OWL', 'EARLY_BIRD', 'WEEK_STREAK', 'PLAYTESTER',
      // Community
      'SERVER_FOUNDER', 'INVITER', 'BUG_HUNTER', 'TRANSLATOR', 'CREATIVE', 'HELPER',
      'EVENT_GUEST', 'EVENT_WINNER', 'MEMBER_OF_MONTH',
      // Saisonal
      'HALLOWEEN_2026', 'CHRISTMAS_2026',
    ];
    expect([...BADGE_KEYS].sort()).toEqual([...expected].sort());
  });

  it('hat eindeutige Schlüssel und gültige Kategorien', () => {
    expect(new Set(BADGE_KEYS).size).toBe(BADGE_KEYS.length);
    for (const badge of BADGE_CATALOG) {
      expect(BADGE_CATEGORIES).toContain(badge.category);
      expect(badge.icon.length).toBeGreaterThan(0);
    }
  });

  it('verteilt die Abzeichen auf alle fünf Kategorien', () => {
    const counts = new Map<string, number>();
    for (const badge of BADGE_CATALOG) counts.set(badge.category, (counts.get(badge.category) ?? 0) + 1);
    expect(counts.get('STATUS')).toBe(6);
    expect(counts.get('EXCLUSIVE')).toBe(4);
    expect(counts.get('ACTIVITY')).toBe(6);
    expect(counts.get('COMMUNITY')).toBe(9);
    expect(counts.get('SEASONAL')).toBe(2);
  });

  it('isBadgeKey / badgeDefinition erkennen nur Katalog-Schlüssel', () => {
    expect(isBadgeKey('BETA')).toBe(true);
    expect(isBadgeKey('beta')).toBe(false);
    expect(isBadgeKey('NOPE')).toBe(false);
    expect(isBadgeKey(undefined)).toBe(false);
    expect(badgeDefinition('BETA')?.icon).toBe('🧪');
    expect(badgeDefinition('OWNER')?.category).toBe('STATUS');
    expect(badgeDefinition('NOPE')).toBeUndefined();
  });

  it('hasOwnerBadge erkennt das Owner-Abzeichen in der Liste', () => {
    expect(hasOwnerBadge(['BETA', 'OWNER'])).toBe(true);
    expect(hasOwnerBadge(['BETA'])).toBe(false);
    expect(hasOwnerBadge([])).toBe(false);
    expect(hasOwnerBadge(undefined)).toBe(false);
    expect(hasOwnerBadge(null)).toBe(false);
  });
});
