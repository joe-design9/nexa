'use client';
import { useState } from 'react';
import { AuthShell, AuthError, AuthFooterLink, inputCls, labelCls, primaryBtn } from '../../components/AuthShell';
import { post, ApiError } from '../../lib/api';
import { useLocale } from '../../lib/locale';

export default function ForgotPasswordPage() {
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/auth/forgot-password', { email }, { retry: false });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.auth.requestFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t.auth.forgotTitle} subtitle={t.auth.forgotSubtitle}>
      <AuthError error={error} />
      {done ? (
        <div className="rounded-lg bg-nexa-success/15 border border-nexa-success/40 text-sm px-3.5 py-2.5">
          {t.auth.forgotDone}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="email">{t.auth.email}</label>
            <input id="email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <button className={primaryBtn} disabled={busy} type="submit">{busy ? t.auth.sending : t.auth.sendLink}</button>
        </form>
      )}
      <AuthFooterLink text={t.auth.remembered} href="/login" linkText={t.auth.toLogin} />
    </AuthShell>
  );
}
