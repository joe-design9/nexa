/**
 * Wörterbuch-Vollständigkeit: Deutsch und Englisch müssen exakt dieselben
 * Keys besitzen (rekursiv), alle Texte nicht-leer sein und Platzhalter
 * ({name}) zwischen den Sprachen übereinstimmen.
 */
import { dicts, fmt, localizedApiError, categoryLabel, setActiveLocale } from './i18n';
import { BADGE_CATALOG } from '@nexa/shared';

type AnyRecord = Record<string, unknown>;

function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    // Arrays (z. B. Shortcut-Paare, Rechts-Texte): Länge + Elementstruktur zählen.
    const paths = [`${prefix}#len=${value.length}`];
    value.forEach((item, i) => {
      paths.push(...keyPaths(item, `${prefix}[${i}]`));
    });
    return paths;
  }
  if (value && typeof value === 'object') {
    const out: string[] = [];
    for (const key of Object.keys(value as AnyRecord).sort()) {
      out.push(...keyPaths((value as AnyRecord)[key], prefix ? `${prefix}.${key}` : key));
    }
    return out;
  }
  return [prefix];
}

function collectStrings(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') {
    out.push([path, value]);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectStrings(item, `${path}[${i}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as AnyRecord)) {
      collectStrings((value as AnyRecord)[key], path ? `${path}.${key}` : key, out);
    }
  }
}

function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe('i18n-Wörterbuch', () => {
  it('de und en haben exakt dieselben Keys (rekursiv, inkl. Array-Längen)', () => {
    expect(keyPaths(dicts.en).sort()).toEqual(keyPaths(dicts.de).sort());
  });

  it('kein UI-Text ist leer', () => {
    for (const locale of ['de', 'en'] as const) {
      const strings: Array<[string, string]> = [];
      collectStrings(dicts[locale], '', strings);
      expect(strings.length).toBeGreaterThan(400);
      for (const [path, value] of strings) {
        expect({ path, empty: value.trim().length === 0 }).toEqual({ path, empty: false });
      }
    }
  });

  it('Platzhalter stimmen zwischen de und en überein', () => {
    const deStrings: Array<[string, string]> = [];
    const enStrings: Array<[string, string]> = [];
    collectStrings(dicts.de, '', deStrings);
    collectStrings(dicts.en, '', enStrings);
    const enByPath = new Map(enStrings);
    for (const [path, deValue] of deStrings) {
      const enValue = enByPath.get(path);
      expect(enValue).toBeDefined();
      expect(placeholders(deValue)).toEqual(placeholders(enValue as string));
    }
  });

  it('fmt ersetzt Platzhalter', () => {
    expect(fmt('Hallo {name}, {count} neu', { name: 'Lena', count: 3 })).toBe('Hallo Lena, 3 neu');
    expect(fmt('Ohne Platzhalter')).toBe('Ohne Platzhalter');
  });

  it('localizedApiError nutzt bei bekanntem Code den Wörterbuch-Text der aktiven Sprache, sonst die Server-Nachricht', () => {
    setActiveLocale('en');
    expect(localizedApiError('USER_NOT_FOUND', 'Fallback')).toBe(dicts.en.errors.USER_NOT_FOUND);
    setActiveLocale('de');
    expect(localizedApiError('USER_NOT_FOUND', 'Fallback')).toBe(dicts.de.errors.USER_NOT_FOUND);
    expect(localizedApiError('SOME_UNKNOWN_CODE', 'Server sagt Nein')).toBe('Server sagt Nein');
    expect(localizedApiError(undefined, 'Nur Server')).toBe('Nur Server');
  });

  it('jedes Abzeichen aus dem Shared-Katalog hat Name und Beschreibung in beiden Sprachen', () => {
    for (const locale of ['de', 'en'] as const) {
      const items = dicts[locale].badges.items as Record<string, { name: string; desc: string }>;
      const categories = dicts[locale].badges.categories as Record<string, string>;
      // Exakt die Katalog-Schlüssel, keine fehlenden und keine verwaisten Einträge.
      expect(Object.keys(items).sort()).toEqual(BADGE_CATALOG.map((b) => b.key).sort());
      for (const badge of BADGE_CATALOG) {
        expect(items[badge.key].name.length).toBeGreaterThan(0);
        expect(items[badge.key].desc.length).toBeGreaterThan(0);
        expect(categories[badge.category].length).toBeGreaterThan(0);
      }
    }
  });

  it('categoryLabel fällt bei unbekannter Kategorie auf den Rohwert zurück', () => {
    expect(categoryLabel(dicts.de, 'Freunde')).toBe(dicts.de.categories['Freunde']);
    expect(categoryLabel(dicts.en, 'Freunde')).toBe(dicts.en.categories['Freunde']);
    expect(categoryLabel(dicts.en, 'Eigene Kategorie')).toBe('Eigene Kategorie');
  });

  it('Tutorial hat 8–10 Schritte mit Titel und Text in beiden Sprachen (gleiche Anzahl)', () => {
    expect(dicts.de.tutorial.steps.length).toBe(dicts.en.tutorial.steps.length);
    for (const locale of ['de', 'en'] as const) {
      const steps = dicts[locale].tutorial.steps;
      expect(steps.length).toBeGreaterThanOrEqual(8);
      expect(steps.length).toBeLessThanOrEqual(10);
      for (const step of steps) {
        expect(step.title.trim().length).toBeGreaterThan(0);
        expect(step.body.trim().length).toBeGreaterThan(0);
      }
      // Steuer-Texte der Tour (Knöpfe, Fortschritt, Einstellungen) vorhanden.
      expect(dicts[locale].tutorial.skip.length).toBeGreaterThan(0);
      expect(dicts[locale].tutorial.next.length).toBeGreaterThan(0);
      expect(dicts[locale].tutorial.finish.length).toBeGreaterThan(0);
      expect(dicts[locale].tutorial.restartButton.length).toBeGreaterThan(0);
    }
  });
});
