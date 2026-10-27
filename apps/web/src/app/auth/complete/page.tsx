'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '../../../components/AuthShell';
import { setToken } from '../../../lib/api';
import { useLocale } from '../../../lib/locale';

// OAuth-Abschluss: Die API leitet hierher mit #access_token=... im Hash.
export default function AuthCompletePage() {
  const { t } = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(hash);
    const token = params.get('access_token') || params.get('accessToken') || params.get('token');
    // Hash sofort aus der sichtbaren URL entfernen
    window.history.replaceState(null, '', window.location.pathname);
    if (token) {
      setToken(token);
      router.replace('/app');
    } else {
      setError(t.auth.completeNoToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <AuthShell title={t.auth.completeTitle}>
      {error ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-nexa-danger/15 border border-nexa-danger/40 text-sm text-red-300 px-3.5 py-2.5">{error}</div>
          <button className="w-full rounded-lg bg-nexa-panel3 px-4 py-2.5 font-semibold" onClick={() => router.replace('/login')}>
            {t.auth.toLogin}
          </button>
        </div>
      ) : (
        <p className="text-sm text-nexa-muted text-center">{t.auth.completeWait}</p>
      )}
    </AuthShell>
  );
}
