import { renderMarkdown } from './markdown';

describe('renderMarkdown XSS safety', () => {
  it('escapet <script> vollständig', () => {
    const html = renderMarkdown('<script>alert("x")</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapet img onerror (kein echtes img-Tag, kein Handler)', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it('lässt kein rohes HTML durch, auch nicht in Zitaten/Listen', () => {
    const html = renderMarkdown('> <b>fett?</b>\n- <i>kursiv?</i>');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<i>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('escapet Anführungszeichen und Apostrophe', () => {
    const html = renderMarkdown('Er sagte "Hallo" und \'Tschüss\'');
    expect(html).toContain('&quot;Hallo&quot;');
    expect(html).toContain('&#39;Tschüss&#39;');
  });

  it('erlaubt keine javascript:-Links', () => {
    const html = renderMarkdown('[klick](javascript:alert(1))');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('<a ');
  });
});

describe('renderMarkdown inline formatting', () => {
  it('rendert bold und italic', () => {
    expect(renderMarkdown('**fett**')).toContain('<strong>fett</strong>');
    expect(renderMarkdown('*kursiv*')).toContain('<em>kursiv</em>');
    expect(renderMarkdown('_kursiv_')).toContain('<em>kursiv</em>');
  });

  it('rendert underline, strike und spoiler ohne Inline-JS', () => {
    expect(renderMarkdown('__unterstrichen__')).toContain(
      '<u>unterstrichen</u>',
    );
    expect(renderMarkdown('~~weg~~')).toContain('<del>weg</del>');
    const spoiler = renderMarkdown('||geheim||');
    expect(spoiler).toContain('<span class="spoiler">geheim</span>');
    expect(spoiler).not.toContain('onclick');
  });

  it('rendert Inline-Code und schützt Inhalt vor weiterer Formatierung', () => {
    const html = renderMarkdown('`**kein fett**`');
    expect(html).toContain(
      '<code class="md-inline-code">**kein fett**</code>',
    );
    expect(html).not.toContain('<strong>');
  });

  it('rendert Links mit sicheren Attributen', () => {
    const html = renderMarkdown('[Nexa](https://nexa.local/start)');
    expect(html).toContain('href="https://nexa.local/start"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="nofollow noopener noreferrer"');
    expect(html).toContain('>Nexa</a>');
  });

  it('verlinkt reine URLs automatisch', () => {
    const html = renderMarkdown('Siehe https://nexa.local/hilfe bitte');
    expect(html).toContain(
      '<a href="https://nexa.local/hilfe" target="_blank" rel="nofollow noopener noreferrer">https://nexa.local/hilfe</a>',
    );
  });

  it('rendert Erwähnungen als mention-Spans mit data-Attributen', () => {
    const html = renderMarkdown(
      'Hey <@lena1> und <@&mod2>, schaut in <#allgemein3>',
    );
    expect(html).toContain('data-type="user" data-id="lena1"');
    expect(html).toContain('data-type="role" data-id="mod2"');
    expect(html).toContain('data-type="channel" data-id="allgemein3"');
    expect(html).toContain('class="mention"');
  });

  it('rendert @everyone als eigene mention-Span', () => {
    const html = renderMarkdown('@everyone aufgepasst');
    expect(html).toContain('class="mention mention-everyone"');
    expect(html).toContain('@everyone');
  });

  it('wandelt Zeilenumbrüche innerhalb eines Absatzes in <br>', () => {
    expect(renderMarkdown('Zeile 1\nZeile 2')).toContain(
      'Zeile 1<br>Zeile 2',
    );
  });
});

describe('renderMarkdown block formatting', () => {
  it('rendert Zitate als blockquote', () => {
    const html = renderMarkdown('> erste Zeile\n> zweite Zeile');
    expect(html).toContain('<blockquote>erste Zeile<br>zweite Zeile</blockquote>');
  });

  it('rendert Überschriften der Level 1–3', () => {
    expect(renderMarkdown('# Titel')).toContain('<h1');
    expect(renderMarkdown('## Titel')).toContain('<h2');
    expect(renderMarkdown('### Titel')).toContain('<h3');
    expect(renderMarkdown('# **Fett**')).toContain('<strong>Fett</strong>');
  });

  it('rendert Listen als ul/li', () => {
    const html = renderMarkdown('- eins\n- zwei');
    expect(html).toContain('<ul><li>eins</li><li>zwei</li></ul>');
  });

  it('rendert Code-Blöcke mit Sprachangabe', () => {
    const html = renderMarkdown('```ts\nconst x = 1;\n```');
    expect(html).toContain('<pre class="md-code">');
    expect(html).toContain('data-lang="ts"');
    expect(html).toContain('const');
  });

  it('highlightet Schlüsselwörter, Strings und Zahlen in JS-Code', () => {
    const html = renderMarkdown('```js\nconst name = "nexa";\nconst n = 42;\n```');
    expect(html).toContain('<span class="tok-k">const</span>');
    expect(html).toContain('<span class="tok-s">&quot;nexa&quot;</span>');
    expect(html).toContain('<span class="tok-n">42</span>');
  });

  it('escapet HTML auch innerhalb von Code-Blöcken', () => {
    const html = renderMarkdown('```html\n<div>hi</div>\n```');
    expect(html).not.toContain('<div>');
    expect(html).toContain('&lt;div&gt;');
  });

  it('formatiert Markdown nicht innerhalb von Code-Blöcken', () => {
    const html = renderMarkdown('```\n**nicht fett**\n```');
    expect(html).not.toContain('<strong>');
    expect(html).toContain('**nicht fett**');
  });
});
