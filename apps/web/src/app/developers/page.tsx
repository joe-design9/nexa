'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { get, post, del, getToken, refreshAccessToken } from '../../lib/api';
import { extractList } from '../../lib/hooks';
import { formatDateOnly } from '../../lib/i18n';
import { NexaLogo } from '../../components/Logo';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { useLocale } from '../../lib/locale';

interface Bot { id: string; name?: string; description?: string | null; tokenPrefix?: string; botUser?: { username: string; displayName: string }; createdAt?: string }

export default function DevelopersPage() {
  const { t, fmt } = useLocale();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [bots, setBots] = useState<Bot[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shownToken, setShownToken] = useState<{ botId: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    get<unknown>('/developers/bots').then((d) => setBots(extractList<Bot>(d, 'bots'))).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    (async () => {
      if (!getToken()) {
        const fresh = await refreshAccessToken();
        if (!fresh) {
          router.replace('/login');
          return;
        }
      }
      setReady(true);
      load();
    })();
  }, [load, router]);

  if (!ready) return <main className="h-full bg-nexa-bg flex items-center justify-center text-nexa-muted">{t.developers.loading}</main>;

  return (
    <main className="h-full overflow-y-auto bg-nexa-bg">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <header className="flex items-center gap-3 mb-6">
          <NexaLogo size={40} />
          <div>
            <h1 className="text-2xl font-extrabold">{t.developers.title}</h1>
            <p className="text-sm text-nexa-muted">{t.developers.subtitle}</p>
          </div>
          <span className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <Link href="/app" className="rounded-lg bg-nexa-panel3 px-3 py-2 text-sm font-semibold">{t.developers.backToApp}</Link>
          </span>
        </header>

        {error && <div className="rounded-lg bg-nexa-danger/15 border border-nexa-danger/40 text-sm text-red-300 px-3 py-2 mb-4">{error}</div>}

        <section className="rounded-2xl border border-nexa-border bg-nexa-panel p-5 mb-6">
          <h2 className="font-bold mb-3">{t.developers.createTitle}</h2>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              const res = await post<Bot & { token?: string }>('/developers/bots', { name, description });
              if (res.token) setShownToken({ botId: res.id, token: res.token });
              setName('');
              setDescription('');
              load();
            } catch (err) { setError(err instanceof Error ? err.message : t.developers.createFailed); }
          }}>
            <input className="w-full rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm outline-none" placeholder={t.developers.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} required />
            <textarea className="w-full rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm outline-none" placeholder={t.developers.descriptionPlaceholder} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            <button className="rounded-lg bg-gradient-to-r from-nexa-violet to-nexa-cyan px-4 py-2 font-bold text-white">{t.developers.createBot}</button>
          </form>
        </section>

        {shownToken && (
          <div className="rounded-2xl border border-nexa-warn/60 bg-nexa-warn/10 p-5 mb-6">
            <div className="font-bold mb-1">{t.developers.tokenTitle}</div>
            <p className="text-sm text-nexa-muted mb-2">{t.developers.tokenHint}</p>
            <div className="flex gap-2">
              <code className="flex-1 truncate rounded bg-black/40 px-3 py-2 font-mono text-sm">{shownToken.token}</code>
              <button className="rounded-lg bg-nexa-panel3 px-3 py-2 text-sm font-semibold" onClick={() => { void navigator.clipboard.writeText(shownToken.token); }}>{t.common.copy}</button>
              <button className="rounded-lg bg-nexa-panel3 px-3 py-2 text-sm" onClick={() => setShownToken(null)}>{t.developers.hide}</button>
            </div>
          </div>
        )}

        <section className="space-y-3">
          {bots.map((b) => (
            <div key={b.id} className="rounded-2xl border border-nexa-border bg-nexa-panel p-5">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-2xl">🤖</span>
                <div className="min-w-0">
                  <div className="font-bold">{b.botUser?.displayName || b.name || t.developers.botFallback}</div>
                  <div className="text-xs text-nexa-muted">
                    {b.botUser ? `@${b.botUser.username} · ` : ''}{t.developers.tokenPrefix}<code className="font-mono">{b.tokenPrefix || '—'}</code>
                    {b.createdAt ? fmt(t.developers.createdSuffix, { date: formatDateOnly(b.createdAt) }) : ''}
                  </div>
                </div>
                <span className="ml-auto flex gap-2">
                  <button className="rounded-lg bg-nexa-panel3 px-3 py-1.5 text-sm font-semibold" onClick={async () => {
                    if (!window.confirm(t.developers.regenerateConfirm)) return;
                    try {
                      const res = await post<{ token?: string }>(`/developers/bots/${b.id}/token/regenerate`, {}).catch(() => post<{ token?: string }>(`/developers/bots/${b.id}/regenerate`, {}));
                      if (res.token) setShownToken({ botId: b.id, token: res.token });
                      load();
                    } catch (err) { setError(err instanceof Error ? err.message : t.developers.regenerateFailed); }
                  }}>{t.developers.regenerate}</button>
                  <button className="rounded-lg bg-nexa-panel3 px-3 py-1.5 text-sm font-semibold text-nexa-danger" onClick={async () => {
                    if (!window.confirm(t.developers.deleteConfirm)) return;
                    try { await del(`/developers/bots/${b.id}`); load(); } catch (err) { setError(err instanceof Error ? err.message : t.common.deleteFailed); }
                  }}>{t.common.delete}</button>
                </span>
              </div>
              {b.description && <p className="text-sm text-nexa-muted mt-2">{b.description}</p>}
            </div>
          ))}
          {bots.length === 0 && <div className="text-center text-nexa-muted py-8">{t.developers.noBots}</div>}
        </section>
      </div>
    </main>
  );
}
