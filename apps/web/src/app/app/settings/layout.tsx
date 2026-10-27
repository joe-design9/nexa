'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '../../../lib/store';
import { useLocale } from '../../../lib/locale';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const user = useStore((s) => s.user);
  const tabs: Array<[string, string]> = [
    ['account', t.settings.tabs.account],
    ['profile', t.settings.tabs.profile],
    ['appearance', t.settings.tabs.appearance],
    ['notifications', t.settings.tabs.notifications],
    ['privacy', t.settings.tabs.privacy],
    ['language', t.settings.tabs.language],
    ['shortcuts', t.settings.tabs.shortcuts],
  ];

  return (
    <div className="flex flex-1 flex-col bg-nexa-bg min-w-0">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-nexa-border bg-nexa-panel px-4">
        <button
          className="rounded-full bg-nexa-panel3 w-9 h-9 flex items-center justify-center text-lg hover:bg-nexa-panel2"
          onClick={() => router.push('/app/channels/@me')}
          aria-label={t.settings.closeBack}
        >✕</button>
        <h1 className="text-lg font-bold">{t.settings.title}</h1>
        <div className="ml-auto flex items-center gap-3">
          {user?.isPlatformAdmin && (
            <Link href="/app/admin" className="rounded-lg bg-nexa-warn/15 text-nexa-warn px-3 py-1.5 text-sm font-bold">{t.settings.platformAdmin}</Link>
          )}
          <button className="rounded-lg bg-nexa-panel3 px-3 py-1.5 text-sm" onClick={() => router.push('/app/channels/@me')}>{t.settings.closeBack}</button>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <nav className="hidden md:flex flex-col gap-1 w-60 shrink-0 border-r border-nexa-border bg-nexa-panel p-4">
          {tabs.map(([key, label]) => {
            const href = `/app/settings/${key}`;
            const active = pathname === href;
            return (
              <Link
                key={key}
                href={href}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-nexa-panel3 text-nexa-text' : 'text-nexa-muted hover:text-nexa-text hover:bg-nexa-panel2'}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="md:hidden sticky top-0 z-10 flex gap-1.5 overflow-x-auto border-b border-nexa-border bg-nexa-panel px-3 py-2">
            {tabs.map(([key, label]) => {
              const href = `/app/settings/${key}`;
              const active = pathname === href;
              return (
                <Link key={key} href={href} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${active ? 'bg-nexa-panel3 text-nexa-text' : 'bg-nexa-panel2 text-nexa-muted'}`}>
                  {label}
                </Link>
              );
            })}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
