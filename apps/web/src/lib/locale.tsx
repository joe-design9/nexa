'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  dicts,
  fmt as fmtTemplate,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  setActiveLocale,
  type Dict,
  type Locale,
} from './i18n';
import { getToken, patch } from './api';

export interface LocaleContextValue {
  locale: Locale;
  /** Manuelle Umschaltung: persistiert (Cookie + localStorage) und synct ans Profil. */
  setLocale: (l: Locale) => void;
  /** Aktives Wörterbuch (referenzstabil pro Sprache). */
  t: Dict;
  fmt: (template: string, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Sprach-Kontext der Web-App.
 * Priorität beim Start: serverseitig erkannte Sprache (Cookie → Accept-Language
 * → Englisch) als `initialLocale`; eine gespeicherte localStorage-Wahl gewinnt
 * danach; die Profil-Sprache des eingeloggten Nutzers wird nur übernommen,
 * wenn weder eine lokale Wahl noch eine manuelle Umschaltung in dieser
 * Session vorliegt.
 */
export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    setActiveLocale(initialLocale);
    return initialLocale;
  });
  const manualRef = useRef(false);

  const applyLocale = useCallback((l: Locale, opts?: { manual?: boolean; syncProfile?: boolean }) => {
    if (opts?.manual) {
      manualRef.current = true;
      try {
        sessionStorage.setItem('nexa_locale_manual', '1');
      } catch {
        /* ignore */
      }
    }
    setLocaleState(l);
    setActiveLocale(l);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    try {
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* ignore */
    }
    if (typeof document !== 'undefined') document.documentElement.lang = l;
    if (opts?.syncProfile && getToken()) {
      void patch('/users/me', { locale: l }).catch(() => undefined);
    }
  }, []);

  // Gespeicherte Browser-Wahl (localStorage) nach dem Mount anwenden.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('nexa_locale_manual') === '1') manualRef.current = true;
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isLocale(saved) && saved !== locale) applyLocale(saved);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Profil-Sprache aus dem App-Bootstrap (Event aus der Shell) übernehmen,
  // solange der Nutzer nicht selbst gewählt hat.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (!isLocale(detail)) return;
      if (manualRef.current) return;
      try {
        if (localStorage.getItem(LOCALE_STORAGE_KEY)) return;
      } catch {
        /* ignore */
      }
      applyLocale(detail);
    };
    window.addEventListener('nexa-profile-locale', handler);
    return () => window.removeEventListener('nexa-profile-locale', handler);
  }, [applyLocale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: (l: Locale) => applyLocale(l, { manual: true, syncProfile: true }),
      t: dicts[locale],
      fmt: fmtTemplate,
    }),
    [locale, applyLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
