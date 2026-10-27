// Brücke zu @nexa/shared – exakt die dort definierten Exporte nutzen.
import {
  renderMarkdown as sharedRenderMarkdown,
  passwordStrength as sharedPasswordStrength,
  PERMISSIONS as SharedPerms,
  hasPermission as sharedHasPermission,
  SERVER_CATEGORIES as SharedCategories,
  parseMentions as sharedParseMentions,
} from '@nexa/shared';
import { SERVER_CATEGORIES_FALLBACK } from './types';
import { dicts, getActiveLocale } from './i18n';

type AnyFn = (...args: unknown[]) => unknown;

export function renderMarkdownSafe(content: string): string {
  try {
    const out = (sharedRenderMarkdown as AnyFn)(content);
    if (typeof out === 'string') return out;
  } catch {
    /* Fallback unten */
  }
  const esc = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\n/g, '<br/>');
}

export function passwordScore(pw: string): { score: number; label: string } {
  let score = 0;
  try {
    const out = (sharedPasswordStrength as AnyFn)(pw) as unknown;
    if (typeof out === 'number') score = out;
    else if (out && typeof out === 'object') {
      const o = out as Record<string, unknown>;
      score = typeof o.score === 'number' ? o.score : typeof o.strength === 'number' ? o.strength : typeof o.value === 'number' ? o.value : 0;
    }
  } catch {
    score = Math.min(4, Math.floor(pw.length / 4) + (/[A-Z]/.test(pw) ? 1 : 0) + (/\d/.test(pw) ? 1 : 0));
  }
  if (score > 4) score = Math.max(0, Math.round(score / 25)); // 0–100 → 0–4
  // Die Bezeichnung folgt immer der aktiven UI-Sprache (nicht dem Shared-Paket).
  const labels = dicts[getActiveLocale()].auth.pwLabels;
  return { score, label: labels[Math.max(0, Math.min(4, score))] };
}

export const PERMS = SharedPerms as unknown as Record<string, bigint>;

export function perm(permsDecimal: string | bigint | number | undefined | null, key: string): boolean {
  if (permsDecimal === undefined || permsDecimal === null) return false;
  let value: bigint;
  try {
    value = typeof permsDecimal === 'bigint' ? permsDecimal : BigInt(String(permsDecimal));
  } catch {
    return false;
  }
  const wanted = (PERMS as Record<string, bigint>)[key];
  if (wanted === undefined) return false;
  try {
    return Boolean((sharedHasPermission as AnyFn)(value, wanted));
  } catch {
    return (value & wanted) === wanted;
  }
}

export const SERVER_CATEGORIES: string[] = Array.isArray(SharedCategories) && SharedCategories.length ? (SharedCategories as unknown as string[]) : SERVER_CATEGORIES_FALLBACK;

export function parseMentionsSafe(content: string): { userIds: string[]; roleIds: string[]; everyone: boolean } {
  try {
    const out = (sharedParseMentions as AnyFn)(content) as Record<string, unknown> | null;
    if (out && typeof out === 'object') {
      return {
        userIds: (out.userIds as string[]) || (out.users as string[]) || [],
        roleIds: (out.roleIds as string[]) || (out.roles as string[]) || [],
        everyone: Boolean(out.everyone || out.mentionEveryone),
      };
    }
  } catch {
    /* ignore */
  }
  return { userIds: [], roleIds: [], everyone: /@(everyone|here)/.test(content) };
}
