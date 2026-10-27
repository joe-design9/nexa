'use client';
import { useLocale } from '../../../../lib/locale';
import '../shared-styles';

export default function ShortcutsSettingsPage() {
  const { t } = useLocale();
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6">
      <h2 className="text-xl font-bold mb-1">{t.settings.shortcutsTitle}</h2>
      <p className="text-sm text-nexa-muted mb-5">{t.settings.shortcutsIntro}</p>
      <div className="rounded-2xl border border-nexa-border bg-nexa-panel p-5 space-y-3">
        {t.settings.shortcuts.map(([keys, label]) => (
          <div key={keys} className="flex items-center justify-between gap-4 text-sm">
            <span>{label}</span>
            <kbd className="shrink-0 rounded bg-nexa-panel3 px-2.5 py-1 font-mono text-xs">{keys}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
