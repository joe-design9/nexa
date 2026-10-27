import { randomInt } from 'crypto';

/**
 * Plattform-Invite-Codes (Registrierungs-Gate).
 * Format: NEXA-XXXXXX-XXXXXX. Das Alphabet lässt leicht verwechselbare
 * Zeichen (0/O, 1/I/L) weg, damit Codes sicher abgetippt und vorgelesen
 * werden können.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomPart(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export function generatePlatformInviteCode(): string {
  return `NEXA-${randomPart(6)}-${randomPart(6)}`;
}

/** Eingaben werden tolerant normalisiert (Trim + Großschreibung). */
export function normalizePlatformInviteCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}
