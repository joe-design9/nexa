/**
 * Passwort-Stärke (rein heuristisch, ohne Netzaufruf) mit deutschen Hinweisen.
 */

export type PasswordStrengthLabel =
  | 'Sehr schwach'
  | 'Schwach'
  | 'Okay'
  | 'Stark'
  | 'Sehr stark';

export interface PasswordStrength {
  /** 0 (sehr schwach) bis 4 (sehr stark). */
  score: 0 | 1 | 2 | 3 | 4;
  label: PasswordStrengthLabel;
  /** Deutsche Verbesserungshinweise; bei sehr starken Passwörtern ggf. leer. */
  feedback: string[];
}

const LABELS: PasswordStrengthLabel[] = [
  'Sehr schwach',
  'Schwach',
  'Okay',
  'Stark',
  'Sehr stark',
];

/** Häufig verwendete / leicht erratbare Passwörter und Begriffe (Kleinbuchstaben). */
export const COMMON_PASSWORDS: string[] = [
  'passwort',
  'password',
  'passw0rd',
  'password123',
  'passwort123',
  '123456',
  '12345678',
  '123456789',
  '12345',
  '1234',
  '1234567',
  '123123',
  '111111',
  '000000',
  '654321',
  'qwerty',
  'qwertz',
  'abc123',
  'letmein',
  'admin',
  'administrator',
  'welcome',
  'willkommen',
  'geheim',
  'monkey',
  'dragon',
  'master',
  'sunshine',
  'princess',
  'football',
  'iloveyou',
  'asdfgh',
  'zxcvbn',
  '1q2w3e',
  'superman',
  'shadow',
  'michael',
  'nexa',
  'nexa123',
  'hallo123',
  'test1234',
  'schalke04',
  'bayern',
];

function hasAscendingOrDescendingSequence(pw: string): boolean {
  const lower = pw.toLowerCase();
  let run = 1;
  let direction = 0;
  for (let i = 1; i < lower.length; i++) {
    const diff = lower.charCodeAt(i) - lower.charCodeAt(i - 1);
    if (diff === 1 || diff === -1) {
      if (direction !== 0 && diff !== direction) {
        run = 2;
        direction = diff;
      } else {
        run += 1;
        direction = diff;
      }
      if (run >= 4) {
        return true;
      }
    } else {
      run = 1;
      direction = 0;
    }
  }
  return false;
}

function containsCommonPassword(pw: string): boolean {
  const lower = pw.toLowerCase();
  return COMMON_PASSWORDS.some((entry) => lower.includes(entry));
}

export function passwordStrength(pw: string): PasswordStrength {
  const feedback: string[] = [];
  const password = pw ?? '';

  const hasLower = /[a-zäöüß]/.test(password);
  const hasUpper = /[A-ZÄÖÜ]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9ÄÖÜäöüß]/.test(password);
  const classCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(
    Boolean,
  ).length;

  let score = 0;
  // Länge: Basis ab 8 Zeichen, Bonus ab 12.
  if (password.length >= 8) {
    score += 1;
  }
  if (password.length >= 12) {
    score += 1;
  }
  // Zeichenklassen: ab 3 Klassen +1, bei allen 4 Klassen +2 gesamt.
  if (classCount >= 3) {
    score += 1;
  }
  if (classCount >= 4) {
    score += 1;
  }

  // Abzüge.
  const hasRepeat = /(.)\1{2,}/.test(password);
  const hasSequence = hasAscendingOrDescendingSequence(password);
  const hasCommon = containsCommonPassword(password);
  if (hasRepeat) {
    score -= 1;
  }
  if (hasSequence) {
    score -= 1;
  }
  if (hasCommon) {
    score -= 1;
  }

  const clamped = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4;

  if (password.length < 8) {
    feedback.push(
      'Zu kurz: Verwende mindestens 8 Zeichen – länger ist besser.',
    );
  } else if (password.length < 12) {
    feedback.push('Länger ist stärker: Ab 12 Zeichen gibt es einen Bonus.');
  }
  if (!hasLower || !hasUpper) {
    feedback.push('Mische Groß- und Kleinbuchstaben.');
  }
  if (!hasDigit) {
    feedback.push('Füge mindestens eine Zahl hinzu.');
  }
  if (!hasSpecial) {
    feedback.push('Füge ein Sonderzeichen hinzu (z. B. !, ?, #, -).');
  }
  if (hasRepeat) {
    feedback.push(
      'Vermeide Wiederholungen wie "aaa" oder dasselbe Zeichen mehrfach hintereinander.',
    );
  }
  if (hasSequence) {
    feedback.push(
      'Vermeide einfache Sequenzen wie "abcd", "9876" oder "1234".',
    );
  }
  if (hasCommon) {
    feedback.push(
      'Vermeide Wörterbuch-Begriffe und häufige Passwörter wie "passwort" oder "nexa".',
    );
  }

  return { score: clamped, label: LABELS[clamped], feedback };
}

/** Mindeststandard für Registrierung/Passwortwechsel: Länge ≥ 8 und Score ≥ 2. */
export function isPasswordAcceptable(pw: string): boolean {
  if (!pw || pw.length < 8) {
    return false;
  }
  return passwordStrength(pw).score >= 2;
}
