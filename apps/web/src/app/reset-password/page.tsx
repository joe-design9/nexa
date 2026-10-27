'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthShell, AuthError, AuthFooterLink, inputCls, labelCls, primaryBtn } from '../../components/AuthShell';
import { post, ApiError } from '../../lib/api';
import { passwordScore } from '../../lib/shared';
import { useLocale } from '../../lib/locale';

function ResetInner() {
  const { t, fmt } = useLocale();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const strength = passwordScore(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError(t.auth.resetNoToken);
      return;
    }
    if (password !== confirm) {
      setError(t.auth.pwMismatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post('/auth/reset-password', { token, password }, { retry: false });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.auth.resetFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t.auth.resetTitle}>
      <AuthError error={error} />
      {done ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-nexa-success/15 border border-nexa-success/40 text-sm px-3.5 py-2.5">{t.auth.resetDone}</div>
          <Link href="/login" className={`${primaryBtn} block text-center`}>{t.auth.toLogin}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="pw">{t.auth.newPassword}</label>
            <input id="pw" type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            {password && <div className="text-xs text-nexa-muted mt-1">{fmt(t.auth.strength, { label: strength.label })}</div>}
          </div>
          <div>
            <label className={labelCls} htmlFor="pw2">{t.auth.repeatPassword}</label>
            <input id="pw2" type="password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </div>
          <button className={primaryBtn} disabled={busy} type="submit">{busy ? t.auth.savingPw : t.auth.changePassword}</button>
        </form>
      )}
      <AuthFooterLink text={t.auth.back} href="/login" linkText={t.auth.toLogin} />
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}
