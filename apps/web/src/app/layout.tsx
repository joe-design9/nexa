import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import './globals.css';
import IntroSplash from '../components/IntroSplash';
import Toasts from '../components/Toasts';
import { LocaleProvider } from '../lib/locale';
import { isLocale, localeFromLanguageTag, LOCALE_COOKIE, type Locale } from '../lib/i18n';

async function detectLocale(): Promise<Locale> {
  // 1) Gespeicherte Wahl (Cookie, vom Client bei jeder Umschaltung gesetzt)
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  // 2) Browser-/Systemsprache (Accept-Language), 3) sonst Englisch.
  const hdrs = await headers();
  return localeFromLanguageTag(hdrs.get('accept-language'));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await detectLocale();
  return {
    title: locale === 'de' ? 'Nexa – Deine Community. Deine Regeln.' : 'Nexa – Your community. Your rules.',
    description:
      locale === 'de'
        ? 'Nexa ist eine Chat- und Community-Plattform: Server, Kanäle, Direktnachrichten, Sprach- und Videoanrufe.'
        : 'Nexa is a chat and community platform: servers, channels, direct messages, voice and video calls.',
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialLocale = await detectLocale();
  return (
    <html lang={initialLocale} className="dark">
      <body className="antialiased overflow-hidden">
        <LocaleProvider initialLocale={initialLocale}>
          <IntroSplash />
          {children}
          <Toasts />
        </LocaleProvider>
      </body>
    </html>
  );
}
