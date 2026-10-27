'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '../lib/api';
import { NexaLogo, NexaWordmark } from '../components/Logo';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useLocale } from '../lib/locale';
import Link from 'next/link';

export default function HomePage() {
  const router = useRouter();
  const { t } = useLocale();
  useEffect(() => {
    if (getToken()) router.replace('/app');
  }, [router]);
  return (
    <main className="relative h-full overflow-y-auto bg-nexa-bg">
      <div className="absolute right-4 top-4 z-10 md:right-8 md:top-6">
        <LanguageSwitcher />
      </div>
      <div className="mx-auto max-w-4xl px-6 py-20 flex flex-col items-center text-center gap-6">
        <NexaLogo size={120} />
        <NexaWordmark size={44} />
        <h1 className="text-3xl md:text-5xl font-extrabold leading-tight">{t.landing.headlineA}<br />{t.landing.headlineB}</h1>
        <p className="text-nexa-muted max-w-xl">{t.landing.intro}</p>
        <div className="flex gap-3">
          <Link href="/register" className="rounded-lg bg-gradient-to-r from-nexa-violet to-nexa-cyan px-6 py-3 font-bold text-white shadow-lg">{t.landing.register}</Link>
          <Link href="/login" className="rounded-lg bg-nexa-panel3 px-6 py-3 font-bold hover:bg-nexa-border transition">{t.landing.login}</Link>
        </div>
        <div className="grid md:grid-cols-3 gap-4 mt-8 text-left">
          {t.landing.features.map((f) => (
            <div key={f.title} className="rounded-xl bg-nexa-panel p-5 border border-nexa-border">
              <div className="font-bold mb-1">{f.title}</div>
              <p className="text-sm text-nexa-muted">{f.text}</p>
            </div>
          ))}
        </div>
        <footer className="mt-10 flex gap-5 text-sm text-nexa-muted">
          <Link href="/terms" className="hover:text-nexa-text">{t.landing.terms}</Link>
          <Link href="/privacy" className="hover:text-nexa-text">{t.landing.privacy}</Link>
          <Link href="/discover" className="hover:text-nexa-text">{t.landing.discover}</Link>
        </footer>
      </div>
    </main>
  );
}
