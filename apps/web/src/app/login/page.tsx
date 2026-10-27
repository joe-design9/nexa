'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell, AuthError, AuthFooterLink, inputCls, labelCls, primaryBtn } from '../../components/AuthShell';
import CaptchaWidget, { GoogleButton, AppleButton } from '../../components/Captcha';
import { apiBase, post, setToken, ApiError } from '../../lib/api';
import { useLocale } from '../../lib/locale';
import Link from 'next/link';

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { t, fmt } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [oauthInviteCode, setOauthInviteCode] = useState('');

  useEffect(() => {
    const oe = params.get('oauthError');
    if (oe === 'not_configured') setError(t.auth.oauthNotConfigured);
    else if (oe === 'invite_required') setError(t.auth.oauthInviteRequired);
    else if (oe === 'invite_invalid') setError(t.auth.oauthInviteInvalid);
    else if (oe) setError(fmt(t.auth.oauthFailed, { code: oe }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const oauthHref = (provider: 'google' | 'apple') => {
    const codeParam = oauthInviteCode.trim() ? `?inviteCode=${encodeURIComponent(oauthInviteCode.trim())}` : '';
    return `${apiBase()}/auth/oauth/${provider}${codeParam}`;
  };

  const finish = (data: Record<string, unknown>) => {
    const token = (data.accessToken ?? data.token ?? data.access_token) as string | undefined;
    if (token) setToken(token);
    router.replace('/app');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await post<Record<string, unknown>>('/auth/login', { email, password, captchaToken: captchaToken ?? undefined }, { retry: false });
      if (data.requiresTwoFactor) {
        setTwoFactorToken((data.twoFactorToken as string) || '');
        return;
      }
      finish(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.auth.loginFailed);
    } finally {
      setBusy(false);
    }
  };

  const submit2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await post<Record<string, unknown>>('/auth/login/2fa', { twoFactorToken, code: code.trim() }, { retry: false });
      finish(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.auth.twoFaFailed);
    } finally {
      setBusy(false);
    }
  };

  if (twoFactorToken !== null) {
    return (
      <AuthShell title={t.auth.twoFaTitle} subtitle={t.auth.twoFaSubtitle}>
        <AuthError error={error} />
        <form onSubmit={submit2fa} className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="code">{t.auth.code}</label>
            <input id="code" className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" placeholder={t.auth.codePlaceholder} required />
          </div>
          <button className={primaryBtn} disabled={busy} type="submit">{busy ? t.auth.checking : t.auth.confirmLogin}</button>
          <button type="button" className="w-full text-sm text-nexa-muted hover:text-nexa-text" onClick={() => setTwoFactorToken(null)}>{t.auth.backToLogin}</button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t.auth.loginTitle} subtitle={t.auth.loginSubtitle}>
      <AuthError error={error} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="email">{t.auth.email}</label>
          <input id="email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        <div>
          <label className={labelCls} htmlFor="password">{t.auth.password}</label>
          <input id="password" type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          <div className="text-right mt-1">
            <Link href="/forgot-password" className="text-xs text-nexa-cyan hover:underline">{t.auth.forgotPassword}</Link>
          </div>
        </div>
        <CaptchaWidget onToken={setCaptchaToken} />
        <button className={primaryBtn} disabled={busy} type="submit">{busy ? t.auth.loggingIn : t.auth.loginButton}</button>
      </form>
      <div className="flex items-center gap-3 my-5">
        <span className="h-px flex-1 bg-nexa-border" />
        <span className="text-xs text-nexa-muted">{t.auth.or}</span>
        <span className="h-px flex-1 bg-nexa-border" />
      </div>
      <div className="space-y-2.5">
        <div>
          <label className={labelCls} htmlFor="oauthInviteCode">{t.auth.oauthInviteLabel}</label>
          <input id="oauthInviteCode" className={inputCls} value={oauthInviteCode} onChange={(e) => setOauthInviteCode(e.target.value)} autoComplete="off" placeholder={t.auth.oauthInvitePlaceholder} />
        </div>
        <GoogleButton href={oauthHref('google')} />
        <AppleButton href={oauthHref('apple')} />
      </div>
      <AuthFooterLink text={t.auth.noAccount} href="/register" linkText={t.auth.registerLink} />
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
