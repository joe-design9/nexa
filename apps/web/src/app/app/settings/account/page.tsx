'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { get, post, patch, del, setToken, ApiError } from '../../../../lib/api';
import { useStore } from '../../../../lib/store';
import { extractList } from '../../../../lib/hooks';
import { formatDateOnly, formatDateTime } from '../../../../lib/i18n';
import { useLocale } from '../../../../lib/locale';
import { hCls, sectionCls, sInput, sLabel, sBtn } from '../shared-styles';

interface Session { id: string; deviceName?: string | null; userAgent?: string | null; ipAddress?: string | null; createdAt?: string; lastUsedAt?: string; current?: boolean }

export default function AccountSettings() {
  const { t, fmt } = useLocale();
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const toast = useStore((s) => s.toast);
  const setTutorialOpen = useStore((s) => s.setTutorialOpen);
  const router = useRouter();
  const [email, setEmail] = useState(user?.email || '');
  const [username, setUsername] = useState(user?.username || '');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [twofa, setTwofa] = useState<{ otpauthUrl: string; qr: string; secret?: string } | null>(null);
  const [twofaCode, setTwofaCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePw, setDisablePw] = useState('');
  const [deletePw, setDeletePw] = useState('');
  const [desktopUrl, setDesktopUrl] = useState<string | null>(null);
  const [desktopInput, setDesktopInput] = useState('');

  const loadSessions = useCallback(() => {
    get<unknown>('/auth/sessions').then((d) => setSessions(extractList<Session>(d, 'sessions'))).catch(() => undefined);
  }, []);
  useEffect(loadSessions, [loadSessions]);
  useEffect(() => { setEmail(user?.email || ''); setUsername(user?.username || ''); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof window !== 'undefined' && window.nexaDesktop) {
      window.nexaDesktop.getServerUrl().then((u) => { setDesktopUrl(u); setDesktopInput(u); }).catch(() => undefined);
    }
  }, []);

  if (!user) return null;
  const twofaEnabled = Boolean((user as unknown as Record<string, unknown>).totpEnabled);

  return (
    <div>
      <h1 className={hCls}>{t.settings.accountTitle}</h1>

      <section className={sectionCls}>
        <h2 className="font-bold">{t.settings.accountData}</h2>
        <div><label className={sLabel}>{t.settings.email}</label><input className={sInput} value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
        <div><label className={sLabel}>{t.settings.username}</label><input className={sInput} value={username} onChange={(e) => setUsername(e.target.value)} /></div>
        <div>
          <label className={sLabel}>{t.settings.dob}</label>
          <input className={sInput} value={user.dateOfBirth ? formatDateOnly(user.dateOfBirth) : '—'} readOnly disabled />
        </div>
        <div className="text-sm text-nexa-muted">{t.settings.emailStatus}{user.emailVerifiedAt ? t.settings.emailVerified : t.settings.emailUnverified}</div>
        <button className={sBtn} onClick={async () => {
          try {
            const updated = await patch('/users/me', { email, username });
            setUser({ ...user, ...(updated as object) });
            toast({ title: t.settings.accountSaved, kind: 'success' });
          } catch (e) { toast({ title: t.common.saveFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
        }}>{t.common.save}</button>
      </section>

      <section className={sectionCls}>
        <h2 className="font-bold">{t.tutorial.settingsTitle}</h2>
        <p className="text-sm text-nexa-muted">{t.tutorial.settingsHint}</p>
        <button className={sBtn} onClick={() => setTutorialOpen(true)}>{t.tutorial.restartButton}</button>
      </section>

      <section className={sectionCls}>
        <h2 className="font-bold">{t.settings.changePassword}</h2>
        <div><label className={sLabel}>{t.settings.currentPassword}</label><input className={sInput} type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" /></div>
        <div><label className={sLabel}>{t.settings.newPassword}</label><input className={sInput} type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" /></div>
        <button className={sBtn} disabled={!curPw || !newPw} onClick={async () => {
          try {
            await post('/users/me/change-password', { currentPassword: curPw, newPassword: newPw });
            setCurPw(''); setNewPw('');
            toast({ title: t.settings.passwordChanged, kind: 'success' });
          } catch (e) { toast({ title: t.settings.passwordChangeFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
        }}>{t.settings.changePassword}</button>
      </section>

      <section className={sectionCls}>
        <h2 className="font-bold">{t.settings.twoFaTitle}</h2>
        {twofaEnabled && !twofa ? (
          <>
            <p className="text-sm text-nexa-success">{t.settings.twoFaEnabled}</p>
            <div className="flex gap-2">
              <input className={sInput} type="password" placeholder={t.settings.disablePasswordPlaceholder} value={disablePw} onChange={(e) => setDisablePw(e.target.value)} />
              <button className="shrink-0 rounded-lg bg-nexa-panel3 px-4 py-2 text-sm font-semibold text-nexa-danger" onClick={async () => {
                try {
                  await post('/auth/2fa/disable', { password: disablePw, currentPassword: disablePw });
                  setUser({ ...user, ...({ totpEnabled: false } as object) });
                  toast({ title: t.settings.twoFaDisabled, kind: 'success' });
                } catch (e) { toast({ title: t.settings.deactivateFailed, body: e instanceof ApiError ? e.message : undefined, kind: 'error' }); }
              }}>{t.settings.deactivate}</button>
            </div>
          </>
        ) : !twofa ? (
          <>
            <p className="text-sm text-nexa-muted">{t.settings.twoFaHint}</p>
            <button className={sBtn} onClick={async () => {
              try {
                const res = await post<{ otpauthUrl: string; secret?: string }>('/auth/2fa/setup', {});
                const qr = await QRCode.toDataURL(res.otpauthUrl, { width: 220, margin: 1 });
                setTwofa({ otpauthUrl: res.otpauthUrl, qr, secret: res.secret });
              } catch (e) { toast({ title: t.settings.setupFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
            }}>{t.settings.setupTwoFa}</button>
          </>
        ) : (
          <>
            <p className="text-sm text-nexa-muted">{t.settings.twoFaScanHint}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={twofa.qr} alt={t.settings.qrAlt} className="rounded-lg bg-white p-2 w-[220px]" />
            {twofa.secret && <div className="text-xs text-nexa-muted">{t.settings.secretManual}<code className="font-mono">{twofa.secret}</code></div>}
            <div className="flex gap-2">
              <input className={sInput} placeholder="123456" value={twofaCode} onChange={(e) => setTwofaCode(e.target.value)} />
              <button className="shrink-0 rounded-lg bg-nexa-success px-4 py-2 text-sm font-bold text-white" onClick={async () => {
                try {
                  const res = await post<{ backupCodes?: string[] }>('/auth/2fa/enable', { code: twofaCode.trim() });
                  setUser({ ...user, ...({ totpEnabled: true } as object) });
                  setTwofa(null);
                  if (res.backupCodes?.length) setBackupCodes(res.backupCodes);
                  toast({ title: t.settings.twoFaActivated, kind: 'success' });
                } catch (e) { toast({ title: t.settings.codeInvalid, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
              }}>{t.settings.activate}</button>
            </div>
          </>
        )}
        {backupCodes && (
          <div className="rounded-lg border border-nexa-warn/50 bg-nexa-warn/10 p-4">
            <div className="font-bold text-sm mb-2">{t.settings.backupTitle}</div>
            <div className="grid grid-cols-2 gap-1 font-mono text-sm">
              {backupCodes.map((c) => (<code key={c}>{c}</code>))}
            </div>
            <button className="mt-3 text-sm underline" onClick={() => { void navigator.clipboard.writeText(backupCodes.join('\n')); toast({ title: t.settings.backupCopied, kind: 'success' }); }}>{t.settings.copyAll}</button>
          </div>
        )}
      </section>

      <section className={sectionCls}>
        <h2 className="font-bold">{t.settings.sessions}</h2>
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-lg bg-nexa-panel2 px-3 py-2 text-sm">
            <span>🖥️</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium truncate">{s.deviceName || s.userAgent || t.settings.unknownDevice} {s.current && <span className="text-nexa-success">{t.settings.thisSession}</span>}</span>
              <span className="block text-xs text-nexa-muted">{s.ipAddress || ''} · {fmt(t.settings.lastActive, { date: s.lastUsedAt ? formatDateTime(s.lastUsedAt) : '—' })}</span>
            </span>
            {!s.current && (
              <button className="text-nexa-danger text-xs font-semibold" onClick={async () => {
                try { await del(`/auth/sessions/${s.id}`); loadSessions(); toast({ title: t.settings.sessionRevoked, kind: 'success' }); }
                catch (e) { toast({ title: t.settings.revokeFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
              }}>{t.settings.revoke}</button>
            )}
          </div>
        ))}
        {sessions.length === 0 && <div className="text-sm text-nexa-muted">{t.settings.noSessions}</div>}
      </section>

      {desktopUrl !== null && (
        <section className={sectionCls}>
          <h2 className="font-bold">{t.settings.desktopServer}</h2>
          <p className="text-sm text-nexa-muted">{fmt(t.settings.desktopUsing, { version: window.nexaDesktop?.appVersion ?? '' })} {t.settings.desktopCurrent} <b className="text-nexa-text">{desktopUrl}</b></p>
          <div className="flex gap-2">
            <input className={sInput} value={desktopInput} onChange={(e) => setDesktopInput(e.target.value)} placeholder="http://localhost:3000" />
            <button className="shrink-0 rounded-lg bg-nexa-panel3 px-4 py-2 text-sm font-semibold" onClick={async () => {
              const res = await window.nexaDesktop!.setServerUrl(desktopInput.trim());
              if (res.ok) toast({ title: t.settings.serverLoading, kind: 'success' });
              else toast({ title: t.settings.serverSwitchFailed, body: res.error, kind: 'error' });
            }}>{t.settings.switchServer}</button>
          </div>
        </section>
      )}

      <section className={sectionCls}>
        <h2 className="font-bold">{t.settings.yourData}</h2>
        <button className="rounded-lg bg-nexa-panel3 px-4 py-2 text-sm font-semibold" onClick={async () => {
          try {
            const data = await get('/users/me/export');
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'nexa-datenexport.json';
            a.click();
            URL.revokeObjectURL(url);
          } catch (e) { toast({ title: t.settings.exportFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
        }}>{t.settings.exportBtn}</button>
      </section>

      <section className="rounded-2xl border border-nexa-danger/50 bg-nexa-panel p-5 space-y-3">
        <h2 className="font-bold text-nexa-danger">{t.settings.deleteAccount}</h2>
        <p className="text-sm text-nexa-muted">{t.settings.deleteAccountHint}</p>
        <input className={sInput} type="password" placeholder={t.settings.deletePasswordPlaceholder} value={deletePw} onChange={(e) => setDeletePw(e.target.value)} />
        <button className="rounded-lg bg-nexa-danger px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={!deletePw} onClick={async () => {
          if (!window.confirm(t.settings.deleteConfirm)) return;
          try {
            const { api } = await import('../../../../lib/api');
            await api('/users/me', { method: 'DELETE', body: { password: deletePw }, retry: false });
            setToken(null);
            router.replace('/login');
          } catch (e) { toast({ title: t.settings.deleteFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
        }}>{t.settings.deleteAccountBtn}</button>
      </section>
    </div>
  );
}
