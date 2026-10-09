import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  cleanPastedHtml,
  editorPlainText,
  escapeHtml,
  safeHref,
  serializeEditor,
  textToEditorHtml,
} from '../utils/richtext';
import FormatToolbar from './FormatToolbar';
import s from './Composer.module.css';

export interface RichInputHandle {
  focus(): void;
  /** разметка редактора (b, i, u, s, a, br) */
  setHtml(html: string): void;
  getHtml(): string;
  clear(): void;
  /** HTML сообщения в формате сайта (<p>…</p>) или '' */
  serialize(): string;
  plainText(): string;
}

interface Props {
  id: string;
  placeholder: string;
  /** телефон: Enter — перенос строки, отправка — кнопкой */
  coarse: boolean;
  onChange: (empty: boolean) => void;
  onSubmit: () => void;
  onEscape: () => boolean;
  onArrowUpEmpty: () => boolean;
  onPasteFiles: (files: File[]) => void;
  onBlur: () => void;
}

const exec = (command: string, value?: string) => document.execCommand(command, false, value);

/** Правила разметки по ходу набора: **жирный**, _курсив_ или *курсив*, __подчёркнутый__, ~~зачёркнутый~~ */
const RULES: { re: RegExp; tag: string; marker: number }[] = [
  { re: /\*\*([^*\n]+?)\*\*$/, tag: 'b', marker: 2 },
  { re: /~~([^~\n]+?)~~$/, tag: 's', marker: 2 },
  { re: /__([^_\n]+?)__$/, tag: 'u', marker: 2 },
  { re: /(?:^|[^*\p{L}\d])\*([^*\s][^*\n]*?)\*$/u, tag: 'i', marker: 1 },
  { re: /(?:^|[^_\p{L}\d])_([^_\s][^_\n]*?)_$/u, tag: 'i', marker: 1 },
];
const URL_BEFORE_SPACE = /(?:^|\s)((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]])\s$/i;

function caretTextNode() {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode || sel.anchorNode.nodeType !== Node.TEXT_NODE) return null;
  return { sel, node: sel.anchorNode as Text, offset: sel.anchorOffset };
}

function insideLink(node: Node | null, root: HTMLElement) {
  for (let n: Node | null = node; n && n !== root; n = n.parentNode) {
    if (n.nodeName === 'A') return true;
  }
  return false;
}

const RichInput = forwardRef<RichInputHandle, Props>(function RichInput(
  { id, placeholder, coarse, onChange, onSubmit, onEscape, onArrowUpEmpty, onPasteFiles, onBlur },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);

  const isEmpty = () => !el.current || !editorPlainText(el.current);

  const notify = useCallback(() => {
    const root = el.current;
    if (!root) return;
    // браузер оставляет <br> в «пустом» поле — убираем, чтобы показался плейсхолдер
    if (!editorPlainText(root) && !root.querySelector('img')) root.innerHTML = '';
    onChange(!editorPlainText(root));
  }, [onChange]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => el.current?.focus(),
      setHtml: (html) => {
        const root = el.current;
        if (!root) return;
        root.innerHTML = html;
        // курсор в конец
        const range = document.createRange();
        range.selectNodeContents(root);
        range.collapse(false);
        const sel = window.getSelection();
        if (document.activeElement === root) {
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
        notify();
      },
      getHtml: () => el.current?.innerHTML ?? '',
      clear: () => {
        if (el.current) el.current.innerHTML = '';
        notify();
      },
      serialize: () => (el.current ? serializeEditor(el.current) : ''),
      plainText: () => (el.current ? editorPlainText(el.current) : ''),
    }),
    [notify],
  );

  useEffect(() => {
    // форматирование тегами (<b>), а не span со стилями
    try {
      exec('styleWithCSS', 'false');
    } catch {
      /* старые браузеры */
    }
  }, []);

  const newline = () => {
    if (!exec('insertLineBreak')) exec('insertHTML', '<br>​');
  };

  /** Превращает только что набранную разметку/адрес перед курсором в форматирование. */
  const applyInputRules = (data: string | null) => {
    const root = el.current;
    const at = caretTextNode();
    if (!root || !at || !root.contains(at.node) || insideLink(at.node, root)) return;
    const before = at.node.data.slice(0, at.offset);

    if (data === ' ') {
      const m = URL_BEFORE_SPACE.exec(before);
      const href = m && safeHref(m[1]);
      if (m && href) {
        const start = at.offset - 1 - m[1].length;
        const range = document.createRange();
        range.setStart(at.node, start);
        range.setEnd(at.node, at.offset - 1);
        at.sel.removeAllRanges();
        at.sel.addRange(range);
        exec('createLink', href);
        at.sel.collapseToEnd();
        at.sel.modify?.('move', 'forward', 'character'); // за пробел, вне ссылки
      }
      return;
    }

    if (!data || !'*_~'.includes(data)) return;
    for (const rule of RULES) {
      const m = rule.re.exec(before);
      if (!m) continue;
      const inner = m[1];
      const length = inner.length + rule.marker * 2;
      const range = document.createRange();
      range.setStart(at.node, at.offset - length);
      range.setEnd(at.node, at.offset);
      at.sel.removeAllRanges();
      at.sel.addRange(range);
      // insertHTML сохраняет историю отмены; невидимый пробел выводит курсор из тега
      exec('insertHTML', `<${rule.tag}>${escapeHtml(inner)}</${rule.tag}>​`);
      return;
    }
  };

  const onInput = (e: FormEvent<HTMLDivElement>) => {
    const ev = e.nativeEvent as InputEvent;
    if (ev.inputType === 'insertText' && !ev.isComposing) applyInputRules(ev.data);
    notify();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (mod && !e.altKey) {
      const command =
        key === 'b' || key === 'и' ? 'bold'
        : key === 'i' || key === 'ш' ? 'italic'
        : key === 'u' || key === 'г' ? 'underline'
        : e.shiftKey && (key === 'x' || key === 'ч') ? 'strikeThrough'
        : null;
      if (command) {
        e.preventDefault();
        exec(command);
        notify();
        return;
      }
      if (key === 'k' || key === 'л') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('richinput:link'));
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey || coarse) newline();
      else onSubmit();
      return;
    }
    if (e.key === 'Escape' && onEscape()) {
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowUp' && isEmpty() && onArrowUpEmpty()) e.preventDefault();
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      onPasteFiles(files);
      return;
    }
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    e.preventDefault();
    const clean = html ? cleanPastedHtml(html) : textToEditorHtml(text);
    if (clean) exec('insertHTML', clean);
    notify();
  };

  return (
    <>
      <div
        id={id}
        ref={el}
        className={s.input}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Сообщение"
        aria-placeholder={placeholder}
        data-placeholder={placeholder}
        spellCheck
        onInput={onInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={onBlur}
        onDrop={(e) => {
          // перетаскивание текста: только чистая разметка; файлы ловит окно чата
          if (e.dataTransfer.files.length) return;
          const html = e.dataTransfer.getData('text/html');
          if (!html) return;
          e.preventDefault();
          // вставляем в точку, куда отпустили, а не туда, где был курсор
          const at = document.caretRangeFromPoint?.(e.clientX, e.clientY);
          if (at) {
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(at);
          }
          const clean = cleanPastedHtml(html);
          if (clean) exec('insertHTML', clean);
          notify();
        }}
      />
      <FormatToolbar editor={el} onChange={notify} />
    </>
  );
});

export default RichInput;
