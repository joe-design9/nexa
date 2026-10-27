'use client';
import { useEffect, useState } from 'react';
import { get, post, patch } from '../../../../lib/api';
import { useStore } from '../../../../lib/store';
import { extractList } from '../../../../lib/hooks';
import type { PublicUser } from '../../../../lib/types';
import { displayNameOf } from '../../../../lib/types';
import { useLocale } from '../../../../lib/locale';
import { hCls, sectionCls, sLabel, sBtn } from '../shared-styles';

export default function PrivacySettings() {
  const { t } = useLocale();
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const toast = useStore((s) => s.toast);
  const [dmPrivacy, setDmPrivacy] = useState(user?.dmPrivacy || 'EVERYONE');
  const [friendPrivacy, setFriendPrivacy] = useState(user?.friendRequestPrivacy || 'EVERYONE');
  const [blocked, setBlocked] = useState<PublicUser[]>([]);

  useEffect(() => {
    get<unknown>('/friends?tab=blocked')
      .then((d) => {
        const list = extractList<{ user?: PublicUser; otherUser?: PublicUser; addressee?: PublicUser; requester?: PublicUser }>(d, 'friends');
        setBlocked(list.map((f) => f.otherUser || f.user || f.addressee || f.requester).filter(Boolean) as PublicUser[]);
      })
      .catch(() => undefined);
  }, []);
  if (!user) return null;

  return (
    <div>
      <h1 className={hCls}>{t.settings.privacyTitle}</h1>
      <section className={sectionCls}>
        <div>
          <label className={sLabel}>{t.settings.dmQuestion}</label>
          <select className="w-full rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm" value={dmPrivacy} onChange={(e) => setDmPrivacy(e.target.value)}>
            <option value="EVERYONE">{t.settings.everyone}</option>
            <option value="FRIENDS">{t.settings.friendsOnly}</option>
            <option value="NONE">{t.settings.nobody}</option>
          </select>
        </div>
        <div>
          <label className={sLabel}>{t.settings.friendQuestion}</label>
          <select className="w-full rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm" value={friendPrivacy} onChange={(e) => setFriendPrivacy(e.target.value)}>
            <option value="EVERYONE">{t.settings.everyone}</option>
            <option value="FRIENDS_OF_FRIENDS">{t.settings.friendsOfFriends}</option>
            <option value="NONE">{t.settings.nobody}</option>
          </select>
        </div>
        <button className={sBtn} onClick={async () => {
          try {
            await patch('/users/me/privacy', { dmPrivacy, friendRequestPrivacy: friendPrivacy }).catch(() => patch('/users/me', { dmPrivacy, friendRequestPrivacy: friendPrivacy }));
            setUser({ ...user, dmPrivacy, friendRequestPrivacy: friendPrivacy });
            toast({ title: t.settings.privacySaved, kind: 'success' });
          } catch (e) { toast({ title: t.common.saveFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
        }}>{t.common.save}</button>
      </section>
      <section className={sectionCls}>
        <h2 className="font-bold">{t.settings.blockedUsers}</h2>
        {blocked.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-lg bg-nexa-panel2 px-3 py-2 text-sm">
            <span className="font-medium">{displayNameOf(b)}</span>
            <span className="text-nexa-muted">@{b.username}</span>
            <button className="ml-auto text-nexa-cyan text-xs font-semibold" onClick={async () => {
              try {
                await post('/friends/unblock', { userId: b.id });
                setBlocked(blocked.filter((x) => x.id !== b.id));
                toast({ title: t.settings.unblocked, kind: 'success' });
              } catch (e) { toast({ title: t.settings.unblockFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
            }}>{t.settings.unblock}</button>
          </div>
        ))}
        {blocked.length === 0 && <div className="text-sm text-nexa-muted">{t.settings.noBlocked}</div>}
      </section>
    </div>
  );
}
