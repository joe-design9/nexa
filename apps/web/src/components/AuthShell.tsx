'use client';
import Link from 'next/link';
import { NexaLogo, NexaWordmark } from './Logo';
import LanguageSwitcher from './LanguageSwitcher';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="relative h-full overflow-y-auto bg-nexa-bg flex items-center justify-center p-4">
      <div className="absolute right-4 top-4 z-10">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md rounded-2xl bg-nexa-panel border border-nexa-border p-8 shadow-2xl animate-pop-in">
        <div className="flex flex-col items-center gap-2 mb-6">
          <NexaLogo size={64} />
          <NexaWordmark size={22} />
          <h1 className="text-xl font-bold mt-2 text-center">{title}</h1>
          {subtitle && <p className="text-sm text-nexa-muted text-center">{subtitle}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}

export const inputCls =
  'w-full rounded-lg bg-nexa-panel2 border border-nexa-border px-3.5 py-2.5 text-sm text-nexa-text placeholder:text-nexa-muted/60 outline-none focus:border-nexa-violet transition';
export const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-nexa-muted mb-1.5';
export const primaryBtn =
  'w-full rounded-lg bg-gradient-to-r from-nexa-violet to-nexa-cyan px-4 py-2.5 font-bold text-white shadow hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed';

export function AuthError({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded-lg bg-nexa-danger/15 border border-nexa-danger/40 text-sm text-red-300 px-3.5 py-2.5 mb-4">{error}</div>;
}

export function AuthFooterLink({ text, href, linkText }: { text: string; href: string; linkText: string }) {
  return (
    <p className="text-sm text-nexa-muted mt-5 text-center">
      {text}{' '}
      <Link href={href} className="text-nexa-cyan hover:underline font-medium">
        {linkText}
      </Link>
    </p>
  );
}
