'use client';
import { useState } from 'react';
import { useLocale } from '../lib/locale';
import type { Locale } from '../lib/i18n';

/** Sprachumschalter (DE/EN) – für Landing/Auth, Shell und öffentliche Seiten. */
export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const options: Array<[Locale, string]> = [
    ['de', t.settings.german],
    ['en', t.settings.english],
  ];
  return (
    <div className={`relative ${className}`} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        title={t.common.language}
        aria-label={t.common.language}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg bg-nexa-panel3 px-2.5 py-1.5 text-sm font-semibold text-nexa-text hover:bg-nexa-border transition"
      >
        🌐 <span className="uppercase">{locale}</span> <span className="text-nexa-muted text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[60] mt-1.5 w-36 rounded-xl border border-nexa-border bg-nexa-panel3 py-1 shadow-2xl animate-pop-in">
          {options.map(([code, label]) => (
            <button
              key={code}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-nexa-panel2"
              onClick={() => {
                setLocale(code);
                setOpen(false);
              }}
            >
              <span className="w-4">{locale === code ? '✓' : ''}</span>
              {label}
              <span className="ml-auto text-xs uppercase text-nexa-muted">{code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
