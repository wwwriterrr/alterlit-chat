import { memo, useMemo, useRef, type MouseEvent, type TouchEvent } from 'react';
import type { ChatFile } from '../api/types';
import { useAppDispatch } from '../store/hooks';
import { discardMessage, retryMessage, type PendingFile, type PendingMessage } from '../store/messagesSlice';
import type { Message } from '../api/types';
import { formatTime } from '../utils/date';
import { fileCategory, fileExt, fileName, formatSize } from '../utils/files';
import { messageHtml } from '../utils/html';
import AudioPlayer from './AudioPlayer';
import { Checks, Clock, IconDownload, IconFile, IconRetry, IconClose } from './Icons';
import s from './MessageBubble.module.css';

type Entry = { kind: 'msg'; m: Message } | { kind: 'pending'; p: PendingMessage };

interface Props {
  entry: Entry;
  mine: boolean;
  groupStart: boolean;
  groupEnd: boolean;
  read: boolean;
  onOpenImage: (url: string) => void;
  /** меню сообщения (правый клик / долгое нажатие); только для отправленных */
  onMenu?: (message: Message, x: number, y: number) => void;
}

/** Единый вид вложения для отправленных и ещё отправляемых сообщений. */
interface ViewFile {
  key: string | number;
  url: string;
  name: string;
  category: ReturnType<typeof fileCategory>;
  size?: number;
}

function fromServer(f: ChatFile): ViewFile {
  return { key: f.id, url: f.url, name: fileName(f), category: fileCategory(f) };
}
function fromPending(f: PendingFile, i: number): ViewFile {
  return { key: i, url: f.previewUrl ?? '', name: f.name, category: f.category, size: f.size };
}

const LONG_PRESS_MS = 450;

