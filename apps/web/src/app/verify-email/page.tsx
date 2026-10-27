'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthShell, AuthError, primaryBtn } from '../../components/AuthShell';
import { get, ApiError } from '../../lib/api';
import { useLocale } from '../../lib/locale';

function VerifyInner() {
  const { t } = useLocale();
  const params = useSearchParams();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      setMessage(t.auth.verifyNoToken);
      return;
    }
    get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => {
        setState('ok');
        setMessage(t.auth.verifiedOk);
      })
      .catch((e: ApiError) => {
        setState('error');
        setMessage(e.message || t.auth.linkInvalid);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <AuthShell title={t.auth.verifyEmailTitle}>
      {state === 'loading' && <p className="text-sm text-nexa-muted text-center">{t.auth.verifying}</p>}
      {state === 'ok' && (
        <div className="space-y-4">
          <div className="rounded-lg bg-nexa-success/15 border border-nexa-success/40 text-sm px-3.5 py-2.5">{message}</div>
          <Link href="/login" className={`${primaryBtn} block text-center`}>{t.auth.toLogin}</Link>
        </div>
      )}
      {state === 'error' && <AuthError error={message} />}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
