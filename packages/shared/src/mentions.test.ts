import {
  formatChannelMention,
  formatRoleMention,
  formatUserMention,
  parseMentions,
} from './mentions';

describe('parseMentions', () => {
  it('parsed alle Token-Arten', () => {
    const result = parseMentions(
      'Hey <@user1>, Rolle <@&role9>, Kanal <#chan2>',
    );
    expect(result.userIds).toEqual(['user1']);
    expect(result.roleIds).toEqual(['role9']);
    expect(result.channelIds).toEqual(['chan2']);
    expect(result.everyone).toBe(false);
    expect(result.here).toBe(false);
  });

  it('dedupliziert IDs und erhält die Reihenfolge', () => {
    const result = parseMentions('<@b> <@a> <@b> <#x> <#x> <@&r> <@&r>');
    expect(result.userIds).toEqual(['b', 'a']);
    expect(result.channelIds).toEqual(['x']);
    expect(result.roleIds).toEqual(['r']);
  });

  it('unterstützt IDs mit Unterstrich und Bindestrich', () => {
    const result = parseMentions('<@user_1-x>');
    expect(result.userIds).toEqual(['user_1-x']);
  });

  it('erkennt @everyone und @here an Wortgrenzen', () => {
    expect(parseMentions('@everyone aufgepasst').everyone).toBe(true);
    expect(parseMentions('ping @here!').here).toBe(true);
    expect(parseMentions('@everyone @here').everyone).toBe(true);
    expect(parseMentions('@everyone @here').here).toBe(true);
  });

  it('erkennt @everyone nicht innerhalb anderer Wörter/Adressen', () => {
    expect(parseMentions('mail@everyone.example').everyone).toBe(false);
    expect(parseMentions('@everyonex').everyone).toBe(false);
    expect(parseMentions('@herex').here).toBe(false);
  });

  it('leerer Text ergibt leere Listen', () => {
    expect(parseMentions('')).toEqual({
      userIds: [],
      roleIds: [],
      channelIds: [],
      everyone: false,
      here: false,
    });
  });
});

describe('format helpers', () => {
  it('formatiert Erwähnungen in Token-Schreibweise', () => {
    expect(formatUserMention('42')).toBe('<@42>');
    expect(formatRoleMention('42')).toBe('<@&42>');
    expect(formatChannelMention('42')).toBe('<#42>');
  });

  it('formatierte Tokens werden von parseMentions wieder gelesen', () => {
    const text = `${formatUserMention('u1')} ${formatRoleMention(
      'r1',
    )} ${formatChannelMention('c1')}`;
    const parsed = parseMentions(text);
    expect(parsed.userIds).toEqual(['u1']);
    expect(parsed.roleIds).toEqual(['r1']);
    expect(parsed.channelIds).toEqual(['c1']);
  });
});
