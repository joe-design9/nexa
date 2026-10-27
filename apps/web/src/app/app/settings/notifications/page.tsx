'use client';
import { useEffect, useState } from 'react';
import { get, put } from '../../../../lib/api';
import { useStore } from '../../../../lib/store';
import { extractList } from '../../../../lib/hooks';
import { useLocale } from '../../../../lib/locale';
import { hCls, sectionCls, sLabel, sBtn } from '../shared-styles';

interface Pref { id?: string; serverId?: string | null; channelId?: string | null; level: string }

export default function NotificationSettings() {
  const { t, fmt } = useLocale();
  const servers = useStore((s) => s.servers);
  const toast = useStore((s) => s.toast);
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const globalPref = prefs.find((p) => !p.serverId && !p.channelId);
  const [globalLevel, setGlobalLevel] = useState('ALL');

  useEffect(() => {
    get<unknown>('/notifications/preferences')
      .then((d) => {
        const list = extractList<Pref>(d, 'preferences');
        setPrefs(list);
        const g = list.find((p) => !p.serverId && !p.channelId);
        if (g) setGlobalLevel(g.level);
      })
      .catch(() => undefined);
  }, []);

  const levelFor = (serverId: string) => prefs.find((p) => p.serverId === serverId)?.level || '';

  const savePref = async (body: Pref) => {
    try {
      await put('/notifications/preferences', body);
      setPrefs((prev) => {
        const filtered = prev.filter((p) => (p.serverId || '') !== (body.serverId || '') || (p.channelId || '') !== (body.channelId || ''));
        return [...filtered, body];
      });
      toast({ title: t.settings.levelSaved, kind: 'success' });
    } catch (e) {
      toast({ title: t.common.saveFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    }
  };

  const levelOptions = (
    <>
      <option value="ALL">{t.settings.levels.ALL}</option>
      <option value="MENTIONS">{t.settings.levels.MENTIONS}</option>
      <option value="NOTHING">{t.settings.levels.NOTHING}</option>
    </>
  );

  return (
    <div>
      <h1 className={hCls}>{t.settings.notificationsTitle}</h1>
      <section className={sectionCls}>
        <div>
          <label className={sLabel}>{t.settings.global}</label>
          <div className="flex gap-2">
            <select className="flex-1 rounded-lg bg-nexa-panel2 border border-nexa-border px-3 py-2 text-sm" value={globalLevel} onChange={(e) => setGlobalLevel(e.target.value)}>{levelOptions}</select>
            <button className={sBtn} onClick={() => void savePref({ serverId: null, level: globalLevel })}>{t.common.save}</button>
          </div>
          {globalPref && <div className="text-xs text-nexa-muted">{fmt(t.settings.currentlySaved, { level: globalPref.level })}</div>}
        </div>
      </section>
      <section className={sectionCls}>
        <h2 className="font-bold">{t.settings.perServer}</h2>
        {servers.map((s) => (
          <div key={s.id} className="flex items-center gap-3">
            <span className="flex-1 truncate font-medium text-sm">{s.name}</span>
            <select
              className="rounded-lg bg-nexa-panel2 border border-nexa-border px-2 py-1.5 text-sm"
              value={levelFor(s.id)}
              onChange={(e) => { if (e.target.value) void savePref({ serverId: s.id, level: e.target.value }); }}
            >
              <option value="">{t.settings.likeGlobal}</option>
              {levelOptions}
            </select>
          </div>
        ))}
        {servers.length === 0 && <div className="text-sm text-nexa-muted">{t.settings.noServers}</div>}
      </section>
    </div>
  );
}
