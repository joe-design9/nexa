/**
 * Erwähnungen in Nachrichtentexten: `<@userId>`, `<@&roleId>`, `<#channelId>`
 * sowie die Literale `@everyone` und `@here`.
 */

export interface ParsedMentions {
  userIds: string[];
  roleIds: string[];
  channelIds: string[];
  everyone: boolean;
  here: boolean;
}

const MENTION_TOKEN_REGEX =
  /<@&([A-Za-z0-9_-]+)>|<@!?([A-Za-z0-9_-]+)>|<#([A-Za-z0-9_-]+)>/g;

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) {
    list.push(value);
  }
}

/** Parsed alle Erwähnungen; IDs werden dedupliziert (Reihenfolge bleibt). */
export function parseMentions(content: string): ParsedMentions {
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const channelIds: string[] = [];

  for (const match of (content ?? '').matchAll(MENTION_TOKEN_REGEX)) {
    if (match[1] !== undefined) {
      pushUnique(roleIds, match[1]);
    } else if (match[2] !== undefined) {
      pushUnique(userIds, match[2]);
    } else if (match[3] !== undefined) {
      pushUnique(channelIds, match[3]);
    }
  }

  const everyone = /(^|[^\w])@everyone(?![\w])/.test(content ?? '');
  const here = /(^|[^\w])@here(?![\w])/.test(content ?? '');

  return { userIds, roleIds, channelIds, everyone, here };
}

export function formatUserMention(id: string): string {
  return `<@${id}>`;
}

export function formatRoleMention(id: string): string {
  return `<@&${id}>`;
}

export function formatChannelMention(id: string): string {
  return `<#${id}>`;
}
