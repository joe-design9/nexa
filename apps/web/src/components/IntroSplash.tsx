'use client';
import { useEffect, useState } from 'react';
import { NexaLogo } from './Logo';
import { useLocale } from '../lib/locale';

// Start-Animation: Logo zeichnet sich ein, Wortmarke staffelt sich, Tagline.
// Spielt einmal pro Session (sessionStorage), Klick überspringt, ~1,8 s.
export default function IntroSplash() {
  const { t } = useLocale();
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem('nexa_intro_seen') === '1';
    } catch {
      seen = false;
    }
    if (seen) return;
    setShow(true);
    const t1 = setTimeout(() => setLeaving(true), 1550);
    const t2 = setTimeout(() => finish(), 1850);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const finish = () => {
    try {
      sessionStorage.setItem('nexa_intro_seen', '1');
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      onClick={() => {
        setLeaving(true);
        setTimeout(finish, 250);
      }}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-nexa-bg cursor-pointer transition-opacity duration-300 ${leaving ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      aria-hidden
    >
      <div className="nexa-glow animate-pulse">
        <NexaLogo size={150} animated />
      </div>
      <div className="flex text-4xl font-extrabold tracking-[0.35em] text-nexa-text">
        {['N', 'E', 'X', 'A'].map((c, i) => (
          <span key={i} className="nexa-letter" style={{ animationDelay: `${0.55 + i * 0.13}s` }}>
            {c}
          </span>
        ))}
      </div>
      <p className="nexa-tagline text-nexa-muted text-sm">{t.landing.tagline}</p>
    </div>
  );
}
