'use client';
import { useEffect, useState } from 'react';
import { get, patch, post, uploadFile } from '../../../../lib/api';
import { useStore } from '../../../../lib/store';
import { Avatar, BadgeGrid } from '../../../../components/ui';
import { getSocket } from '../../../../lib/socket';
import { useLocale } from '../../../../lib/locale';
import type { BadgeGrant, PublicUser } from '../../../../lib/types';
import { hCls, sectionCls, sInput, sLabel, sBtn } from '../shared-styles';

export default function ProfileSettings() {
  const { t } = useLocale();
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const toast = useStore((s) => s.toast);
  const [badgeGrants, setBadgeGrants] = useState<BadgeGrant[] | null>(null);

  // Eigene Abzeichen-Sammlung (mit Vergabe-Daten) vom Profil-Endpunkt laden.
  useEffect(() => {
    if (!user?.id) return;
    get<PublicUser & { badgeGrants?: BadgeGrant[] }>(`/users/${user.id}`)
      .then((d) => setBadgeGrants(d.badgeGrants ?? []))
      .catch(() => setBadgeGrants([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [about, setAbout] = useState(user?.about || '');
  const [pronouns, setPronouns] = useState(user?.pronouns || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [bannerUrl, setBannerUrl] = useState(user?.bannerUrl || '');
  const [customStatus, setCustomStatus] = useState(user?.customStatusText || '');
  if (!user) return null;

  const upload = async (file: File, kind: 'avatar' | 'banner') => {
    try {
      const att = await uploadFile(file);
      if (kind === 'avatar') setAvatarUrl(att.url);
      else setBannerUrl(att.url);
      toast({ title: t.settings.imageUploaded, kind: 'success' });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t.errors.UPLOAD_NETWORK, kind: 'error' });
    }
  };

  return (
    <div>
      <h1 className={hCls}>{t.settings.profileTitle}</h1>
      <section className={sectionCls}>
        <div className="relative">
          <label className="block h-28 rounded-xl bg-gradient-to-r from-nexa-violet to-nexa-cyan overflow-hidden cursor-pointer" title={t.settings.changeBanner}>
            {bannerUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
            )}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, 'banner'); }} />
            <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-xs">{t.settings.changeBanner}</span>
          </label>
          <label className="absolute -bottom-6 left-5 cursor-pointer" title={t.settings.changeAvatar}>
            <Avatar user={{ ...user, avatarUrl }} size={72} />
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, 'avatar'); }} />
          </label>
        </div>
        <div className="pt-8 space-y-4">
          <div><label className={sLabel}>{t.settings.displayName}</label><input className={sInput} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
          <div><label className={sLabel}>{t.settings.pronouns}</label><input className={sInput} value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder={t.settings.pronounsPlaceholder} maxLength={40} /></div>
          <div><label className={sLabel}>{t.settings.about}</label><textarea className={sInput} rows={4} value={about} onChange={(e) => setAbout(e.target.value)} maxLength={1000} placeholder={t.settings.aboutPlaceholder} /></div>
          <div><label className={sLabel}>{t.settings.customStatus}</label><input className={sInput} value={customStatus} onChange={(e) => setCustomStatus(e.target.value)} maxLength={128} placeholder={t.settings.customStatusPlaceholder} /></div>
          <div className="flex gap-2">
            <button className={sBtn} onClick={async () => {
              try {
                const updated = await patch('/users/me', { displayName, about, pronouns, avatarUrl: avatarUrl || null, bannerUrl: bannerUrl || null });
                setUser({ ...user, ...(updated as object), displayName, about, pronouns, avatarUrl, bannerUrl });
                toast({ title: t.settings.profileSaved, kind: 'success' });
              } catch (e) { toast({ title: t.common.saveFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
            }}>{t.common.save}</button>
            <button className="rounded-lg bg-nexa-panel3 px-4 py-2 text-sm font-semibold" onClick={async () => {
              try {
                await post('/users/me/status', { status: user.status || 'ONLINE', customStatusText: customStatus || null });
                getSocket().emit('presence:status', { status: user.status || 'ONLINE', customStatusText: customStatus });
                setUser({ ...user, customStatusText: customStatus });
                toast({ title: t.settings.statusUpdated, kind: 'success' });
              } catch (e) { toast({ title: t.settings.statusFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
            }}>{t.settings.updateStatusOnly}</button>
          </div>
        </div>
      </section>
      <section className={sectionCls}>
        <h2 className="font-bold mb-3">{t.badges.title} ({badgeGrants?.length ?? user.badges?.length ?? 0})</h2>
        {badgeGrants === null ? (
          <div className="text-sm text-nexa-muted">{t.badges.empty}</div>
        ) : (
          <BadgeGrid grants={badgeGrants} showLocked />
        )}
      </section>
    </div>
  );
}
