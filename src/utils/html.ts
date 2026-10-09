// Сообщения с сайта приходят HTML-ом из редактора (<p>, <br>, &nbsp;),
// а из этого клиента — простым текстом. Рендерим оба варианта безопасно.

const ALLOWED = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'A', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'CODE', 'PRE', 'SPAN', 'DIV']);
const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

export function looksLikeHtml(s: string) {
  return /<\/?[a-z][\s\S]*?>|&[a-z]+;|&#\d+;/i.test(s);
}

function safeHref(href: string | null) {
  if (!href) return null;
  try {
    const u = new URL(href, location.href);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:' ? u.href : null;
  } catch {
    return null;
  }
}

function linkifyTextNodes(root: Node, doc: Document) {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  while (walker.nextNode()) {
    const t = walker.currentNode as Text;
    if (t.parentElement?.closest('a')) continue;
    URL_RE.lastIndex = 0;
    if (URL_RE.test(t.data)) targets.push(t);
  }
  for (const t of targets) {
    const frag = doc.createDocumentFragment();
    let last = 0;
    t.data.replace(URL_RE, (match, offset: number) => {
      frag.append(t.data.slice(last, offset));
      const a = doc.createElement('a');
      a.href = match;
      a.textContent = match;
      frag.append(a);
      last = offset + match.length;
      return match;
    });
    frag.append(t.data.slice(last));
    t.replaceWith(frag);
  }
}

function clean(node: Node, doc: Document) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      if (!ALLOWED.has(el.tagName)) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE'].includes(el.tagName)) el.remove();
        else {
          clean(el, doc);
          el.replaceWith(...Array.from(el.childNodes));
        }
        continue;
      }
      const href = el.tagName === 'A' ? safeHref(el.getAttribute('href')) : null;
      for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
      if (el.tagName === 'A') {
        if (href) {
          el.setAttribute('href', href);
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer nofollow');
        }
      }
      clean(el, doc);
    } else if (child.nodeType !== Node.TEXT_NODE) {
      child.remove();
    }
  }
}

/** Готовый безопасный HTML для пузыря. */
export function messageHtml(content: string): string {
  const doc = document.implementation.createHTMLDocument('');
  const root = doc.createElement('div');
  if (looksLikeHtml(content)) {
    root.innerHTML = content;
    // пустые абзацы из редактора (<p>&nbsp;</p>) в конце не нужны
    while (root.lastElementChild?.tagName === 'P' && !root.lastElementChild.textContent?.trim() && !root.lastElementChild.querySelector('img')) {
      root.lastElementChild.remove();
    }
  } else {
    root.textContent = content;
  }
  clean(root, doc);
  linkifyTextNodes(root, doc);
  root.querySelectorAll('a').forEach((a) => {
    if (!a.getAttribute('target')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
  return root.innerHTML;
}

/** Плоский текст для превью в списке диалогов. */
export function plainText(content: string | null): string {
  if (!content) return '';
  if (!looksLikeHtml(content)) return content;
  const doc = new DOMParser().parseFromString(content.replace(/<br\s*\/?>|<\/p>/gi, ' $&'), 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const escapeMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/**
 * Текст из поля ввода → HTML в формате редактора сайта (<p>…<br>…</p>),
 * чтобы сообщения из нового чата одинаково выглядели и в старом интерфейсе.
 * VITE_SEND_HTML=false — отправлять простой текст, как в контракте.
 */
export function composeContent(text: string): string {
  if (import.meta.env.VITE_SEND_HTML === 'false') return text;
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/[&<>"]/g, (c) => escapeMap[c]).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** HTML сообщения → текст для поля ввода при редактировании (абзацы и переносы сохраняются). */
export function htmlToText(content: string | null): string {
  if (!content) return '';
  if (!looksLikeHtml(content)) return content;
  const marked = content.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  const doc = new DOMParser().parseFromString(marked, 'text/html');
  return (doc.body.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
