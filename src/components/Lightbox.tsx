import { useEffect, useRef } from 'react';
import { IconChevronLeft, IconChevronRight, IconClose, IconDownload } from './Icons';
import s from './Lightbox.module.css';

export interface LightboxState {
  images: string[];
  index: number;
}

export default function Lightbox({
  state,
  onChange,
  onClose,
}: {
  state: LightboxState;
  onChange: (s: LightboxState) => void;
  onClose: () => void;
}) {
  const { images, index } = state;
  const closeRef = useRef<HTMLButtonElement>(null);
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => prevFocus?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onChange({ images, index: index - 1 });
      if (e.key === 'ArrowRight' && hasNext) onChange({ images, index: index + 1 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images, index, hasPrev, hasNext, onChange, onClose]);

  return (
    <div className={s.root} role="dialog" aria-modal="true" aria-label="Просмотр изображения" onClick={onClose}>
      <div className={s.bar} onClick={(e) => e.stopPropagation()}>
        <span className={s.counter}>
          {images.length > 1 ? `${index + 1} из ${images.length}` : ''}
        </span>
        <a className={s.tool} href={images[index]} download target="_blank" rel="noopener noreferrer" aria-label="Скачать">
          <IconDownload />
        </a>
        <button ref={closeRef} className={s.tool} onClick={onClose} aria-label="Закрыть">
          <IconClose />
        </button>
      </div>

      <img className={s.image} src={images[index]} alt="" onClick={(e) => e.stopPropagation()} />

      {hasPrev && (
        <button
          className={`${s.nav} ${s.prev}`}
          aria-label="Предыдущее"
          onClick={(e) => {
            e.stopPropagation();
            onChange({ images, index: index - 1 });
          }}
        >
          <IconChevronLeft width={30} height={30} />
        </button>
      )}
      {hasNext && (
        <button
          className={`${s.nav} ${s.next}`}
          aria-label="Следующее"
          onClick={(e) => {
            e.stopPropagation();
            onChange({ images, index: index + 1 });
          }}
        >
          <IconChevronRight width={30} height={30} />
        </button>
      )}
    </div>
  );
}
