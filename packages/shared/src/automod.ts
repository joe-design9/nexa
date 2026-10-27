/**
 * Serverseitiger Automod-Baustein: Wortfilter (inkl. Leet-Speak und
 * auseinandergezogener Schreibweise), Link-Zählung, Erwähnungs-Limit
 * und Burst-Erkennung.
 */
import { parseMentions } from './mentions';

const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/**
 * Normalisiert Text für den Wortfilter: Kleinschreibung, Leet-Speak
 * zurückübersetzen, alles außer Buchstaben/Ziffern/Leerzeichen entfernen
 * und Leerzeichen zusammenfassen.
 */
export function normalizeForFilter(text: string): string {
  const lowered = (text ?? '').toLowerCase();
  const deLeeted = lowered
    .split('')
    .map((ch) => LEET_MAP[ch] ?? ch)
    .join('');
  return deLeeted.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Prüft, ob `content` eines der gesperrten Wörter enthält.
 * Verglichen wird auf normalisiertem Text mit Wortgrenzen; zusätzlich wird
 * die auseinandergezogene Umgehung ("b a d") erkannt, indem Folgen von
 * Einzelzeichen-Tokens ohne Leerzeichen zusammengesetzt verglichen werden.
 */
export function containsBannedWord(
  content: string,
  bannedWords: string[],
): boolean {
  const normalized = normalizeForFilter(content);
  if (!normalized || !bannedWords || bannedWords.length === 0) {
    return false;
  }
  const tokens = normalized.split(' ').filter(Boolean);

  for (const rawWord of bannedWords) {
    const banned = normalizeForFilter(rawWord ?? '');
    if (!banned) {
      continue;
    }
    // 1) Wortgrenzen-Treffer (auch mehrteilige Einträge wie "bad word").
    const boundaryRegex = new RegExp(
      `(?:^| )${escapeRegExp(banned)}(?: |$)`,
    );
    if (boundaryRegex.test(normalized)) {
      return true;
    }
    // 2) Auseinandergezogene Schreibweise: Token-Fenster ohne Leerzeichen
    //    vergleichen, sobald das Fenster Einzelzeichen enthält oder aus
    //    mehr Tokens besteht als der gesperrte Begriff selbst.
    const bannedCompact = banned.replace(/ /g, '');
    const bannedTokenCount = banned.split(' ').length;
    if (bannedCompact.length >= 2) {
      for (let start = 0; start < tokens.length; start++) {
        let joined = '';
        for (
          let end = start;
          end < tokens.length && joined.length < bannedCompact.length;
          end++
        ) {
          joined += tokens[end];
          if (
            joined === bannedCompact &&
            end - start + 1 > 1 &&
            (tokens
              .slice(start, end + 1)
              .some((t) => t.length === 1) ||
              end - start + 1 !== bannedTokenCount)
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>]+/gi;

/** Zählt Links (http/https und www.-Adressen) im Text. */
export function countLinks(content: string): number {
  const matches = (content ?? '').match(URL_REGEX);
  return matches ? matches.length : 0;
}

export type AutomodBlockReason =
  | 'BANNED_WORD'
  | 'LINK_BLOCKED'
  | 'MENTION_LIMIT';

export interface AutomodOptions {
  bannedWords?: string[];
  blockLinks?: boolean;
  maxMentions?: number;
}

export interface AutomodResult {
  blocked: boolean;
  reasons: AutomodBlockReason[];
}

/**
 * Wendet die Automod-Regeln auf eine Nachricht an.
 * Erwähnungen zählen als: User-IDs + Rollen-IDs + 1 für `@everyone`
 * + 1 für `@here` (falls jeweils vorhanden und Limit gesetzt).
 */
export function checkAutomod(
  content: string,
  options: AutomodOptions,
): AutomodResult {
  const reasons: AutomodBlockReason[] = [];
  const text = content ?? '';

  if (
    options.bannedWords &&
    options.bannedWords.length > 0 &&
    containsBannedWord(text, options.bannedWords)
  ) {
    reasons.push('BANNED_WORD');
  }

  if (options.blockLinks && countLinks(text) > 0) {
    reasons.push('LINK_BLOCKED');
  }

  if (options.maxMentions !== undefined) {
    const mentions = parseMentions(text);
    const mentionCount =
      mentions.userIds.length +
      mentions.roleIds.length +
      (mentions.everyone ? 1 : 0) +
      (mentions.here ? 1 : 0);
    if (mentionCount > options.maxMentions) {
      reasons.push('MENTION_LIMIT');
    }
  }

  return { blocked: reasons.length > 0, reasons };
}

/**
 * Burst-Erkennung: `true`, wenn in irgendeinem Zeitfenster der Länge
 * `windowMs` mindestens `limit` Zeitstempel liegen.
 */
export function isSpamBurst(
  timestamps: number[],
  limit: number,
  windowMs = 5000,
): boolean {
  if (!timestamps || timestamps.length === 0 || limit <= 0) {
    return false;
  }
  if (timestamps.length < limit) {
    return false;
  }
  const sorted = [...timestamps].sort((a, b) => a - b);
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while (sorted[end] - sorted[start] > windowMs) {
      start += 1;
    }
    if (end - start + 1 >= limit) {
      return true;
    }
  }
  return false;
}
