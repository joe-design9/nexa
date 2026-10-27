'use client';
import { useLocale } from '../../../../lib/locale';

export default function LanguageSettings() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6">
      <h2 className="text-xl font-bold mb-1">{t.settings.languageTitle}</h2>
      <p className="text-sm text-nexa-muted mb-5">{t.settings.languageNote}</p>
      <div className="space-y-2">
        {([['de', '🇩🇪', t.settings.german], ['en', '🇬🇧', t.settings.english]] as const).map(([code, flag, label]) => (
          <button
            key={code}
            onClick={() => setLocale(code)}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${locale === code ? 'border-nexa-violet bg-nexa-panel2' : 'border-nexa-border bg-nexa-panel hover:bg-nexa-panel2'}`}
          >
            <span className="text-2xl">{flag}</span>
            <span className="font-semibold">{label}</span>
            {locale === code && <span className="ml-auto rounded bg-nexa-violet px-2 py-0.5 text-xs font-bold text-white">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
