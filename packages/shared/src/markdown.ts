/**
 * XSS-sicherer Markdown-Renderer für Chatnachrichten.
 *
 * Ablauf: Zuerst wird der gesamte Quelltext HTML-escapet, danach werden
 * Code-Blöcke und Code-Spans per Platzhalter-Technik aus dem Text gelöst,
 * damit in ihnen keine weitere Formatierung greift. Erst danach laufen
 * Block- (Zitate, Überschriften, Listen) und Inline-Regeln
 * (fett/kursiv/Spoiler/Links/Erwähnungen) über den bereits escapeten Text.
 * Rohes HTML aus der Eingabe kann so niemals durchschlagen.
 */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'class',
  'extends',
  'import',
  'from',
  'export',
  'default',
  'new',
  'typeof',
  'instanceof',
  'async',
  'await',
  'try',
  'catch',
  'finally',
  'throw',
  'switch',
  'case',
  'break',
  'continue',
  'true',
  'false',
  'null',
  'undefined',
  'this',
  'interface',
  'type',
  'enum',
  'in',
  'of',
]);

/**
 * Leichtes Syntax-Highlighting für js/ts/json – arbeitet bewusst auf dem
 * bereits escapeten Text (Zeichenketten liegen als &quot;…&quot; vor) und
 * tokenisiert in einem Durchlauf, damit nichts ineinander verschachtelt wird.
 */
function highlightCode(escapedCode: string, lang: string): string {
  if (!['js', 'ts', 'javascript', 'typescript', 'json', 'jsx', 'tsx'].includes(lang)) {
    return escapedCode;
  }
  const tokenRegex =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(&quot;(?:[^&\n]|&(?!quot;))*?&quot;|&#39;(?:[^&\n]|&(?!#39;))*?&#39;)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_$][A-Za-z0-9_$]*)\b/g;
  return escapedCode.replace(
    tokenRegex,
    (full, comment, str, num, word) => {
      if (comment !== undefined) {
        return `<span class="tok-c">${full}</span>`;
      }
      if (str !== undefined) {
        return `<span class="tok-s">${full}</span>`;
      }
      if (num !== undefined) {
        return `<span class="tok-n">${full}</span>`;
      }
      if (word !== undefined && KEYWORDS.has(word)) {
        return `<span class="tok-k">${full}</span>`;
      }
      return full;
    },
  );
}

interface PlaceholderStore {
  map: Map<string, string>;
  next: number;
  put(kind: string, html: string): string;
  restore(text: string): string;
}

function createStore(): PlaceholderStore {
  const map = new Map<string, string>();
  let counter = 0;
  return {
    map,
    next: 0,
    put(kind: string, html: string): string {
      const token = `\u0001${kind}:${counter}\u0001`;
      map.set(token, html);
      counter += 1;
      return token;
    },
    restore(text: string): string {
      let result = text;
      // Platzhalter können verschachtelt sein (z. B. Link mit Code-Span darin):
      // so lange ersetzen, bis keiner mehr übrig ist.
      for (let depth = 0; depth < 10; depth++) {
        let changed = false;
        for (const [token, html] of map.entries()) {
          if (result.includes(token)) {
            result = result.split(token).join(html);
            changed = true;
          }
        }
        if (!changed) {
          break;
        }
      }
      return result;
    },
  };
}

/** Fett/Unterstrichen/Kursiv/Durchgestrichen/Spoiler – ohne Links & Code. */
function applyEmphasis(text: string): string {
  let result = text;
  result = result.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__([^_\n]+?)__/g, '<u>$1</u>');
  result = result.replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
  result = result.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  result = result.replace(/(^|[^\w])_([^_\n]+?)_(?![\w])/g, '$1<em>$2</em>');
  result = result.replace(
    /\|\|([\s\S]+?)\|\|/g,
    '<span class="spoiler">$1</span>',
  );
  return result;
}

/**
 * Inline-Regeln für einen bereits escapeten Textabschnitt (ohne Code-Blöcke):
 * Erwähnungen, Links und Hervorhebungen. `inlineCodes` enthält die
 * Platzhalter der zuvor ausgelösten Code-Spans.
 */
