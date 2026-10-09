import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { escapeHtml, safeHref } from '../utils/richtext';
import { IconCheck, IconClose } from './Icons';
import s from './FormatToolbar.module.css';

interface Props {
  editor: RefObject<HTMLDivElement | null>;
  onChange: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

const FORMATS = [
  { command: 'bold', label: 'Жирный', hint: `${MOD}B`, glyph: <b>Ж</b> },
  { command: 'italic', label: 'Курсив', hint: `${MOD}I`, glyph: <i>К</i> },
  { command: 'underline', label: 'Подчёркнутый', hint: `${MOD}U`, glyph: <u>Ч</u> },
  { command: 'strikeThrough', label: 'Зачёркнутый', hint: `${MOD}Shift+X`, glyph: <s>З</s> },
] as const;

function linkAround(node: Node | null, root: HTMLElement): HTMLAnchorElement | null {
  for (let n: Node | null = node; n && n !== root; n = n.parentNode) {
    if (n.nodeName === 'A') return n as HTMLAnchorElement;
  }
  return null;
}

/** Всплывающая панель над выделенным текстом: Ж К Ч З и ссылка. */
export default function FormatToolbar({ editor, onChange }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [inLink, setInLink] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [url, setUrl] = useState('');
  const savedRange = useRef<Range | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    const root = editor.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
      if (!linkMode) setPos(null);
      return;
    }
    if (sel.isCollapsed) {
      if (!linkMode) setPos(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setActive(Object.fromEntries(FORMATS.map((f) => [f.command, document.queryCommandState(f.command)])));
    setInLink(!!linkAround(sel.anchorNode, root) || !!linkAround(sel.focusNode, root));
  }, [editor, linkMode]);

  useEffect(() => {
    document.addEventListener('selectionchange', refresh);
    return () => document.removeEventListener('selectionchange', refresh);
  }, [refresh]);

  // не даём панели вылезти за края окна
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || !pos) return;
    const w = el.offsetWidth;
    const left = Math.min(Math.max(8, pos.x - w / 2), window.innerWidth - w - 8);
    el.style.left = `${left}px`;
    el.style.top = `${Math.max(8, pos.y - el.offsetHeight - 10)}px`;
  });

  const restore = () => {
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  const openLink = useCallback(() => {
    const root = editor.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) return;
    savedRange.current = sel.getRangeAt(0).cloneRange();
    const existing = linkAround(sel.anchorNode, root);
    setUrl(existing?.getAttribute('href') ?? '');
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top || root.getBoundingClientRect().top });
    setLinkMode(true);
    requestAnimationFrame(() => linkInput.current?.focus());
  }, [editor]);

  // Ctrl+K из поля ввода
  useEffect(() => {
    window.addEventListener('richinput:link', openLink);
    return () => window.removeEventListener('richinput:link', openLink);
  }, [openLink]);

  const closeLink = (refocus = true) => {
    setLinkMode(false);
    setUrl('');
    if (refocus) {
      editor.current?.focus();
      restore();
    }
  };

  const applyLink = () => {
    const href = safeHref(url);
    if (!href) return;
    editor.current?.focus();
    restore();
    const sel = window.getSelection();
    if (sel?.isCollapsed) {
      // ничего не выделено — вставляем адрес как текст ссылки
      document.execCommand('insertHTML', false, `<a href="${escapeHtml(href)}">${escapeHtml(url.trim())}</a>​`);
    } else {
      document.execCommand('createLink', false, href);
      sel?.collapseToEnd();
    }
    setLinkMode(false);
    setUrl('');
    onChange();
  };

  const unlink = () => {
    const root = editor.current;
    const sel = window.getSelection();
    const a = root && sel ? linkAround(sel.anchorNode, root) : null;
    if (a && sel) {
      const range = document.createRange();
      range.selectNodeContents(a);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand('unlink');
    onChange();
    refresh();
  };

  if (!pos) return null;

  return (
    <div
      ref={bar}
      className={s.bar}
      role="toolbar"
      aria-label="Форматирование"
      // кнопки не должны забирать выделение у поля ввода
      onMouseDown={(e) => e.target !== linkInput.current && e.preventDefault()}
    >
      {linkMode ? (
        <form
          className={s.linkForm}
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <input
            ref={linkInput}
            className={s.linkInput}
            type="url"
            inputMode="url"
            placeholder="Вставьте ссылку"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                closeLink();
              }
            }}
            aria-label="Адрес ссылки"
          />
          <button type="submit" className={s.btn} disabled={!safeHref(url)} aria-label="Применить ссылку">
            <IconCheck width={18} height={18} />
          </button>
          <button type="button" className={s.btn} onClick={() => closeLink()} aria-label="Отмена">
            <IconClose width={16} height={16} />
          </button>
        </form>
      ) : (
        <>
          {FORMATS.map((f) => (
            <button
              key={f.command}
              type="button"
              className={s.btn}
              aria-pressed={!!active[f.command]}
              aria-label={`${f.label} (${f.hint})`}
              title={`${f.label} (${f.hint})`}
              onClick={() => {
                document.execCommand(f.command);
                onChange();
                refresh();
              }}
            >
              {f.glyph}
            </button>
          ))}
          <span className={s.sep} aria-hidden />
          {inLink ? (
            <button type="button" className={s.btn} onClick={unlink} aria-label="Убрать ссылку" title="Убрать ссылку">
              <LinkOffIcon />
            </button>
          ) : (
            <button type="button" className={s.btn} onClick={openLink} aria-label={`Ссылка (${MOD}K)`} title={`Ссылка (${MOD}K)`}>
              <LinkIcon />
            </button>
          )}
        </>
      )}
    </div>
  );
}

const LinkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
  </svg>
);
const LinkOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    <path d="M4 4l16 16" />
  </svg>
);
