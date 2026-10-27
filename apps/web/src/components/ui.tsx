'use client';
import { avatarColor, displayNameOf, initialsOf, type BadgeGrant, type PublicUser } from '../lib/types';
import { useLocale } from '../lib/locale';
import { formatDateOnly } from '../lib/i18n';
import { BADGE_CATALOG, OWNER_BADGE_KEY, badgeCategoryLabel, badgeDesc, badgeIcon, badgeName } from '../lib/badges';

export function Avatar({ user, size = 40, statusDot = true }: { user: Partial<PublicUser>; size?: number; statusDot?: boolean }) {
  const name = displayNameOf(user);
  const presence = user.status;
  const color =
    presence === 'ONLINE' ? '#3BA55D' : presence === 'IDLE' ? '#FAA81A' : presence === 'DND' ? '#F04747' : '#747F8D';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />
      ) : (
        <div
          className="rounded-full flex items-center justify-center font-bold text-white select-none"
          style={{ width: size, height: size, background: avatarColor(user.id || name), fontSize: size * 0.38 }}
        >
          {initialsOf(name)}
        </div>
      )}
      {statusDot && presence && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-[3px] border-nexa-panel"
          style={{ width: Math.max(12, size * 0.32), height: Math.max(12, size * 0.32), background: color }}
          title={presence}
        />
      )}
    </div>
  );
}

export function StatusDot({ status, size = 12 }: { status?: string | null; size?: number }) {
  const color = status === 'ONLINE' ? '#3BA55D' : status === 'IDLE' ? '#FAA81A' : status === 'DND' ? '#F04747' : '#747F8D';
  return <span className="inline-block rounded-full shrink-0" style={{ width: size, height: size, background: color }} />;
}

export function VerifiedBadge({ size = 14 }: { size?: number }) {
  const { t } = useLocale();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block shrink-0 text-nexa-cyan" aria-label={t.common.verified}>
      <path fill="currentColor" d="M12 1.7 14.5 4l3.3-.3 1 3.2 3 1.4-1.2 3.1 1.2 3.1-3 1.4-1 3.2-3.3-.3L12 22.3 9.5 20l-3.3.3-1-3.2-3-1.4L3.4 12 2.2 8.9l3-1.4 1-3.2 3.3.3z" opacity=".9" />
      <path fill="#0B0B12" d="m10.6 15.6-2.7-2.7 1.3-1.3 1.4 1.4 4.2-4.2 1.3 1.3z" />
    </svg>
  );
}

/**
 * Owner-Zeichen: Nexa-Logo mit Haken – das Sonderzeichen für das
 * OWNER-Abzeichen. Wird überall neben dem Namen gezeigt (Chat,
 * Mitgliederliste, Profil, Freunde, DMs), analog zum VerifiedBadge,
 * aber als Logo+Haken-Kombination unverwechselbar.
 */
export function OwnerMark({ size = 16 }: { size?: number }) {
  const { t } = useLocale();
  const check = Math.max(8, Math.round(size * 0.58));
  return (
    <span
      className="relative inline-block shrink-0 align-[-2px]"
      style={{ width: size, height: size }}
      title={t.badges.ownerMark}
      aria-label={t.badges.ownerMark}
      role="img"
    >
      <svg width={size} height={size} viewBox="0 0 512 512" className="block">
        <defs>
          <linearGradient id="nexa-g-owner" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7C5CFF" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
        <rect x="16" y="16" width="480" height="480" rx="112" fill="#0B0B12" />
        <rect x="16" y="16" width="480" height="480" rx="112" fill="none" stroke="url(#nexa-g-owner)" strokeWidth="24" />
        <path d="M150 362 V150 L362 362 V150" fill="none" stroke="url(#nexa-g-owner)" strokeWidth="58" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span
        className="absolute flex items-center justify-center rounded-full bg-nexa-cyan"
        style={{ width: check, height: check, right: -Math.round(size * 0.16), bottom: -Math.round(size * 0.16) }}
      >
        <svg width={check} height={check} viewBox="0 0 24 24">
          <path fill="#0B0B12" d="m10.6 15.9-2.9-2.9 1.4-1.4 1.5 1.5 4.5-4.5 1.4 1.4z" />
        </svg>
      </span>
    </span>
  );
}

