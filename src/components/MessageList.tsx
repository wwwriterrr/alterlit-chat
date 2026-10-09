import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { Message } from '../api/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { deleteMessage, fetchMessages, fetchOlder, type PendingMessage } from '../store/messagesSlice';
import { showToast } from '../store/uiSlice';
import { htmlToText } from '../utils/html';
import { stepWallpaper } from '../utils/wallpaper';
import { dateMs, dayKey, formatDay } from '../utils/date';
import { IconCopy, IconDown, IconEdit, IconTrash } from './Icons';
import { ConfirmDialog, MessageMenu, type MenuItem } from './MessageMenu';
import type { LightboxState } from './Lightbox';
import MessageBubble from './MessageBubble';
import s from './MessageList.module.css';

type Entry = { kind: 'msg'; m: Message } | { kind: 'pending'; p: PendingMessage };
interface Row {
  entry: Entry;
  mine: boolean;
  groupStart: boolean;
  groupEnd: boolean;
}
interface Day {
  key: string;
  label: string;
  rows: Row[];
}

const GROUP_GAP_MS = 7 * 60_000;
const EMPTY: Message[] = [];
const EMPTY_PENDING: PendingMessage[] = [];

function buildDays(items: Message[], pending: PendingMessage[], meId: number | undefined): Day[] {
  const entries: Entry[] = [
    ...items.map((m) => ({ kind: 'msg' as const, m })),
    ...pending.map((p) => ({ kind: 'pending' as const, p })),
  ];
  const meta = entries.map((e) =>
    e.kind === 'msg'
      ? { sender: e.m.sender_id, date: e.m.date }
      : { sender: meId ?? -1, date: e.p.createdAt },
  );
  const days: Day[] = [];
  entries.forEach((entry, i) => {
    const key = dayKey(meta[i].date);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, label: formatDay(meta[i].date), rows: [] };
      days.push(day);
    }
    const prev = meta[i - 1];
    const next = meta[i + 1];
    const near = (a?: typeof prev, b?: typeof prev) =>
      !!a && !!b && a.sender === b.sender && dayKey(a.date) === dayKey(b.date) && Math.abs(dateMs(b.date) - dateMs(a.date)) < GROUP_GAP_MS;
    day.rows.push({
      entry,
      mine: meta[i].sender === meId,
      groupStart: !near(prev, meta[i]),
      groupEnd: !near(meta[i], next),
    });
  });
  return days;
}

interface Props {
  roomId: number;
  onOpenImage: (state: LightboxState) => void;
  scrollToBottomRef: MutableRefObject<() => void>;
  onEdit: (message: Message) => void;
}

