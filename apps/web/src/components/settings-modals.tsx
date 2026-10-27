'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { get, post, patch, del, put, uploadFile } from '../lib/api';
import { useStore } from '../lib/store';
import { extractList } from '../lib/hooks';
import { PERMS, perm, SERVER_CATEGORIES } from '../lib/shared';
import { categoryLabel, formatDateOnly, formatDateTime, permLabel } from '../lib/i18n';
import { useLocale } from '../lib/locale';
import type { Channel, Member, Role, Server } from '../lib/types';
import { displayNameOf } from '../lib/types';
import { Modal, modalInput, modalLabel } from './modals';

const PERM_GROUPS: Array<{ group: 'general' | 'messages' | 'voice' | 'moderation'; keys: string[] }> = [
  { group: 'general', keys: ['VIEW_CHANNELS', 'CREATE_INVITES', 'CHANGE_NICKNAME', 'MANAGE_NICKNAMES', 'MANAGE_SERVER', 'MANAGE_ROLES', 'MANAGE_CHANNELS', 'ADMINISTRATOR'] },
  { group: 'messages', keys: ['SEND_MESSAGES', 'MANAGE_MESSAGES', 'MENTION_EVERYONE', 'READ_MESSAGE_HISTORY', 'ATTACH_FILES', 'EMBED_LINKS', 'ADD_REACTIONS', 'USE_EXTERNAL_EMOJIS'] },
  { group: 'voice', keys: ['CONNECT', 'SPEAK', 'VIDEO', 'STREAM', 'PRIORITY_SPEAKER', 'USE_VOICE_ACTIVITY', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS', 'MOVE_MEMBERS'] },
  { group: 'moderation', keys: ['KICK_MEMBERS', 'BAN_MEMBERS', 'TIMEOUT_MEMBERS', 'MANAGE_EMOJIS', 'MANAGE_WEBHOOKS'] },
];

// ─── Server-Einstellungen ────────────────────────────────────────────────────
export function ServerSettingsModal({ server, onClose }: { server: Server; onClose: () => void }) {
  const { t } = useLocale();
  const [tab, setTab] = useState<'general' | 'roles' | 'members' | 'invites' | 'automod' | 'audit' | 'bans'>('general');
  const me = useStore((s) => s.user);
  const isOwner = server.ownerId === me?.id;
  const myPerms = useMyPermissions(server.id);
  const tabs: Array<[typeof tab, string]> = [
    ['general', t.serverSettings.tabs.general],
    ...(perm(myPerms, 'MANAGE_ROLES') || isOwner ? [['roles', t.serverSettings.tabs.roles] as [typeof tab, string]] : []),
    ['members', t.serverSettings.tabs.members],
    ['invites', t.serverSettings.tabs.invites],
    ...(server.automodEnabled !== undefined || isOwner || perm(myPerms, 'MANAGE_SERVER') ? [['automod', t.serverSettings.tabs.automod] as [typeof tab, string]] : []),
    ...(isOwner || perm(myPerms, 'MANAGE_SERVER') || perm(myPerms, 'ADMINISTRATOR') ? [['audit', t.serverSettings.tabs.audit] as [typeof tab, string]] : []),
    ...(perm(myPerms, 'BAN_MEMBERS') || isOwner ? [['bans', t.serverSettings.tabs.bans] as [typeof tab, string]] : []),
  ];
  return (
    <Modal onClose={onClose} wide>
      <div className="flex flex-col md:flex-row min-h-[60vh]">
        <aside className="md:w-52 shrink-0 border-b md:border-b-0 md:border-r border-nexa-border p-3 space-y-1">
          <div className="px-2 pb-2 font-bold truncate">{server.name}</div>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm ${tab === k ? 'bg-nexa-violet text-white' : 'hover:bg-nexa-panel2'}`}>{l}</button>
          ))}
          <button onClick={onClose} className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-nexa-muted hover:bg-nexa-panel2 mt-4">✕ {t.common.close}</button>
        </aside>
        <div className="flex-1 p-5 min-w-0">
          {tab === 'general' && <ServerGeneral server={server} isOwner={isOwner} onClose={onClose} />}
          {tab === 'roles' && <RolesEditor server={server} />}
          {tab === 'members' && <MembersAdmin server={server} />}
          {tab === 'invites' && <InvitesAdmin server={server} />}
          {tab === 'automod' && <AutomodAdmin server={server} />}
          {tab === 'audit' && <AuditAdmin server={server} />}
          {tab === 'bans' && <BansAdmin server={server} />}
        </div>
      </div>
    </Modal>
  );
}

export function useMyPermissions(serverId?: string | null): string {
  const me = useStore((s) => s.user);
  const members = useStore((s) => s.members);
  const roles = useStore((s) => s.roles);
  const servers = useStore((s) => s.servers);
  if (!serverId || !me) return '0';
  const server = servers.find((s) => s.id === serverId);
  if (server?.ownerId === me.id) return '9223372036854775807'; // Besitzer: alle Bits
  const srvPerms = (server as unknown as Record<string, unknown> | undefined)?.myPermissions;
  if (typeof srvPerms === 'string' && srvPerms) return srvPerms;
  const member = (members[serverId] || []).find((m) => m.userId === me.id);
  const roleIds = new Set([...(member?.roleIds || []), ...(member?.roles?.map((r) => r.id) || [])]);
  let total = 0n;
  (roles[serverId] || []).forEach((r) => {
    if (r.isDefault || roleIds.has(r.id)) {
      try { total |= BigInt(r.permissions); } catch { /* ignore */ }
    }
  });
  return total.toString();
}

function ServerGeneral({ server, isOwner, onClose }: { server: Server; isOwner: boolean; onClose: () => void }) {
  const { t, fmt } = useLocale();
  const upsertServer = useStore((s) => s.upsertServer);
  const removeServer = useStore((s) => s.removeServer);
  const toast = useStore((s) => s.toast);
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description || '');
  const [category, setCategory] = useState(server.category || 'Community');
  const [isPublic, setIsPublic] = useState(!!server.isPublic);
  const [rulesText, setRulesText] = useState(server.rulesText || '');
  const [requireRules, setRequireRules] = useState(!!server.requireRulesAccept);
  const [verificationRoleId, setVerificationRoleId] = useState(server.verificationRoleId || '');
  const [iconUrl, setIconUrl] = useState(server.iconUrl || '');
  const rolesList = useStore((s) => s.roles)[server.id] || server.roles || [];
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const updated = await patch<Server>(`/servers/${server.id}`, { name, description, category, isPublic, rulesText, requireRulesAccept: requireRules, verificationRoleId: verificationRoleId || null, iconUrl: iconUrl || null });
      upsertServer({ ...server, ...updated });
      toast({ title: t.serverSettings.saved, kind: 'success' });
    } catch (e) {
      toast({ title: t.common.saveFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">{t.serverSettings.generalTitle}</h3>
      <div className="flex items-center gap-3">
        <div className="relative h-20 w-20 rounded-full overflow-hidden bg-nexa-panel3 flex items-center justify-center text-2xl font-bold shrink-0">
          {iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconUrl} alt="" className="h-full w-full object-cover" />
          ) : server.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <label className="rounded-lg bg-nexa-panel3 px-3 py-2 text-sm font-semibold cursor-pointer inline-block">
            {t.serverSettings.uploadIcon}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { const a = await uploadFile(f); setIconUrl(a.url); } catch (err) { toast({ title: t.common.uploadFailed, body: err instanceof Error ? err.message : undefined, kind: 'error' }); } } }} />
          </label>
          <div className="text-xs text-nexa-muted mt-1">{t.serverSettings.iconHint}</div>
        </div>
      </div>
      <div><label className={modalLabel}>{t.serverSettings.name}</label><input className={modalInput} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><label className={modalLabel}>{t.serverSettings.description}</label><textarea className={modalInput} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={modalLabel}>{t.serverSettings.category}</label>
          <select className={modalInput} value={category} onChange={(e) => setCategory(e.target.value)}>
            {SERVER_CATEGORIES.map((c) => (<option key={c} value={c}>{categoryLabel(t, c)}</option>))}
          </select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-4 w-4 accent-[#7C5CFF]" /> {t.serverSettings.publicLabel}</label>
      </div>
      <div>
        <label className={modalLabel}>{t.serverSettings.rulesText}</label>
        <textarea className={modalInput} rows={4} value={rulesText} onChange={(e) => setRulesText(e.target.value)} placeholder={t.serverSettings.rulesPlaceholder} />
        <label className="flex items-center gap-2 mt-2 text-sm"><input type="checkbox" checked={requireRules} onChange={(e) => setRequireRules(e.target.checked)} className="h-4 w-4 accent-[#7C5CFF]" /> {t.serverSettings.requireRules}</label>
      </div>
      <div>
        <label className={modalLabel}>{t.serverSettings.verificationRole}</label>
        <select className={modalInput} value={verificationRoleId} onChange={(e) => setVerificationRoleId(e.target.value)}>
          <option value="">{t.serverSettings.noneOption}</option>
          {rolesList.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
        </select>
      </div>
      <button className="rounded-lg bg-nexa-violet px-4 py-2 font-bold text-white disabled:opacity-50" onClick={() => void save()} disabled={busy}>{busy ? t.common.saving : t.common.save}</button>

      {isOwner && (
        <div className="border-t border-nexa-danger/40 pt-4 space-y-3">
          <h4 className="font-bold text-nexa-danger">{t.serverSettings.dangerZone}</h4>
          <TransferOwnership serverId={server.id} />
          <button
            className="rounded-lg bg-nexa-danger px-4 py-2 font-bold text-white"
            onClick={async () => {
              if (!window.confirm(fmt(t.serverSettings.deleteServerConfirm, { name: server.name }))) return;
              try {
                await del(`/servers/${server.id}`);
                removeServer(server.id);
                toast({ title: t.serverSettings.serverDeleted, kind: 'success' });
                onClose();
              } catch (e) {
                toast({ title: t.common.deleteFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
              }
            }}
          >{t.serverSettings.deleteServer}</button>
        </div>
      )}
    </div>
  );
}

function TransferOwnership({ serverId }: { serverId: string }) {
  const { t } = useLocale();
  const toast = useStore((s) => s.toast);
  const [userId, setUserId] = useState('');
  return (
    <div className="flex gap-2">
      <input className={modalInput} placeholder={t.serverSettings.transferPlaceholder} value={userId} onChange={(e) => setUserId(e.target.value)} />
      <button
        className="shrink-0 rounded-lg bg-nexa-panel3 px-3 py-2 font-semibold"
        onClick={async () => {
          if (!userId.trim() || !window.confirm(t.serverSettings.transferConfirm)) return;
          try {
            await post(`/servers/${serverId}/transfer`, { userId: userId.trim() });
            toast({ title: t.serverSettings.transferred, kind: 'success' });
          } catch (e) {
            toast({ title: t.serverSettings.transferFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
          }
        }}
      >{t.serverSettings.transfer}</button>
    </div>
  );
}

function RolesEditor({ server }: { server: Server }) {
  const { t, fmt } = useLocale();
  const rolesInStore = useStore((s) => s.roles)[server.id];
  const setServerData = useStore((s) => s.setServerData);
  const toast = useStore((s) => s.toast);
  const [roles, setRoles] = useState<Role[]>(rolesInStore || server.roles || []);
  const [selected, setSelected] = useState<Role | null>(null);
  const [newName, setNewName] = useState('');
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    get<unknown>(`/servers/${server.id}`).then((d) => {
      const o = d as Partial<Server>;
      if (o.roles) { setRoles(o.roles); setServerData(server.id, { roles: o.roles }); }
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id]);

  const persistOrder = async (list: Role[]) => {
    try {
      await post(`/servers/${server.id}/roles/reorder`, { roleIds: list.map((r) => r.id) });
    } catch (e) {
      toast({ title: t.serverSettings.orderSaveFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    }
  };

  const togglePerm = (key: string) => {
    if (!selected) return;
    const flag = PERMS[key];
    if (flag === undefined) return;
    let cur = 0n;
    try { cur = BigInt(selected.permissions || '0'); } catch { cur = 0n; }
    const next = (cur & flag) === flag ? cur & ~flag : cur | flag;
    setSelected({ ...selected, permissions: next.toString() });
  };

  return (
    <div className="flex gap-4 flex-col md:flex-row">
      <div className="md:w-56 shrink-0 space-y-1.5">
        {roles.map((r) => (
          <div
            key={r.id}
            draggable
            onDragStart={() => { dragId.current = r.id; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (!dragId.current || dragId.current === r.id) return;
              const from = roles.findIndex((x) => x.id === dragId.current);
              const to = roles.findIndex((x) => x.id === r.id);
              const list = [...roles];
              const [moved] = list.splice(from, 1);
              list.splice(to, 0, moved);
              const re = list.map((x, i) => ({ ...x, position: list.length - i }));
              setRoles(re);
              void persistOrder(re);
              dragId.current = null;
            }}
            onClick={() => setSelected(r)}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${selected?.id === r.id ? 'bg-nexa-violet text-white' : 'bg-nexa-panel2 hover:bg-nexa-panel3'}`}
          >
            <span className="h-3 w-3 rounded-full shrink-0" style={{ background: r.color }} />
            <span className="truncate">{r.name}</span>
            <span className="ml-auto text-nexa-muted text-xs" title={t.serverSettings.dragHint}>⠿</span>
          </div>
        ))}
        <div className="flex gap-1.5 pt-2">
          <input className={modalInput} placeholder={t.serverSettings.newRolePlaceholder} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button
            className="shrink-0 rounded-lg bg-nexa-violet px-3 text-white font-bold"
            onClick={async () => {
              if (!newName.trim()) return;
              try {
                const r = await post<Role>(`/servers/${server.id}/roles`, { name: newName.trim(), color: '#7C5CFF', permissions: '0' });
                setRoles((p) => [...p, r]);
                setNewName('');
              } catch (e) { toast({ title: t.serverSettings.roleCreateFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
            }}
          >＋</button>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {!selected && <div className="text-sm text-nexa-muted">{t.serverSettings.selectRole}</div>}
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={modalLabel}>{t.serverSettings.name}</label><input className={modalInput} value={selected.name} onChange={(e) => setSelected({ ...selected, name: e.target.value })} /></div>
              <div><label className={modalLabel}>{t.serverSettings.color}</label><input type="color" className="h-10 w-full rounded bg-nexa-panel2 border border-nexa-border" value={selected.color} onChange={(e) => setSelected({ ...selected, color: e.target.value })} /></div>
            </div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!selected.hoist} onChange={(e) => setSelected({ ...selected, hoist: e.target.checked })} /> {t.serverSettings.hoist}</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={selected.mentionable !== false} onChange={(e) => setSelected({ ...selected, mentionable: e.target.checked })} /> {t.serverSettings.mentionable}</label>
            </div>
            {PERM_GROUPS.map((g) => (
              <div key={g.group}>
                <div className="text-xs font-semibold uppercase text-nexa-muted mb-1.5">{t.perms.groups[g.group]}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {g.keys.filter((k) => PERMS[k] !== undefined).map((k) => (
                    <label key={k} className="flex items-center gap-2 rounded bg-nexa-panel2 px-2.5 py-1.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={perm(selected.permissions, k)} onChange={() => togglePerm(k)} className="accent-[#7C5CFF]" />
                      {permLabel(t, k)}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <button className="rounded-lg bg-nexa-violet px-4 py-2 font-bold text-white" onClick={async () => {
                try {
                  const updated = await patch<Role>(`/servers/${server.id}/roles/${selected.id}`, { name: selected.name, color: selected.color, permissions: selected.permissions, hoist: selected.hoist, mentionable: selected.mentionable });
                  const list = roles.map((r) => (r.id === updated.id ? { ...r, ...updated } : r));
                  setRoles(list);
                  setServerData(server.id, { roles: list });
                  toast({ title: t.serverSettings.roleSaved, kind: 'success' });
                } catch (e) { toast({ title: t.common.saveFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
              }}>{t.common.save}</button>
              {!selected.isDefault && (
                <button className="rounded-lg bg-nexa-panel3 px-4 py-2 font-semibold text-nexa-danger" onClick={async () => {
                  if (!window.confirm(fmt(t.serverSettings.deleteRoleConfirm, { name: selected.name }))) return;
                  try {
                    await del(`/servers/${server.id}/roles/${selected.id}`);
                    setRoles(roles.filter((r) => r.id !== selected.id));
                    setSelected(null);
                  } catch (e) { toast({ title: t.common.deleteFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
                }}>{t.serverSettings.deleteRole}</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MembersAdmin({ server }: { server: Server }) {
  const { t, fmt } = useLocale();
  const [members, setMembers] = useState<Member[]>([]);
  const rolesList = useStore((s) => s.roles)[server.id] || [];
  const toast = useStore((s) => s.toast);
  const load = useCallback(() => {
    get<unknown>(`/servers/${server.id}/members`).then((d) => setMembers(extractList<Member>(d, 'members'))).catch(() => undefined);
  }, [server.id]);
  useEffect(load, [load]);

  const mod = async (m: Member, action: 'kick' | 'ban' | 'timeout', extra?: Record<string, unknown>) => {
    const label = t.serverSettings.modLabels[action];
    if (!window.confirm(fmt(t.serverSettings.modConfirm, { action: label, name: displayNameOf(m.user) }))) return;
    try {
      await post(`/servers/${server.id}/members/${m.userId}/${action}`, extra || {});
      toast({ title: fmt(t.serverSettings.modDone, { action: label }), kind: 'success' });
      load();
    } catch (e) {
      toast({ title: t.common.actionFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' });
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-bold">{fmt(t.serverSettings.membersTitle, { count: members.length })}</h3>
      {members.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-nexa-panel2 px-3 py-2">
          <span className="font-medium">{displayNameOf(m.user)}</span>
          <span className="text-xs text-nexa-muted">@{m.user?.username}</span>
          {m.timeoutUntil && new Date(m.timeoutUntil) > new Date() && <span className="text-xs text-nexa-warn">{fmt(t.serverSettings.timeoutUntil, { date: formatDateTime(m.timeoutUntil) })}</span>}
          <span className="ml-auto flex items-center gap-1.5">
            <select
              className="rounded bg-nexa-panel3 border border-nexa-border px-2 py-1 text-xs"
              value=""
              onChange={async (e) => {
                const roleId = e.target.value;
                if (!roleId) return;
                const has = (m.roleIds || []).includes(roleId);
                try {
                  if (has) await del(`/servers/${server.id}/members/${m.userId}/roles/${roleId}`).catch(() => post(`/servers/${server.id}/roles/assign`, { userId: m.userId, roleId, remove: true }));
                  else await post(`/servers/${server.id}/members/${m.userId}/roles`, { roleId }).catch(() => post(`/servers/${server.id}/roles/assign`, { userId: m.userId, roleId }));
                  toast({ title: has ? t.serverSettings.roleRemoved : t.serverSettings.roleAssigned, kind: 'success' });
                  load();
                } catch (err) { toast({ title: t.serverSettings.roleChangeFailed, body: err instanceof Error ? err.message : undefined, kind: 'error' }); }
              }}
            >
              <option value="">{t.serverSettings.toggleRole}</option>
              {rolesList.filter((r) => !r.isDefault).map((r) => (
                <option key={r.id} value={r.id}>{(m.roleIds || []).includes(r.id) ? '✓ ' : ''}{r.name}</option>
              ))}
            </select>
            <button className="rounded bg-nexa-panel3 px-2 py-1 text-xs" onClick={() => {
              const mins = window.prompt(t.serverSettings.timeoutPrompt, '60');
              if (mins) void mod(m, 'timeout', { durationMinutes: Number(mins) || 60 });
            }}>{t.serverSettings.timeout}</button>
            <button className="rounded bg-nexa-panel3 px-2 py-1 text-xs" onClick={() => void mod(m, 'kick')}>{t.serverSettings.kick}</button>
            <button className="rounded bg-nexa-panel3 px-2 py-1 text-xs text-nexa-danger" onClick={() => void mod(m, 'ban')}>{t.serverSettings.ban}</button>
          </span>
          <div className="w-full flex flex-wrap gap-1">
            {(m.roleIds || []).map((rid) => {
              const r = rolesList.find((x) => x.id === rid);
              return r ? <span key={rid} className="rounded bg-nexa-panel3 px-1.5 py-0.5 text-[11px]"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />{r.name}</span> : null;
            })}
          </div>
        </div>
      ))}
      {members.length === 0 && <div className="text-sm text-nexa-muted">{t.serverSettings.noMembers}</div>}
    </div>
  );
}

function InvitesAdmin({ server }: { server: Server }) {
  const { t, fmt } = useLocale();
  const [invites, setInvites] = useState<Array<{ id: string; code: string; uses: number; maxUses: number; expiresAt?: string | null }>>([]);
  const toast = useStore((s) => s.toast);
  const load = useCallback(() => {
    get<unknown>(`/servers/${server.id}/invites`).then((d) => setInvites(extractList(d, 'invites'))).catch(() => undefined);
  }, [server.id]);
  useEffect(load, [load]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">{t.serverSettings.invitesTitle}</h3>
        <button className="rounded-lg bg-nexa-violet px-3 py-1.5 text-sm font-bold text-white" onClick={async () => {
          try {
            const inv = await post<{ code: string }>(`/servers/${server.id}/invites`, {});
            toast({ title: fmt(t.serverSettings.inviteCreated, { code: inv.code }), kind: 'success' });
            load();
          } catch (e) { toast({ title: t.common.createFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
        }}>{t.serverSettings.newInvite}</button>
      </div>
      {invites.map((i) => (
        <div key={i.id} className="flex items-center gap-3 rounded-lg bg-nexa-panel2 px-3 py-2 text-sm">
          <code className="font-mono font-bold">{i.code}</code>
          <span className="text-nexa-muted">{fmt(t.serverSettings.usesLabel, { uses: i.uses, maxSuffix: i.maxUses ? `/${i.maxUses}` : '' })}</span>
          {i.expiresAt && <span className="text-nexa-muted">{fmt(t.serverSettings.validUntil, { date: formatDateOnly(i.expiresAt) })}</span>}
          <button className="ml-auto text-nexa-cyan text-xs" onClick={() => { void navigator.clipboard.writeText(i.code); toast({ title: t.serverSettings.codeCopied, kind: 'success' }); }}>{t.common.copy}</button>
        </div>
      ))}
      {invites.length === 0 && <div className="text-sm text-nexa-muted">{t.serverSettings.noInvites}</div>}
    </div>
  );
}

function AutomodAdmin({ server }: { server: Server }) {
  const { t } = useLocale();
  const upsertServer = useStore((s) => s.upsertServer);
  const toast = useStore((s) => s.toast);
  const [full, setFull] = useState<Server | null>(null);
  const [words, setWords] = useState('');
  const [blockLinks, setBlockLinks] = useState(false);
  const [maxMentions, setMaxMentions] = useState(5);
  const [spamLimit, setSpamLimit] = useState(5);
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    get<Server>(`/servers/${server.id}`).then((d) => {
      const o = d as unknown as Record<string, unknown>;
      setFull(d);
      setWords(Array.isArray(o.bannedWords) ? (o.bannedWords as string[]).join('\n') : '');
      setBlockLinks(Boolean(o.automodBlockLinks));
      setMaxMentions(typeof o.automodMaxMentions === 'number' ? (o.automodMaxMentions as number) : 5);
      setSpamLimit(typeof o.automodSpamLimit === 'number' ? (o.automodSpamLimit as number) : 5);
      setEnabled(o.automodEnabled !== false);
    }).catch(() => undefined);
  }, [server.id]);
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">{t.serverSettings.automodTitle}</h3>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[#7C5CFF]" /> {t.serverSettings.automodEnabled}</label>
      <div><label className={modalLabel}>{t.serverSettings.bannedWords}</label><textarea className={modalInput} rows={5} value={words} onChange={(e) => setWords(e.target.value)} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={blockLinks} onChange={(e) => setBlockLinks(e.target.checked)} className="h-4 w-4 accent-[#7C5CFF]" /> {t.serverSettings.blockLinks}</label>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={modalLabel}>{t.serverSettings.maxMentions}</label><input type="number" min={0} className={modalInput} value={maxMentions} onChange={(e) => setMaxMentions(Number(e.target.value))} /></div>
        <div><label className={modalLabel}>{t.serverSettings.spamLimit}</label><input type="number" min={1} className={modalInput} value={spamLimit} onChange={(e) => setSpamLimit(Number(e.target.value))} /></div>
      </div>
      <button className="rounded-lg bg-nexa-violet px-4 py-2 font-bold text-white" onClick={async () => {
        try {
          const updated = await patch<Server>(`/servers/${server.id}`, { automodEnabled: enabled, bannedWords: words.split('\n').map((w) => w.trim()).filter(Boolean), automodBlockLinks: blockLinks, automodMaxMentions: maxMentions, automodSpamLimit: spamLimit });
          if (full) upsertServer({ ...full, ...updated });
          toast({ title: t.serverSettings.automodSaved, kind: 'success' });
        } catch (e) { toast({ title: t.common.saveFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
      }}>{t.common.save}</button>
    </div>
  );
}

interface AuditEntry { id: string; action: string; actor?: { displayName?: string; username?: string }; targetType?: string; reason?: string; createdAt: string }
function AuditAdmin({ server }: { server: Server }) {
  const { t } = useLocale();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  useEffect(() => {
    get<unknown>(`/servers/${server.id}/audit-logs`).then((d) => setLogs(extractList<AuditEntry>(d, 'logs'))).catch(() => undefined);
  }, [server.id]);
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-bold">{t.serverSettings.auditTitle}</h3>
      {logs.map((l) => (
        <div key={l.id} className="rounded-lg bg-nexa-panel2 px-3 py-2 text-sm flex gap-2 flex-wrap">
          <span className="font-mono text-xs rounded bg-nexa-panel3 px-1.5 py-0.5">{l.action}</span>
          <span>{l.actor ? displayNameOf(l.actor as never) : ''}</span>
          {l.reason && <span className="text-nexa-muted">– {l.reason}</span>}
          <span className="ml-auto text-xs text-nexa-muted">{formatDateTime(l.createdAt)}</span>
        </div>
      ))}
      {logs.length === 0 && <div className="text-sm text-nexa-muted">{t.serverSettings.noAuditEntries}</div>}
    </div>
  );
}

interface BanEntry { id: string; userId: string; user?: { displayName?: string; username?: string }; reason?: string | null; expiresAt?: string | null }
function BansAdmin({ server }: { server: Server }) {
  const { t, fmt } = useLocale();
  const [bans, setBans] = useState<BanEntry[]>([]);
  const toast = useStore((s) => s.toast);
  const load = useCallback(() => {
    get<unknown>(`/servers/${server.id}/bans`).then((d) => setBans(extractList<BanEntry>(d, 'bans'))).catch(() => undefined);
  }, [server.id]);
  useEffect(load, [load]);
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-bold">{fmt(t.serverSettings.bansTitle, { count: bans.length })}</h3>
      {bans.map((b) => (
        <div key={b.id} className="flex items-center gap-2 rounded-lg bg-nexa-panel2 px-3 py-2 text-sm">
          <span className="font-medium">{b.user ? displayNameOf(b.user as never) : b.userId}</span>
          {b.reason && <span className="text-nexa-muted">– {b.reason}</span>}
          <button className="ml-auto rounded bg-nexa-panel3 px-2 py-1 text-xs" onClick={async () => {
            try { await del(`/servers/${server.id}/members/${b.userId}/ban`); toast({ title: t.serverSettings.unbanned, kind: 'success' }); load(); }
            catch (e) { toast({ title: t.serverSettings.unbanFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
          }}>{t.serverSettings.unban}</button>
        </div>
      ))}
      {bans.length === 0 && <div className="text-sm text-nexa-muted">{t.serverSettings.noBans}</div>}
    </div>
  );
}

// ─── Kanal-Einstellungen ─────────────────────────────────────────────────────
interface Override { id?: string; targetType: 'ROLE' | 'MEMBER'; roleId?: string | null; memberId?: string | null; allow: string; deny: string }

export function ChannelSettingsModal({ channel, server, onClose, onChanged }: { channel: Channel; server: Server; onClose: () => void; onChanged: () => void }) {
  const { t, fmt } = useLocale();
  const [tab, setTab] = useState<'general' | 'overrides' | 'webhooks' | 'threads'>('general');
  const toast = useStore((s) => s.toast);
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic || '');
  const [slowmode, setSlowmode] = useState(channel.slowmodeSeconds || 0);
  const [nsfw, setNsfw] = useState(!!channel.nsfw);

  return (
    <Modal onClose={onClose} wide>
      <div className="flex flex-col md:flex-row min-h-[50vh]">
        <aside className="md:w-48 shrink-0 border-b md:border-b-0 md:border-r border-nexa-border p-3 space-y-1">
          <div className="px-2 pb-2 font-bold truncate"># {channel.name}</div>
          {([['general', t.channelSettings.tabs.general], ['overrides', t.channelSettings.tabs.overrides], ['webhooks', t.channelSettings.tabs.webhooks], ['threads', t.channelSettings.tabs.threads]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm ${tab === k ? 'bg-nexa-violet text-white' : 'hover:bg-nexa-panel2'}`}>{l}</button>
          ))}
          <button onClick={onClose} className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-nexa-muted hover:bg-nexa-panel2 mt-4">✕ {t.common.close}</button>
        </aside>
        <div className="flex-1 p-5 min-w-0">
          {tab === 'general' && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold">{t.channelSettings.generalTitle}</h3>
              <div><label className={modalLabel}>{t.channelSettings.name}</label><input className={modalInput} value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><label className={modalLabel}>{t.channelSettings.topic}</label><textarea className={modalInput} rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
              <div><label className={modalLabel}>{t.channelSettings.slowmode}</label><input type="number" min={0} max={21600} className={modalInput} value={slowmode} onChange={(e) => setSlowmode(Number(e.target.value))} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} className="h-4 w-4 accent-[#7C5CFF]" /> {t.channelSettings.nsfw}</label>
              <div className="flex gap-2">
                <button className="rounded-lg bg-nexa-violet px-4 py-2 font-bold text-white" onClick={async () => {
                  try {
                    await patch(`/channels/${channel.id}`, { name, topic, slowmodeSeconds: slowmode, nsfw });
                    toast({ title: t.channelSettings.saved, kind: 'success' });
                    onChanged();
                  } catch (e) { toast({ title: t.common.saveFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
                }}>{t.common.save}</button>
                {(channel.type === 'TEXT' || channel.type === 'ANNOUNCEMENT') && (
                  <button className="rounded-lg bg-nexa-panel3 px-4 py-2 font-semibold" onClick={async () => {
                    const count = window.prompt(t.channelSettings.purgePrompt, '20');
                    if (!count) return;
                    try {
                      await post(`/channels/${channel.id}/purge`, { count: Number(count) || 20 });
                      toast({ title: t.channelSettings.purged, kind: 'success' });
                      onChanged();
                    } catch (e) { toast({ title: t.channelSettings.purgeFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
                  }}>{t.channelSettings.purge}</button>
                )}
                <button className="rounded-lg bg-nexa-panel3 px-4 py-2 font-semibold text-nexa-danger" onClick={async () => {
                  if (!window.confirm(fmt(t.channelSettings.deleteChannelConfirm, { name: channel.name }))) return;
                  try {
                    await del(`/channels/${channel.id}`);
                    toast({ title: t.channelSettings.channelDeleted, kind: 'success' });
                    onChanged();
                    onClose();
                  } catch (e) { toast({ title: t.common.deleteFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
                }}>{t.channelSettings.deleteChannel}</button>
              </div>
            </div>
          )}
          {tab === 'overrides' && <OverridesEditor channel={channel} server={server} />}
          {tab === 'webhooks' && <WebhooksAdmin channel={channel} />}
          {tab === 'threads' && <ThreadsAdmin channel={channel} />}
        </div>
      </div>
    </Modal>
  );
}

function OverridesEditor({ channel, server }: { channel: Channel; server: Server }) {
  const { t, fmt } = useLocale();
  const rolesList = useStore((s) => s.roles)[server.id] || server.roles || [];
  const membersList = useStore((s) => s.members)[server.id] || [];
  const [overrides, setOverrides] = useState<Override[]>([]);
  const toast = useStore((s) => s.toast);
  const load = useCallback(() => {
    get<unknown>(`/channels/${channel.id}/overrides`).then((d) => setOverrides(extractList<Override>(d, 'overrides'))).catch(() => undefined);
  }, [channel.id]);
  useEffect(load, [load]);

  const KEY_PERMS = ['VIEW_CHANNELS', 'SEND_MESSAGES', 'MANAGE_MESSAGES', 'CONNECT', 'SPEAK', 'READ_MESSAGE_HISTORY', 'ATTACH_FILES', 'ADD_REACTIONS'];

  const stateOf = (o: Override, key: string): 'allow' | 'deny' | 'neutral' => {
    if (perm(o.allow, key)) return 'allow';
    if (perm(o.deny, key)) return 'deny';
    return 'neutral';
  };
  const setState = (o: Override, key: string, st: 'allow' | 'deny' | 'neutral'): Override => {
    const flag = PERMS[key];
    if (flag === undefined) return o;
    let allow = 0n; let deny = 0n;
    try { allow = BigInt(o.allow || '0'); } catch { allow = 0n; }
    try { deny = BigInt(o.deny || '0'); } catch { deny = 0n; }
    allow &= ~flag; deny &= ~flag;
    if (st === 'allow') allow |= flag;
    if (st === 'deny') deny |= flag;
    return { ...o, allow: allow.toString(), deny: deny.toString() };
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold">{t.channelSettings.overridesTitle}</h3>
      <p className="text-sm text-nexa-muted">{t.channelSettings.overridesHint}</p>
      {overrides.map((o, idx) => {
        const label = o.targetType === 'ROLE' ? rolesList.find((r) => r.id === o.roleId)?.name || t.channelSettings.roleFallback : displayNameOf(membersList.find((m) => m.id === o.memberId)?.user) || t.channelSettings.memberFallback;
        return (
          <div key={o.id || idx} className="rounded-lg bg-nexa-panel2 p-3 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <span>{o.targetType === 'ROLE' ? '🎭' : '👤'} {label}</span>
              <button className="ml-auto rounded bg-nexa-violet px-2.5 py-1 text-xs font-bold text-white" onClick={async () => {
                try {
                  await put(`/channels/${channel.id}/overrides`, { overrides: [o] });
                  toast({ title: t.channelSettings.overrideSaved, kind: 'success' });
                  load();
                } catch (e) { toast({ title: t.common.saveFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
              }}>{t.common.save}</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {KEY_PERMS.filter((k) => PERMS[k] !== undefined).map((k) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{permLabel(t, k)}</span>
                  {(['allow', 'neutral', 'deny'] as const).map((st) => (
                    <button key={st} title={st === 'allow' ? t.channelSettings.allow : st === 'deny' ? t.channelSettings.deny : t.channelSettings.neutral}
                      onClick={() => setOverrides(overrides.map((x, i) => (i === idx ? setState(x, k, st) : x)))}
                      className={`h-6 w-8 rounded text-xs font-bold ${stateOf(o, k) === st ? st === 'allow' ? 'bg-nexa-success text-white' : st === 'deny' ? 'bg-nexa-danger text-white' : 'bg-nexa-muted text-black' : 'bg-nexa-panel3'}`}>
                      {st === 'allow' ? '✓' : st === 'deny' ? '✗' : '–'}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <select id="ov-role" className="rounded bg-nexa-panel2 border border-nexa-border px-2 py-1.5 text-sm">
          {rolesList.map((r) => (<option key={r.id} value={r.id}>{fmt(t.channelSettings.rolePrefix, { name: r.name })}</option>))}
        </select>
        <button className="rounded bg-nexa-panel3 px-3 py-1.5 text-sm font-semibold" onClick={() => {
          const sel = document.getElementById('ov-role') as HTMLSelectElement | null;
          if (sel?.value) setOverrides((p) => [...p, { targetType: 'ROLE', roleId: sel.value, allow: '0', deny: '0' }]);
        }}>{t.channelSettings.addRoleOverride}</button>
        <select id="ov-member" className="rounded bg-nexa-panel2 border border-nexa-border px-2 py-1.5 text-sm">
          {membersList.map((m) => (<option key={m.id} value={m.id}>{fmt(t.channelSettings.memberPrefix, { name: displayNameOf(m.user) })}</option>))}
        </select>
        <button className="rounded bg-nexa-panel3 px-3 py-1.5 text-sm font-semibold" onClick={() => {
          const sel = document.getElementById('ov-member') as HTMLSelectElement | null;
          if (sel?.value) setOverrides((p) => [...p, { targetType: 'MEMBER', memberId: sel.value, allow: '0', deny: '0' }]);
        }}>{t.channelSettings.addMemberOverride}</button>
      </div>
      {overrides.length === 0 && <div className="text-sm text-nexa-muted">{t.channelSettings.noOverrides}</div>}
    </div>
  );
}

interface Webhook { id: string; name: string; token?: string; avatarUrl?: string | null }
function WebhooksAdmin({ channel }: { channel: Channel }) {
  const { t, fmt } = useLocale();
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [name, setName] = useState('');
  const toast = useStore((s) => s.toast);
  const load = useCallback(() => {
    get<unknown>(`/channels/${channel.id}/webhooks`).then((d) => setHooks(extractList<Webhook>(d, 'webhooks'))).catch(() => undefined);
  }, [channel.id]);
  useEffect(load, [load]);
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold">{t.channelSettings.webhooksTitle}</h3>
      {hooks.map((h) => (
        <div key={h.id} className="flex items-center gap-2 rounded-lg bg-nexa-panel2 px-3 py-2 text-sm">
          <span className="font-medium">{h.name}</span>
          {h.token && <code className="text-xs text-nexa-muted truncate max-w-[220px]">{h.token.slice(0, 10)}…</code>}
          <button className="ml-auto text-xs text-nexa-danger" onClick={async () => {
            if (!window.confirm(fmt(t.channelSettings.webhookDeleteConfirm, { name: h.name }))) return;
            try { await del(`/channels/${channel.id}/webhooks/${h.id}`); load(); } catch (e) { toast({ title: t.common.deleteFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
          }}>{t.common.delete}</button>
        </div>
      ))}
      <div className="flex gap-2">
        <input className={modalInput} placeholder={t.channelSettings.webhookNamePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="shrink-0 rounded-lg bg-nexa-violet px-3 py-2 font-bold text-white text-sm" onClick={async () => {
          if (!name.trim()) return;
          try {
            const h = await post<Webhook>(`/channels/${channel.id}/webhooks`, { name: name.trim() });
            if (h.token) { await navigator.clipboard.writeText(h.token).catch(() => undefined); toast({ title: t.channelSettings.webhookCreatedCopied, kind: 'success' }); }
            setName('');
            load();
          } catch (e) { toast({ title: t.common.createFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
        }}>{t.common.create}</button>
      </div>
      {hooks.length === 0 && <div className="text-sm text-nexa-muted">{t.channelSettings.noWebhooks}</div>}
    </div>
  );
}

function ThreadsAdmin({ channel }: { channel: Channel }) {
  const { t } = useLocale();
  const [threads, setThreads] = useState<Channel[]>([]);
  const [name, setName] = useState('');
  const toast = useStore((s) => s.toast);
  const load = useCallback(() => {
    get<unknown>(`/channels/${channel.id}/threads`).then((d) => setThreads(extractList<Channel>(d, 'threads'))).catch(() => undefined);
  }, [channel.id]);
  useEffect(load, [load]);
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold">{t.channelSettings.threadsTitle}</h3>
      {threads.map((th) => (
        <div key={th.id} className="rounded-lg bg-nexa-panel2 px-3 py-2 text-sm">🧵 {th.name}</div>
      ))}
      <div className="flex gap-2">
        <input className={modalInput} placeholder={t.channelSettings.threadTitlePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="shrink-0 rounded-lg bg-nexa-violet px-3 py-2 font-bold text-white text-sm" onClick={async () => {
          if (!name.trim()) return;
          try { await post(`/channels/${channel.id}/threads`, { name: name.trim() }); setName(''); load(); toast({ title: t.channelSettings.threadCreated, kind: 'success' }); }
          catch (e) { toast({ title: t.channelSettings.threadCreateFailed, body: e instanceof Error ? e.message : undefined, kind: 'error' }); }
        }}>{t.channelSettings.createThread}</button>
      </div>
      {threads.length === 0 && <div className="text-sm text-nexa-muted">{t.channelSettings.noThreads}</div>}
    </div>
  );
}
