'use client';
import { useEffect, useState } from 'react';
import { patch } from '../../../../lib/api';
import { useStore } from '../../../../lib/store';
import { useLocale } from '../../../../lib/locale';
import { hCls, sectionCls, sLabel } from '../shared-styles';

export default function AppearanceSettings() {
  const { t } = useLocale();
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const toast = useStore((s) => s.toast);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('light') ? 'light' : 'dark');
    setCompact(document.body.classList.contains('compact'));
  }, []);

  const applyTheme = async (next: 'dark' | 'light') => {
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.classList.toggle('light', next === 'light');
    try { localStorage.setItem('nexa_theme', next); } catch { /* ignore */ }
    if (user) {
      try {
        await patch('/users/me', { theme: next });
        setUser({ ...user, theme: next });
      } catch {
        toast({ title: t.settings.themeLocalOnly, kind: 'info' });
      }
    }
  };

  const applyCompact = (next: boolean) => {
    setCompact(next);
    document.body.classList.toggle('compact', next);
    try { localStorage.setItem('nexa_compact', next ? '1' : '0'); } catch { /* ignore */ }
  };

  return (
    <div>
      <h1 className={hCls}>{t.settings.appearanceTitle}</h1>
      <section className={sectionCls}>
        <div>
          <label className={sLabel}>{t.settings.design}</label>
          <div className="flex gap-3">
            <button onClick={() => void applyTheme('dark')} className={`flex-1 rounded-xl border p-4 text-left ${theme === 'dark' ? 'border-nexa-violet bg-nexa-panel2' : 'border-nexa-border'}`}>
              <div className="h-14 rounded-lg bg-[#0B0B12] border border-nexa-border mb-2" />
              <span className="font-semibold text-sm">{t.settings.dark}</span>
            </button>
            <button onClick={() => void applyTheme('light')} className={`flex-1 rounded-xl border p-4 text-left ${theme === 'light' ? 'border-nexa-violet bg-nexa-panel2' : 'border-nexa-border'}`}>
              <div className="h-14 rounded-lg bg-[#F4F4FA] border border-nexa-border mb-2" />
              <span className="font-semibold text-sm">{t.settings.light}</span>
            </button>
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg bg-nexa-panel2 px-4 py-3 cursor-pointer">
          <span>
            <span className="block font-semibold text-sm">{t.settings.compact}</span>
            <span className="block text-xs text-nexa-muted">{t.settings.compactHint}</span>
          </span>
          <input type="checkbox" className="h-5 w-5 accent-[#7C5CFF]" checked={compact} onChange={(e) => applyCompact(e.target.checked)} />
        </label>
      </section>
    </div>
  );
}
