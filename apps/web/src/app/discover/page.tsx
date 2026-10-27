'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { get, post, getToken } from '../../lib/api';
import { extractList } from '../../lib/hooks';
import { SERVER_CATEGORIES } from '../../lib/shared';
import { categoryLabel } from '../../lib/i18n';
import type { Server } from '../../lib/types';
import { initialsOf } from '../../lib/types';
import { NexaLogo, NexaWordmark } from '../../components/Logo';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { RulesModal } from '../../components/modals';
import { useStore } from '../../lib/store';
import { useLocale } from '../../lib/locale';

export default function DiscoverPage() {
  const { t, fmt } = useLocale();
  const [servers, setServers] = useState<Server[]>([]);
  const [category, setCategory] = useState<string>('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rulesFor, setRulesFor] = useState<Server | null>(null);
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const toast = useStore((s) => s.toast);
  const upsertServer = useStore((s) => s.upsertServer);
  const loggedIn = typeof window !== 'undefined' && !!getToken();

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (category) qs.set('category', category);
    if (q) qs.set('q', q);
    get<unknown>(`/servers/discover${qs.toString() ? `?${qs.toString()}` : ''}`)
      .then((d) => setServers(extractList<Server>(d, 'servers')))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async (s: Server) => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    try {
      await post(`/servers/${s.id}/join`, {});
      upsertServer(s);
      setJoined((p) => ({ ...p, [s.id]: true }));
      if (s.requireRulesAccept) setRulesFor(s);
      else {
        toast({ title: fmt(t.discover.joinedToast, { name: s.name }), kind: 'success' });
        router.push(`/app/channels/${s.id}`);
      }
    } catch (e) {
      toast({ title: t.discover.joinFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    }
  };

  const shown = servers.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.description || '').toLowerCase().includes(q.toLowerCase()));

  return (
    <main className="h-full overflow-y-auto bg-nexa-bg">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <header className="flex items-center gap-3 mb-6">
          <NexaLogo size={42} />
          <div>
            <NexaWordmark size={20} />
            <h1 className="text-2xl font-extrabold mt-1">{t.discover.title}</h1>
          </div>
          <span className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <Link href="/app" className="rounded-lg bg-nexa-panel3 px-3 py-2 text-sm font-semibold">{t.discover.toApp}</Link>
            {!loggedIn && <Link href="/login" className="rounded-lg bg-nexa-violet px-3 py-2 text-sm font-bold text-white">{t.discover.login}</Link>}
          </span>
        </header>

        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <input
            className="flex-1 rounded-lg bg-nexa-panel2 border border-nexa-border px-4 py-2.5 outline-none focus:border-nexa-violet"
            placeholder={t.discover.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
          />
          <button className="rounded-lg bg-nexa-panel3 px-4 py-2.5 font-semibold" onClick={load}>{t.discover.search}</button>
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setCategory('')} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${!category ? 'bg-nexa-violet text-white' : 'bg-nexa-panel3'}`}>{t.discover.all}</button>
          {SERVER_CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${category === c ? 'bg-nexa-violet text-white' : 'bg-nexa-panel3'}`}>{categoryLabel(t, c)}</button>
          ))}
        </div>

        {error && <div className="rounded-lg bg-nexa-danger/15 border border-nexa-danger/40 text-sm text-red-300 px-3.5 py-2.5 mb-4">{error}</div>}
        {loading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (<div key={i} className="h-44 rounded-2xl bg-nexa-panel animate-pulse" />))}
          </div>
        )}
        {!loading && shown.length === 0 && <div className="text-center text-nexa-muted py-16">{t.discover.noServers}</div>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((s) => (
            <article key={s.id} className="rounded-2xl border border-nexa-border bg-nexa-panel overflow-hidden flex flex-col">
              <div className="h-20 bg-gradient-to-r from-nexa-violet/60 to-nexa-cyan/50" style={s.bannerUrl ? { backgroundImage: `url(${s.bannerUrl})`, backgroundSize: 'cover' } : undefined} />
              <div className="p-4 flex flex-1 flex-col">
                <div className="flex items-center gap-3 -mt-9 mb-2">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-nexa-panel3 text-lg font-bold ring-4 ring-nexa-panel overflow-hidden">
                    {s.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.iconUrl} alt="" className="h-full w-full object-cover" />
                    ) : initialsOf(s.name)}
                  </span>
                  <span className="font-bold text-lg leading-tight">{s.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-nexa-muted mb-2">
                  {s.category && <span className="rounded-full bg-nexa-panel3 px-2 py-0.5 font-semibold">{categoryLabel(t, s.category)}</span>}
                  {s.memberCount !== undefined && <span>{fmt(t.discover.members, { count: s.memberCount })}</span>}
                </div>
                <p className="text-sm text-nexa-muted flex-1 line-clamp-3">{s.description || t.discover.noDescription}</p>
                <button
                  className="mt-4 rounded-lg bg-gradient-to-r from-nexa-violet to-nexa-cyan px-4 py-2 font-bold text-white disabled:opacity-60"
                  disabled={joined[s.id]}
                  onClick={() => void join(s)}
                >{joined[s.id] ? t.discover.joined : t.discover.join}</button>
              </div>
            </article>
          ))}
        </div>
      </div>
      {rulesFor && (
        <RulesModal
          server={rulesFor}
          onDone={() => {
            setRulesFor(null);
            router.push(`/app/channels/${rulesFor.id}`);
          }}
        />
      )}
    </main>
  );
}
