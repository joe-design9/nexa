'use client';
import { useState } from 'react';
import { AuthShell, AuthError, AuthFooterLink, inputCls, labelCls, primaryBtn } from '../../components/AuthShell';
import CaptchaWidget from '../../components/Captcha';
import { post, ApiError } from '../../lib/api';
import { passwordScore } from '../../lib/shared';
import { useLocale } from '../../lib/locale';

export default function RegisterPage() {
  const { t, fmt } = useLocale();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [dob, setDob] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [resent, setResent] = useState(false);

  const strength = passwordScore(password);

  const ageError = (): string | null => {
    if (!dob) return null;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return t.auth.dobInvalid;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    if (age < 13) return t.auth.dobUnderage;
    if (age > 120) return t.auth.dobImplausible;
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ae = ageError();
    if (ae) {
      setError(ae);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post('/auth/register', { username, displayName: displayName || username, email, password, dateOfBirth: dob, platformInviteCode: inviteCode.trim(), captchaToken: captchaToken ?? undefined }, { retry: false });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.auth.registerFailed);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell title={t.auth.verifyTitle} subtitle={fmt(t.auth.verifySubtitle, { email: email || t.auth.yourAddress })}>
        <button
          className={primaryBtn}
          onClick={async () => {
            try {
              await post('/auth/resend-verification', { email }, { retry: false });
              setResent(true);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : t.auth.resendFailed);
            }
          }}
        >
          {resent ? t.auth.resent : t.auth.resend}
        </button>
        <AuthError error={error} />
        <AuthFooterLink text={t.auth.alreadyVerified} href="/login" linkText={t.auth.toLogin} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t.auth.registerTitle} subtitle={t.auth.registerSubtitle}>
      <AuthError error={error} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="inviteCode">{t.auth.inviteLabel}</label>
          <input id="inviteCode" className={inputCls} value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} autoComplete="off" placeholder="NEXA-XXXXXX-XXXXXX" required />
          <p className="text-[11px] text-nexa-muted mt-1">{t.auth.inviteHint}</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="username">{t.auth.username}</label>
          <input id="username" className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder={t.auth.usernamePlaceholder} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="displayName">{t.auth.displayName}</label>
          <input id="displayName" className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t.auth.displayNamePlaceholder} />
        </div>
        <div>
          <label className={labelCls} htmlFor="email">{t.auth.email}</label>
          <input id="email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        <div>
          <label className={labelCls} htmlFor="password">{t.auth.password}</label>
          <input id="password" type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          {password && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded ${i <= strength.score - 1 || (strength.score >= 4 && true) ? '' : ''}`} style={{ background: i < Math.max(1, strength.score) ? ['#F04747', '#FAA81A', '#FAA81A', '#3BA55D'][strength.score - 1] || '#F04747' : '#262638' }} />
                ))}
              </div>
              <div className="text-xs text-nexa-muted mt-1">{fmt(t.auth.pwStrength, { label: strength.label })}</div>
            </div>
          )}
        </div>
        <div>
          <label className={labelCls} htmlFor="dob">{t.auth.dob}</label>
          <input id="dob" type="date" className={inputCls} value={dob} onChange={(e) => setDob(e.target.value)} required max={new Date().toISOString().slice(0, 10)} />
          {ageError() && dob && <div className="text-xs text-nexa-danger mt-1">{ageError()}</div>}
        </div>
        <CaptchaWidget onToken={setCaptchaToken} />
        <button className={primaryBtn} disabled={busy} type="submit">{busy ? t.auth.registering : t.auth.registerButton}</button>
        <p className="text-[11px] text-nexa-muted text-center">
          {t.auth.termsPrefix}<a href="/terms" className="underline">{t.auth.termsLink}</a>{t.auth.termsMiddle}<a href="/privacy" className="underline">{t.auth.privacyLink}</a>{t.auth.termsSuffix}
        </p>
      </form>
      <AuthFooterLink text={t.auth.haveAccount} href="/login" linkText={t.auth.loginLink} />
    </AuthShell>
  );
}