/** Ein einzelnes Abzeichen als kompakte Glyphe (Tooltip = Name + Beschreibung). */
export function BadgeChip({ badgeKey, size = 14 }: { badgeKey: string; size?: number }) {
  const { t } = useLocale();
  if (badgeKey === OWNER_BADGE_KEY) return <OwnerMark size={size + 2} />;
  const name = badgeName(t, badgeKey);
  const desc = badgeDesc(t, badgeKey);
  return (
    <span
      className="inline-block shrink-0 leading-none"
      style={{ fontSize: size }}
      title={desc ? `${name} – ${desc}` : name}
      aria-label={name}
      role="img"
    >
      {badgeIcon(badgeKey)}
    </span>
  );
}

/**
 * Abzeichen eines Nutzers inline neben dem Namen: Owner-Zeichen zuerst
 * (falls vorhanden), dann bis zu `max` weitere Abzeichen-Glyphen.
 */
export function UserBadgesInline({ user, max = 3, size = 14 }: { user: Partial<PublicUser>; max?: number; size?: number }) {
  // Defensiv: Nur echte Arrays sind Schlüssel-Listen (das Profil-Objekt
  // der API trägt unter `badges` historisch ein Flags-Objekt).
  const keys = Array.isArray(user.badges) ? user.badges : [];
  if (!keys.length) return null;
  const isOwner = keys.includes(OWNER_BADGE_KEY);
  const rest = keys.filter((k) => k !== OWNER_BADGE_KEY).slice(0, Math.max(0, max));
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {isOwner && <OwnerMark size={size + 2} />}
      {rest.map((k) => (
        <BadgeChip key={k} badgeKey={k} size={size} />
      ))}
    </span>
  );
}

/**
 * Abzeichen-Sammlung als Raster (Profil-Popup + Profil-Seite): eigene
 * Abzeichen mit Name, Beschreibung und Vergabe-Datum; mit `showLocked`
 * werden nicht besessene Abzeichen ausgegraut mit angezeigt (wie
 * Discords „Deine Abzeichen“).
 */
export function BadgeGrid({ grants, showLocked = false }: { grants: BadgeGrant[]; showLocked?: boolean }) {
  const { t, fmt } = useLocale();
  const byKey = new Map(grants.map((g) => [g.key, g]));
  const categories = [...new Set(BADGE_CATALOG.map((b) => b.category))];
  if (grants.length === 0 && !showLocked) {
    return <div className="text-sm text-nexa-muted">{t.badges.empty}</div>;
  }
  return (
    <div className="space-y-4">
      {categories.map((category) => {
        const entries = BADGE_CATALOG.filter((b) => b.category === category && (showLocked || byKey.has(b.key)));
        if (!entries.length) return null;
        return (
          <div key={category}>
            <div className="text-xs font-semibold uppercase tracking-wide text-nexa-muted mb-2">
              {badgeCategoryLabel(t, category)}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {entries.map((b) => {
                const grant = byKey.get(b.key);
                const owned = Boolean(grant);
                const name = badgeName(t, b.key);
                const desc = badgeDesc(t, b.key);
                const meta = !owned
                  ? t.badges.locked
                  : grant?.grantedAt
                    ? fmt(t.badges.earnedOn, { date: formatDateOnly(grant.grantedAt) }) +
                      (grant.grantedBy ? fmt(t.badges.grantedBySuffix, { name: grant.grantedBy.username }) : t.badges.systemGranted)
                    : '';
                return (
                  <div
                    key={b.key}
                    className={`flex flex-col items-center gap-1 rounded-xl bg-nexa-panel2 p-3 text-center ${owned ? '' : 'opacity-45 grayscale'}`}
                    title={desc ? `${name} – ${desc}` : name}
                  >
                    {b.key === OWNER_BADGE_KEY ? (
                      <OwnerMark size={32} />
                    ) : (
                      <span className="text-[32px] leading-none">{b.icon}</span>
                    )}
                    <div className="text-[13px] font-semibold leading-tight">{name}</div>
                    <div className="text-[11px] leading-snug text-nexa-muted">{desc}</div>
                    {meta && <div className="text-[10px] text-nexa-muted">{meta}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-nexa-panel3 ${className}`} />;
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-16 px-6">
      <div className="text-lg font-semibold text-nexa-text">{title}</div>
      {hint && <div className="text-sm text-nexa-muted max-w-sm">{hint}</div>}
      {children}
    </div>
  );
}