function formatInline(
  chunk: string,
  inlineCodes: PlaceholderStore,
): string {
  const store = createStore();
  let result = chunk;

  // Erwähnungen – auf escapetem Text sind sie &lt;@…&gt; bzw. &lt;@&amp;…&gt;.
  result = result.replace(/&lt;@&amp;([A-Za-z0-9_-]+)&gt;/g, (_m, id) =>
    store.put(
      'mention',
      `<span class="mention" data-type="role" data-id="${id}">@${id}</span>`,
    ),
  );
  result = result.replace(/&lt;@([A-Za-z0-9_-]+)&gt;/g, (_m, id) =>
    store.put(
      'mention',
      `<span class="mention" data-type="user" data-id="${id}">@${id}</span>`,
    ),
  );
  result = result.replace(/&lt;#([A-Za-z0-9_-]+)&gt;/g, (_m, id) =>
    store.put(
      'mention',
      `<span class="mention" data-type="channel" data-id="${id}">#${id}</span>`,
    ),
  );
  result = result.replace(/(^|[^\w])@everyone(?![\w])/g, (_m, pre) =>
    `${pre}${store.put(
      'mention',
      '<span class="mention mention-everyone">@everyone</span>',
    )}`,
  );
  result = result.replace(/(^|[^\w])@here(?![\w])/g, (_m, pre) =>
    `${pre}${store.put(
      'mention',
      '<span class="mention mention-everyone">@here</span>',
    )}`,
  );

  // Markdown-Links [Text](https://…) – Linktext darf Hervorhebungen enthalten.
  result = result.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text, url) =>
      store.put(
        'link',
        `<a href="${url}" target="_blank" rel="nofollow noopener noreferrer">${applyEmphasis(
          text,
        )}</a>`,
      ),
  );

  // Reine URLs im Text verlinken (Satzzeichen am Ende bleiben draußen).
  result = result.replace(/https?:\/\/[^\s]+/g, (rawUrl) => {
    const trailingMatch = rawUrl.match(/[.,;:!?)\]]+$/);
    const trailing = trailingMatch ? trailingMatch[0] : '';
    const url = trailing
      ? rawUrl.slice(0, rawUrl.length - trailing.length)
      : rawUrl;
    if (!url) {
      return rawUrl;
    }
    return (
      store.put(
        'link',
        `<a href="${url}" target="_blank" rel="nofollow noopener noreferrer">${url}</a>`,
      ) + trailing
    );
  });

  result = applyEmphasis(result);
  result = store.restore(result);
  result = inlineCodes.restore(result);
  return result;
}

const BLOCK_PLACEHOLDER_LINE = /^\u0001block:\d+\u0001$/;

/** Rendert Chat-Markdown zu sicherem HTML (siehe Dateikopf). */
export function renderMarkdown(src: string): string {
  const source = src ?? '';
  const blockStore = createStore();
  const inlineStore = createStore();

  let text = escapeHtml(source);

  // 1) Fenced Code-Blöcke auslösen.
  text = text.replace(
    /```([A-Za-z0-9_+-]*)\r?\n([\s\S]*?)(?:```|$)/g,
    (_m, lang, code) => {
      const safeLang = String(lang).replace(/[^A-Za-z0-9_+-]/g, '');
      const trimmed = String(code).replace(/\n$/, '');
      const highlighted = highlightCode(trimmed, safeLang.toLowerCase());
      return blockStore.put(
        'block',
        `<pre class="md-code"><code data-lang="${safeLang}">${highlighted}</code></pre>`,
      );
    },
  );

  // 2) Inline-Code-Spans auslösen (keine Formatierung darin).
  text = text.replace(/`([^`\n]+?)`/g, (_m, code) =>
    inlineStore.put(
      'inline',
      `<code class="md-inline-code">${code}</code>`,
    ),
  );

  // 3) Block-Regeln zeilenweise anwenden.
  const lines = text.split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(
        paragraph.map((line) => formatInline(line, inlineStore)).join('<br>'),
      );
      paragraph = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (BLOCK_PLACEHOLDER_LINE.test(trimmed)) {
      flushParagraph();
      blocks.push(blockStore.restore(trimmed));
      i += 1;
      continue;
    }

    if (trimmed === '') {
      flushParagraph();
      i += 1;
      continue;
    }

    // Zitat: aufeinanderfolgende Zeilen mit "> " (oder ">").
    if (/^&gt;\s?/.test(line)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^&gt;\s?/, ''));
        i += 1;
      }
      blocks.push(
        `<blockquote>${quoteLines
          .map((q) => formatInline(q, inlineStore))
          .join('<br>')}</blockquote>`,
      );
      continue;
    }

    // Überschriften # / ## / ###.
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push(
        `<h${level} class="md-h${level} chat-small">${formatInline(
          heading[2],
          inlineStore,
        )}</h${level}>`,
      );
      i += 1;
      continue;
    }

    // Ungeordnete Liste: Zeilen mit "- " oder "* ".
    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        `<ul>${items
          .map((item) => `<li>${formatInline(item, inlineStore)}</li>`)
          .join('')}</ul>`,
      );
      continue;
    }

    paragraph.push(line);
    i += 1;
  }
  flushParagraph();

  // Code-Blöcke, die nicht allein auf einer Zeile standen, hier noch auflösen.
  return blockStore.restore(blocks.join('\n'));
}