export default function MessageList({ roomId, onOpenImage, scrollToBottomRef, onEdit }: Props) {
  const dispatch = useAppDispatch();
  const meId = useAppSelector((st) => st.auth.user?.id);
  const room = useAppSelector((st) => st.messages.byRoom[roomId]);
  const readUpTo = useAppSelector((st) => st.rooms.peerReadUpTo[roomId] ?? 0);
  const items = room?.items ?? EMPTY;
  const pending = room?.pending ?? EMPTY_PENDING;
  const days = useMemo(() => buildDays(items, pending, meId), [items, pending, meId]);

  // Скроллер с column-reverse: scrollTop = 0 — это низ ленты. Подгрузка истории
  // сверху и догружающиеся картинки не сдвигают видимую часть.
  const scroller = useRef<HTMLDivElement>(null);
  const [farFromBottom, setFarFromBottom] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const lastIdRef = useRef<number | string | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    scroller.current?.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    setUnseen(0);
  }, []);
  scrollToBottomRef.current = scrollToBottom;

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const fromBottom = -el.scrollTop;
    const far = fromBottom > 240;
    setFarFromBottom(far);
    if (!far) setUnseen(0);
    const fromTop = el.scrollHeight - el.clientHeight + el.scrollTop;
    if (fromTop < 400) dispatch(fetchOlder(roomId));
  };

  // счётчик новых входящих на кнопке «вниз»
  const last = items[items.length - 1];
  useLayoutEffect(() => {
    if (!last) return;
    const prevId = lastIdRef.current;
    lastIdRef.current = last.id;
    if (prevId === null || prevId === last.id) return;
    stepWallpaper();
    if (last.sender_id === meId) scrollToBottom();
    else if (farFromBottom) setUnseen((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id]);

  // если история короткая и скролла нет — сразу догружаем ещё
  useEffect(() => {
    const el = scroller.current;
    if (el && room?.status === 'ready' && room.next && el.scrollHeight <= el.clientHeight + 50) {
      dispatch(fetchOlder(roomId));
    }
  }, [room?.status, room?.next, items.length, dispatch, roomId]);

  const imagesIndex = useMemo(() => {
    const urls: string[] = [];
    for (const m of items) for (const f of m.files) if (fileIsImage(f.type, f.url)) urls.push(f.url);
    return urls;
  }, [items]);

  const openImage = useCallback(
    (url: string) => onOpenImage({ images: imagesIndex, index: Math.max(0, imagesIndex.indexOf(url)) }),
    [imagesIndex, onOpenImage],
  );

  const [menu, setMenu] = useState<{ message: Message; x: number; y: number } | null>(null);
  const [toDelete, setToDelete] = useState<Message | null>(null);
  const openMenu = useCallback((message: Message, x: number, y: number) => setMenu({ message, x, y }), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const cancelDelete = useCallback(() => setToDelete(null), []);

  const menuItems = (m: Message): MenuItem[] => {
    const items: MenuItem[] = [];
    const text = htmlToText(m.content);
    if (text) {
      items.push({
        key: 'copy',
        label: 'Копировать текст',
        icon: <IconCopy />,
        onSelect: () =>
          navigator.clipboard
            ?.writeText(text)
            .then(() => dispatch(showToast('Текст скопирован')))
            .catch(() => dispatch(showToast('Не удалось скопировать текст'))),
      });
    }
    if (m.sender_id === meId) {
      items.push({ key: 'edit', label: 'Изменить', icon: <IconEdit />, onSelect: () => onEdit(m) });
      items.push({ key: 'delete', label: 'Удалить', icon: <IconTrash />, danger: true, onSelect: () => setToDelete(m) });
    }
    return items;
  };

  const status = room?.status ?? 'loading';

  return (
    <div className={s.wrap}>
      <div className={s.scroller} ref={scroller} onScroll={onScroll}>
        <div className={s.column} role="log" aria-live="polite" aria-relevant="additions">
          {room?.loadingOlder && <div className={s.loader} aria-label="Загружаем историю" />}

          {status === 'loading' && items.length === 0 && <div className={s.loader} aria-label="Загрузка" />}

          {status === 'error' && (
            <div className={s.center}>
              <div className={s.chip}>
                {room?.error}{' '}
                <button className={s.chipBtn} onClick={() => dispatch(fetchMessages(roomId))}>
                  Повторить
                </button>
              </div>
            </div>
          )}

          {status === 'ready' && items.length === 0 && pending.length === 0 && (
            <div className={s.center}>
              <div className={s.chip}>Сообщений пока нет. Напишите первым — например, поздоровайтесь.</div>
            </div>
          )}

          {days.map((day) => (
            <section key={day.key} className={s.day} aria-label={day.label}>
              <div className={s.dayHead}>
                <span className={s.chip}>{day.label}</span>
              </div>
              {day.rows.map((row) => (
                <MessageBubble
                  key={row.entry.kind === 'msg' ? row.entry.m.id : row.entry.p.localId}
                  entry={row.entry}
                  mine={row.mine}
                  groupStart={row.groupStart}
                  groupEnd={row.groupEnd}
                  read={row.entry.kind === 'msg' && row.mine && row.entry.m.id <= readUpTo}
                  onOpenImage={openImage}
                  onMenu={openMenu}
                />
              ))}
            </section>
          ))}
        </div>
      </div>

      {menu && menuItems(menu.message).length > 0 && (
        <MessageMenu x={menu.x} y={menu.y} items={menuItems(menu.message)} onClose={closeMenu} />
      )}
      {toDelete && (
        <ConfirmDialog
          title="Удалить сообщение?"
          text="Сообщение исчезнет у вас и у собеседника. Отменить удаление будет нельзя."
          confirmLabel="Удалить"
          onCancel={cancelDelete}
          onConfirm={() => {
            dispatch(deleteMessage(toDelete));
            setToDelete(null);
          }}
        />
      )}

      {farFromBottom && (
        <button className={s.down} onClick={() => scrollToBottom()} aria-label="Прокрутить к последним сообщениям">
          <IconDown />
          {unseen > 0 && <span className={s.downBadge}>{unseen}</span>}
        </button>
      )}
    </div>
  );
}

function fileIsImage(type: string | null, url: string) {
  return type === 'image' || (type ?? '').startsWith('image/') || /\.(jpe?g|png|gif)$/i.test(url);
}
