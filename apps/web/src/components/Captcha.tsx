'use client';
import { useEffect, useRef } from 'react';
import { useLocale } from '../lib/locale';

// Captcha-Widget: Turnstile / hCaptcha per Env, sonst Dev-Bypass-Checkbox,
// die nach echtem Anklicken das Token 'dev-bypass' liefert.
export default function CaptchaWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const { t } = useLocale();
  const siteKey = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY || '';
  const provider = (process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER || 'turnstile').toLowerCase();
  const devBypass = (process.env.NEXT_PUBLIC_CAPTCHA_DEV_BYPASS || '').toLowerCase() === 'true';
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey) return;
    const w = window as unknown as Record<string, unknown>;
    const cbName = `nexaCaptcha_${Math.random().toString(36).slice(2)}`;
    (w as Record<string, unknown>)[cbName] = (token: string) => onToken(token || null);
    const scriptSrc =
      provider === 'hcaptcha' ? 'https://js.hcaptcha.com/1/api.js?render=explicit' : 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    let script = document.querySelector<HTMLScriptElement>(`script[src^="${scriptSrc.split('?')[0]}"]`);
    const render = () => {
      if (!boxRef.current) return;
      try {
        if (provider === 'hcaptcha') {
          const hc = w.hcaptcha as { render: (el: HTMLElement, opts: Record<string, unknown>) => void } | undefined;
          hc?.render(boxRef.current, { sitekey: siteKey, callback: cbName, 'expired-callback': () => onToken(null) });
        } else {
          const ts = w.turnstile as { render: (el: HTMLElement, opts: Record<string, unknown>) => void } | undefined;
          ts?.render(boxRef.current, { sitekey: siteKey, callback: cbName, 'expired-callback': () => onToken(null) });
        }
      } catch {
        /* Widget lädt evtl. noch */
      }
    };
    if (!script) {
      script = document.createElement('script');
      script.src = scriptSrc;
      script.async = true;
      script.defer = true;
      script.onload = () => setTimeout(render, 50);
      document.head.appendChild(script);
    } else {
      render();
    }
    return () => {
      delete (w as Record<string, unknown>)[cbName];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, provider]);

  if (siteKey) {
    return <div ref={boxRef} className="min-h-[65px]" aria-label="Captcha" />;
  }

  if (devBypass) {
    return (
      <label className="flex items-center gap-3 rounded-lg border border-nexa-border bg-nexa-panel2 px-4 py-3 cursor-pointer select-none">
        <input
          type="checkbox"
          className="h-5 w-5 accent-[#7C5CFF]"
          onChange={(e) => onToken(e.target.checked ? 'dev-bypass' : null)}
        />
        <span className="text-sm text-nexa-text">{t.auth.notRobot}</span>
        <span className="ml-auto text-[11px] text-nexa-muted">{t.auth.captchaDevNote}</span>
      </label>
    );
  }

  return <p className="text-xs text-nexa-warn">{t.auth.captchaNotConfigured}</p>;
}

export function GoogleButton({ href }: { href: string }) {
  const { t } = useLocale();
  return (
    <a
      href={href}
      className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-2.5 font-semibold text-[#1f1f1f] shadow hover:bg-gray-100 transition"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
      </svg>
      {t.auth.google}
    </a>
  );
}

export function AppleButton({ href }: { href: string }) {
  const { t } = useLocale();
  return (
    <a
      href={href}
      className="flex w-full items-center justify-center gap-3 rounded-lg bg-black px-4 py-2.5 font-semibold text-white shadow ring-1 ring-white/20 hover:bg-neutral-900 transition"
    >
      <svg width="18" height="18" viewBox="0 0 384 512" fill="currentColor" aria-hidden>
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
      </svg>
      {t.auth.apple}
    </a>
  );
}

export function CaptchaNote() {
  return null;
}
