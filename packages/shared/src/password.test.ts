import { isPasswordAcceptable, passwordStrength } from './password';

describe('passwordStrength', () => {
  it('bewertet sehr kurze Passwörter als sehr schwach', () => {
    const result = passwordStrength('abc');
    expect(result.score).toBe(0);
    expect(result.label).toBe('Sehr schwach');
    expect(result.feedback.join(' ')).toMatch(/mindestens 8 Zeichen/);
  });

  it('bewertet ein reines Zahlenpasswort als sehr schwach', () => {
    const result = passwordStrength('12345678');
    expect(result.score).toBe(0);
    expect(isPasswordAcceptable('12345678')).toBe(false);
  });

  it('bestraft "Passwort123" als Wörterbuch-/Standardpasswort', () => {
    const result = passwordStrength('Passwort123');
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.label).not.toBe('Stark');
    expect(result.feedback.join(' ')).toMatch(/passwort/i);
    expect(isPasswordAcceptable('Passwort123')).toBe(false);
    // Ein vergleichbares Passwort ohne Wörterbuch-Begriff schneidet besser ab.
    expect(passwordStrength('XkqzvWmp123').score).toBeGreaterThan(
      result.score,
    );
  });

  it('bestraft Wiederholungen', () => {
    const result = passwordStrength('aaaaaaaaAA11!!');
    expect(result.feedback.join(' ')).toMatch(/Wiederholungen/);
    expect(result.score).toBeLessThan(4);
  });

  it('bestraft Sequenzen wie 1234', () => {
    const result = passwordStrength('xY1234!zQw');
    expect(result.feedback.join(' ')).toMatch(/Sequenzen/);
  });

  it('gibt Hinweise für fehlende Zeichenklassen auf Deutsch', () => {
    const result = passwordStrength('nurkleinbuchstaben');
    const feedback = result.feedback.join(' ');
    expect(feedback).toMatch(/Groß- und Kleinbuchstaben/);
    expect(feedback).toMatch(/Zahl/);
    expect(feedback).toMatch(/Sonderzeichen/);
  });

  it('bewertet ein gemischtes Passwort mittlerer Länge als mindestens okay', () => {
    const result = passwordStrength('XkqzvWmp1!');
    expect(result.score).toBeGreaterThanOrEqual(2);
    expect(isPasswordAcceptable('XkqzvWmp1!')).toBe(true);
  });

  it('bewertet eine lange Passphrase als sehr stark', () => {
    const result = passwordStrength('Blauer Elefant tanzt im Regen 42!');
    expect(result.score).toBe(4);
    expect(result.label).toBe('Sehr stark');
    expect(isPasswordAcceptable('Blauer Elefant tanzt im Regen 42!')).toBe(
      true,
    );
  });

  it('Score bleibt immer im Bereich 0..4 mit passendem Label', () => {
    for (const pw of ['', 'a', 'Test', 'ganzlangundvielfaeltig', 'A1!aaaaaaaaaaaa']) {
      const { score, label } = passwordStrength(pw);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(4);
      expect(['Sehr schwach', 'Schwach', 'Okay', 'Stark', 'Sehr stark']).toContain(
        label,
      );
    }
  });
});

describe('isPasswordAcceptable', () => {
  it('verlangt mindestens 8 Zeichen', () => {
    expect(isPasswordAcceptable('Xk1!qzv')).toBe(false);
  });

  it('lehnt Score < 2 auch bei ausreichender Länge ab', () => {
    expect(isPasswordAcceptable('passwordpassword')).toBe(false);
  });
});