function MessageBubble({ entry, mine, groupStart, groupEnd, read, onOpenImage, onMenu }: Props) {
  const dispatch = useAppDispatch();
  const pending = entry.kind === 'pending' ? entry.p : null;
  const content = entry.kind === 'msg' ? (entry.m.content ?? '') : entry.p.content;
  const date = entry.kind === 'msg' ? entry.m.date : entry.p.createdAt;
  const files = useMemo(
    () => (entry.kind === 'msg' ? entry.m.files.map(fromServer) : entry.p.files.map(fromPending)),
    [entry],
  );
  const html = useMemo(() => (content.trim() ? messageHtml(content) : ''), [content]);

  const images = files.filter((f) => f.category === 'image');
  const videos = files.filter((f) => f.category === 'video');
  const audios = files.filter((f) => f.category === 'audio');
  const docs = files.filter((f) => f.category === 'other');
  const visual = [...images, ...videos];
  const mediaOnly = !html && !audios.length && !docs.length && visual.length > 0;

  const edited = entry.kind === 'msg' && !!entry.m.date_edited;

  // Правый клик на десктопе, долгое нажатие на телефоне. По ссылкам и при
  // выделенном тексте оставляем родное меню браузера.
  const pressTimer = useRef<number | undefined>(undefined);
  const openMenu = (x: number, y: number) => entry.kind === 'msg' && onMenu?.(entry.m, x, y);
  const nativeWanted = (target: EventTarget) =>
    !!(target as HTMLElement).closest('a, video, audio, input') || !!window.getSelection()?.toString();
  const onContextMenu = (e: MouseEvent) => {
    if (entry.kind !== 'msg' || !onMenu || nativeWanted(e.target)) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  };
  const onTouchStart = (e: TouchEvent) => {
    if (entry.kind !== 'msg' || !onMenu || nativeWanted(e.target)) return;
    const { clientX, clientY } = e.touches[0];
    pressTimer.current = window.setTimeout(() => {
      navigator.vibrate?.(10);
      openMenu(clientX, clientY);
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => window.clearTimeout(pressTimer.current);

  const meta = (
    <span className={s.meta} data-overlay={mediaOnly || undefined}>
      {edited && <span className={s.edited}>изменено</span>}
      <time dateTime={date}>{formatTime(date)}</time>
      {mine &&
        (pending ? (
          pending.status === 'failed' ? null : <Clock className={s.status} />
        ) : (
          <Checks className={s.status} read={read} aria-label={read ? 'Прочитано' : 'Отправлено'} />
        ))}
    </span>
  );

  return (
    <div
      className={s.row}
      data-mine={mine || undefined}
      data-start={groupStart || undefined}
      data-end={groupEnd || undefined}
    >
      <div
        className={s.bubble}
        onContextMenu={onContextMenu}
        onTouchStart={onTouchStart}
        onTouchEnd={cancelPress}
        onTouchMove={cancelPress}
        onTouchCancel={cancelPress}
        data-edited={edited || undefined}
        data-media={visual.length > 0 || undefined}
        data-media-only={mediaOnly || undefined}
        data-failed={pending?.status === 'failed' || undefined}
      >
        {visual.length > 0 && (
          <div className={s.media} data-count={Math.min(visual.length, 3)}>
            {visual.map((f) =>
              f.category === 'image' ? (
                <button
                  key={f.key}
                  className={s.mediaItem}
                  onClick={() => !pending && onOpenImage(f.url)}
                  aria-label={`Открыть изображение ${f.name}`}
                  disabled={!!pending}
                >
                  <img src={f.url} alt={f.name} loading="lazy" decoding="async" />
                </button>
              ) : (
                <div key={f.key} className={s.mediaItem}>
                  <video src={f.url} controls={!pending} preload="metadata" playsInline />
                </div>
              ),
            )}
            {pending && <UploadOverlay progress={pending.progress} failed={pending.status === 'failed'} />}
          </div>
        )}

        {audios.map((f) => (
          <div key={f.key} className={s.block}>
            <AudioPlayer src={f.url} name={f.name} mine={mine} disabled={!!pending} />
          </div>
        ))}

        {docs.map((f) => (
          <DocCard key={f.key} file={f} pending={pending} />
        ))}

        {html && (
          <div className={s.text}>
            <span className={s.html} dangerouslySetInnerHTML={{ __html: html }} />
            <span className={s.metaSpacer} aria-hidden />
          </div>
        )}

        {!html && !mediaOnly && <div className={s.metaLine} />}
        {meta}
      </div>

      {pending?.status === 'failed' && (
        <div className={s.failed} role="alert">
          <span>{pending.error}</span>
          <button onClick={() => dispatch(retryMessage(pending))}>
            <IconRetry width={15} height={15} /> Повторить
          </button>
          <button onClick={() => dispatch(discardMessage(pending))}>
            <IconClose width={15} height={15} /> Удалить
          </button>
        </div>
      )}
      {pending?.status === 'sending' && !visual.length && files.length > 0 && (
        <div className={s.progressBar} aria-label={`Загружено ${Math.round(pending.progress * 100)}%`}>
          <span style={{ width: `${Math.max(4, pending.progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function UploadOverlay({ progress, failed }: { progress: number; failed: boolean }) {
  if (failed) return null;
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className={s.upload} aria-label={`Загружено ${Math.round(progress * 100)}%`}>
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="3" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0.03, progress))}
          transform="rotate(-90 26 26)"
        />
      </svg>
    </div>
  );
}

const EXT_TONE: Record<string, string> = { PDF: '#C0443F', DOC: '#407BC8', DOCX: '#407BC8', XLS: '#2E8B57', XLSX: '#2E8B57', CSV: '#2E8B57', TXT: '#6B7266' };

function DocCard({ file, pending }: { file: ViewFile; pending: PendingMessage | null }) {
  const ext = fileExt(file.name !== 'файл' ? file.name : file.url);
  const sub = file.size !== undefined ? `${formatSize(file.size)} · ${ext}` : ext;
  const icon = (
    <span className={s.docIcon} style={{ background: EXT_TONE[ext] ?? 'var(--primary)' }}>
      {pending ? <IconFile width={22} height={22} /> : <IconDownload width={22} height={22} />}
    </span>
  );
  const body = (
    <span className={s.docText}>
      <span className={s.docName}>{file.name}</span>
      <span className={s.docSub}>{sub}</span>
    </span>
  );
  return pending ? (
    <div className={s.doc}>
      {icon}
      {body}
    </div>
  ) : (
    <a className={s.doc} href={file.url} target="_blank" rel="noopener noreferrer" download={file.name}>
      {icon}
      {body}
    </a>
  );
}

export default memo(MessageBubble);
