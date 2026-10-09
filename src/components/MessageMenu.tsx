import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import s from './MessageMenu.module.css';

export interface MenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

/** Контекстное меню сообщения: открывается у точки клика, не вылезает за экран. */
export function MessageMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, y + height > window.innerHeight - 8 ? y - height : y),
    });
    el.querySelector<HTMLButtonElement>('button')?.focus();
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const buttons = Array.from(ref.current?.querySelectorAll('button') ?? []);
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    };
    // закрываем при прокрутке пользователем, но не от сдвигов ленты
    // (догрузились картинки, пришло новое сообщение)
    const close = () => onClose();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    document.addEventListener('wheel', close, { passive: true });
    document.addEventListener('touchmove', close, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      document.removeEventListener('wheel', close);
      document.removeEventListener('touchmove', close);
    };
  }, [onClose]);

  return (
    <div ref={ref} className={s.menu} style={pos} role="menu">
      {items.map((item) => (
        <button
          key={item.key}
          role="menuitem"
          className={s.item}
          data-danger={item.danger || undefined}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Подтверждение необратимого действия. */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onCancel]);

  return (
    <div className={s.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className={s.dialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text">
        <h3 id="confirm-title" className={s.title}>
          {title}
        </h3>
        <p id="confirm-text" className={s.text}>
          {text}
        </p>
        <div className={s.actions}>
          <button ref={cancelRef} className={s.btn} onClick={onCancel}>
            Отмена
          </button>
          <button className={s.btn} data-danger onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
