// Форматированный текст сообщений: редактор ↔ формат сайта.
//
// В редакторе — только строчная разметка: b, i, u, s, a и <br> между строками.
// В сообщении (как у редактора сайта) — абзацы <p>…</p>, внутри — те же теги.
// Всё остальное (стили, span, div из вставки Word и т. п.) отбрасывается.

const ZWSP = /​/g; // невидимый пробел — «выход» из форматирования после правил разметки
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

const INLINE: Record<string, string> = {
  B: 'b', STRONG: 'b',
  I: 'i', EM: 'i',
  U: 'u', INS: 'u',
  S: 's', STRIKE: 's', DEL: 's',
};
const BLOCK = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'TR']);
const DROP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'HEAD', 'TITLE', 'META']);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function safeHref(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const withScheme = /^www\./i.test(value) ? `https://${value}` : value;
  try {
    const u = new URL(withScheme);
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

/** Ссылки в простом тексте → <a>. На входе — уже экранированный текст. */
function linkifyEscaped(text: string) {
  return text.replace(URL_RE, (m) => {
    const href = safeHref(m.replace(/&amp;/g, '&'));
    return href ? `<a href="${esc(href)}">${m}</a>` : m;
  });
}

/**
 * DOM → строчная разметка с <br> вместо блоков. Единый «очиститель»
 * для вставки, для итогового сообщения и для загрузки сообщения в редактор.
 */
/** Форматирование, заданное стилем (Word, Google Docs, страницы сайтов). */
function styleTags(el: HTMLElement): string[] {
  const st = el.style;
  if (!st) return [];
  const tags: string[] = [];
  const weight = st.fontWeight;
  if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) tags.push('b');
  if (st.fontStyle === 'italic' || st.fontStyle === 'oblique') tags.push('i');
  const deco = `${st.textDecoration} ${st.textDecorationLine}`;
  if (deco.includes('underline')) tags.push('u');
  if (deco.includes('line-through')) tags.push('s');
  return tags;
}

/** Явно отменённое стилем форматирование: Google Docs оборачивает всё в <b style="font-weight:normal">. */
function cancelledByStyle(el: HTMLElement, tag: string) {
  const st = el.style;
  if (!st) return false;
  if (tag === 'b') return st.fontWeight === 'normal' || (Number(st.fontWeight) > 0 && Number(st.fontWeight) < 600);
  if (tag === 'i') return st.fontStyle === 'normal';
  return false;
}

const wrap = (tags: string[], inner: string) =>
  inner.replace(/<br>/g, '').trim() ? tags.reduceRight((acc, t) => `<${t}>${acc}</${t}>`, inner) : inner;

/**
 * DOM → строчная разметка. newlines — переводы строк в тексте считать
 * переносами (так их вставляет Chrome в редакторе); в HTML сайта это просто
 * форматирование исходника, и там они схлопываются в пробел.
 */
function toInline(node: Node, inLink = false, newlines = false): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      let text = esc((child as Text).data.replace(ZWSP, '').replace(/\u00a0/g, ' '));
      // в редакторе Chrome вставляет переносы символом \n; в HTML сайта это форматирование исходника
      text = newlines ? text.replace(/\r?\n/g, '<br>') : text.replace(/\s*\n\s*/g, ' ');
      out += inLink ? text : linkifyEscaped(text);
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName;
    if (DROP.has(tag)) return;
    if (tag === 'BR') {
      out += '<br>';
      return;
    }
    if (tag === 'A') {
      const href = safeHref(el.getAttribute('href'));
      const inner = toInline(el, true, newlines);
      out += href && !inLink ? `<a href="${esc(href)}">${inner}</a>` : inner;
      return;
    }
    const inner = toInline(el, inLink, newlines);
    const tags = [...(INLINE[tag] && !cancelledByStyle(el, INLINE[tag]) ? [INLINE[tag]] : []), ...styleTags(el)];
    const formatted = wrap([...new Set(tags)], inner);
    if (BLOCK.has(tag)) {
      // блок = отдельная строка; абзацы (<p>) — пустая строка до и после
      const paragraph = tag === 'P' || tag === 'BLOCKQUOTE';
      if (out && !out.endsWith('<br>')) out += paragraph ? '<br><br>' : '<br>';
      out += formatted;
      if (paragraph) out += '<br><br>';
      else if (formatted && !formatted.endsWith('<br>')) out += '<br>';
    } else {
      out += formatted; // span со стилями и прочее — разметка из стиля + содержимое
    }
  });
  return out;
}

function parse(html: string) {
  const doc = document.implementation.createHTMLDocument('');
  const root = doc.createElement('div');
  root.innerHTML = html;
  return root;
}

/** Убирает <br> по краям и схлопывает 3+ подряд до одной пустой строки. */
function tidy(inline: string) {
  return inline
    .replace(/^(\s*<br>)+/, '')
    .replace(/(<br>\s*)+$/, '')
    .replace(/(<br>\s*){3,}/g, '<br><br>');
}

/** Чистая строчная разметка из произвольного HTML — для вставки из буфера. */
export function cleanPastedHtml(html: string): string {
  return tidy(toInline(parse(html)));
}

/** Простой текст → разметка редактора (переносы → <br>, ссылки распознаются). */
export function textToEditorHtml(text: string): string {
  return tidy(linkifyEscaped(esc(text.replace(/\r\n?/g, '\n'))).replace(/\n/g, '<br>'));
}

/** Сообщение (HTML сайта или простой текст) → разметка для редактора. */
export function toEditorHtml(content: string | null): string {
  if (!content) return '';
  if (!/<\/?[a-z][\s\S]*?>|&[a-z]+;|&#\d+;/i.test(content)) return textToEditorHtml(content);
  return tidy(toInline(parse(content)));
}

/** Содержимое редактора → HTML сообщения в формате сайта: <p>…</p>. '' — если пусто. */
export function serializeEditor(root: HTMLElement): string {
  const inline = tidy(toInline(root, false, true));
  if (!inline.replace(/<br>|<[^>]+>|\s|&nbsp;/g, '')) return '';
  return inline
    .split(/<br>\s*<br>/)
    .map((para) => `<p>${tidy(para)}</p>`)
    .join('');
}

/** Нормализованная форма сообщения — чтобы понять, изменилось ли оно при правке. */
export function normalizeContent(content: string | null): string {
  return serializeEditor(parse(toEditorHtml(content)));
}

/** Текст без разметки (для простого режима VITE_SEND_HTML=false и проверок). */
export function editorPlainText(root: HTMLElement): string {
  return (root.innerText || '').replace(ZWSP, '').replace(/\u00a0/g, ' ').trim();
}

export { esc as escapeHtml };
