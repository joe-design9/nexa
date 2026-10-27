'use client';
import Link from 'next/link';
import { NexaLogo } from './Logo';
import LanguageSwitcher from './LanguageSwitcher';
import { useLocale } from '../lib/locale';

/** Rechtstexte (AGB/Datenschutz) aus dem zentralen Wörterbuch rendern. */
export default function LegalPage({ doc }: { doc: 'terms' | 'privacy' }) {
  const { t } = useLocale();
  const content = t.legal[doc];
  return (
    <main className="h-full overflow-y-auto bg-nexa-bg">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <div className="flex items-center gap-3 mb-6">
          <NexaLogo size={40} />
          <h1 className="text-2xl font-extrabold">{content.title}</h1>
          <span className="ml-auto flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/" className="text-sm text-nexa-cyan hover:underline">{t.legal.backHome}</Link>
          </span>
        </div>
        <div className="space-y-5 text-[15px] leading-relaxed text-nexa-text/90 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-7 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:space-y-1">
          {content.intro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {content.sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {s.bullets.length > 0 && (
                <ul>
                  {s.bullets.map((b, i) =>
                    typeof b === 'string' ? (
                      <li key={i}>{b}</li>
                    ) : (
                      <li key={i}>
                        <b>{b.lead}</b>
                        {b.text}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
