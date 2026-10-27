import {
  checkAutomod,
  containsBannedWord,
  countLinks,
  isSpamBurst,
  normalizeForFilter,
} from './automod';

describe('normalizeForFilter', () => {
  it('übersetzt Leet-Speak und normalisiert', () => {
    expect(normalizeForFilter('B4D   W0RD!')).toBe('bad word');
    expect(normalizeForFilter('H3ll0, W3lt')).toBe('hello welt');
  });
});

describe('containsBannedWord', () => {
  it('findet ein gesperrtes Wort an Wortgrenzen', () => {
    expect(containsBannedWord('das ist bad word hier', ['bad word'])).toBe(true);
    expect(containsBannedWord('bad', ['bad'])).toBe(true);
  });

  it('findet Leet-Schreibweise gegen einen normal geschriebenen Eintrag', () => {
    expect(containsBannedWord('b4d w0rd', ['bad word'])).toBe(true);
    expect(containsBannedWord('B4D!', ['bad'])).toBe(true);
  });

  it('findet auseinandergezogene Schreibweise', () => {
    expect(containsBannedWord('b a d', ['bad'])).toBe(true);
    expect(containsBannedWord('b a d w o r d', ['bad word'])).toBe(true);
  });

  it('meldet keine Teilwörter innerhalb anderer Wörter', () => {
    expect(containsBannedWord('badger ist ein Tier', ['bad'])).toBe(false);
    expect(containsBannedWord('alles entspannt hier', ['bad'])).toBe(false);
  });

  it('leere Sperrliste sperrt nichts', () => {
    expect(containsBannedWord('bad word', [])).toBe(false);
  });
});

describe('countLinks', () => {
  it('zählt http/https- und www-Links', () => {
    expect(countLinks('schau https://nexa.local und www.example.org an')).toBe(2);
    expect(countLinks('kein link hier')).toBe(0);
    expect(countLinks('http://a.example https://b.example/x')).toBe(2);
  });
});

describe('checkAutomod', () => {
  it('blockiert gesperrte Wörter mit Grund BANNED_WORD', () => {
    const result = checkAutomod('b4d w0rd', { bannedWords: ['bad word'] });
    expect(result.blocked).toBe(true);
    expect(result.reasons).toContain('BANNED_WORD');
  });

  it('blockiert Links nur, wenn blockLinks aktiv ist', () => {
    expect(
      checkAutomod('https://nexa.local', { blockLinks: true }).reasons,
    ).toContain('LINK_BLOCKED');
    const allowed = checkAutomod('https://nexa.local', { blockLinks: false });
    expect(allowed.blocked).toBe(false);
    expect(allowed.reasons).toEqual([]);
  });

  it('erzwingt das Erwähnungs-Limit inkl. @everyone/@here', () => {
    const result = checkAutomod('<@1> <@2> @everyone', { maxMentions: 2 });
    expect(result.blocked).toBe(true);
    expect(result.reasons).toContain('MENTION_LIMIT');
    expect(
      checkAutomod('<@1> <@2>', { maxMentions: 2 }).blocked,
    ).toBe(false);
    // Ohne gesetztes Limit keine Prüfung.
    expect(checkAutomod('@everyone @here <@1> <@2> <@3>', {}).blocked).toBe(
      false,
    );
  });

  it('sammelt mehrere Gründe gleichzeitig', () => {
    const result = checkAutomod('bad https://x.example @everyone <@1>', {
      bannedWords: ['bad'],
      blockLinks: true,
      maxMentions: 1,
    });
    expect(result.reasons).toEqual([
      'BANNED_WORD',
      'LINK_BLOCKED',
      'MENTION_LIMIT',
    ]);
  });

  it('lässt saubere Nachrichten durch', () => {
    expect(
      checkAutomod('Hallo zusammen, bis später!', {
        bannedWords: ['bad'],
        blockLinks: true,
        maxMentions: 5,
      }),
    ).toEqual({ blocked: false, reasons: [] });
  });
});

describe('isSpamBurst', () => {
  it('erkennt einen Burst innerhalb des Fensters', () => {
    expect(isSpamBurst([0, 1000, 2000, 3000, 4000], 5)).toBe(true);
    expect(isSpamBurst([0, 1000, 2000, 3000, 4999], 5, 5000)).toBe(true);
  });

  it('erkennt keinen Burst bei verteilten Nachrichten', () => {
    expect(isSpamBurst([0, 6000, 12000, 18000, 24000], 5)).toBe(false);
    expect(isSpamBurst([0, 1000], 5)).toBe(false);
    expect(isSpamBurst([], 3)).toBe(false);
  });

  it('funktioniert auch mit unsortierten Zeitstempeln', () => {
    expect(isSpamBurst([4000, 0, 2000, 1000, 3000], 5)).toBe(true);
  });

  it('respektiert ein benutzerdefiniertes Fenster', () => {
    expect(isSpamBurst([0, 900, 1800], 3, 1000)).toBe(false);
    expect(isSpamBurst([0, 900, 1800], 2, 1000)).toBe(true);
  });
});
