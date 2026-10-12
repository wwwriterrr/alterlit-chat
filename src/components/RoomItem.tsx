import { memo, useRef } from 'react';
import { Link } from 'react-router';
import type { Room } from '../api/types';
import { useAppSelector, usePeer } from '../store/hooks';
import { formatListDate } from '../utils/date';
import { plainText } from '../utils/html';
import { peerIdOf } from '../utils/people';
import Avatar from './Avatar';
import { IconBlock, IconCheck } from './Icons';
import PersonName from './PersonName';
import s from './RoomItem.module.css';

const LONG_PRESS_MS = 450;

interface Props {
  room: Room;
  active: boolean;
  onMenu: (room: Room, x: number, y: number) => void;
  /** режим выбора: вместо перехода в чат — отметка */
  selecting?: boolean;
  checked?: boolean;
  onToggle?: (room: Room) => void;
}

function RoomItem({ room, active, onMenu, selecting = false, checked = false, onToggle }: Props) {
  const pressTimer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const cancelPress = () => window.clearTimeout(pressTimer.current);
  const meId = useAppSelector((st) => st.auth.user?.id);
  const peerId = peerIdOf(room.members, meId);
  const { name, known, avatar, badge } = usePeer(peerId);
  const isTyping = useAppSelector((st) => Boolean(st.rooms.typingUntil[room.id]));
  const blocked = useAppSelector((st) => Boolean(st.blacklist.byPeer[peerId]?.blocked));
  const preview = plainText(room.last_message_content) || (room.last_message_date ? 'Вложение' : 'Нет сообщений');

  const content = (
    <>
      <span className={s.avatar} data-blocked={blocked || undefined}>
        <Avatar id={peerId} name={known ? name : ''} src={avatar} size={54} />
      </span>
      <span className={s.body}>
        <span className={s.row}>
          <span className={s.name}>
            <PersonName name={name} badge={badge} />
          </span>
          {blocked && (
            <span className={s.blocked} title="Вы заблокировали пользователя">
              <IconBlock width={15} height={15} aria-hidden />
              <span className="visually-hidden">Заблокирован</span>
            </span>
          )}
          <time className={s.date} dateTime={room.last_message_date ?? undefined}>
            {formatListDate(room.last_message_date)}
          </time>
        </span>
        <span className={s.row}>
          {isTyping ? (
            <span className={`${s.preview} ${s.typing}`}>печатает…</span>
          ) : (
            <span className={s.preview}>{preview}</span>
          )}
          {room.unread_count > 0 && (
            <span className={s.badge} aria-label={`Непрочитанных: ${room.unread_count}`}>
              {room.unread_count > 999 ? '999+' : room.unread_count}
            </span>
          )}
        </span>
      </span>
    </>
  );

  if (selecting) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        className={s.item}
        data-active={checked || undefined}
        onClick={() => onToggle?.(room)}
        onContextMenu={(e) => {
          e.preventDefault();
          onToggle?.(room);
        }}
      >
        <span className={s.check} aria-hidden>
          <IconCheck width={16} height={16} strokeWidth={2.6} />
        </span>
        {content}
      </button>
    );
  }

  return (
    <Link
      to={`/room/${room.id}`}
      className={s.item}
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(room, e.clientX, e.clientY);
      }}
      onTouchStart={(e) => {
        longPressed.current = false;
        const { clientX, clientY } = e.touches[0];
        pressTimer.current = window.setTimeout(() => {
          longPressed.current = true;
          navigator.vibrate?.(10);
          onMenu(room, clientX, clientY);
        }, LONG_PRESS_MS);
      }}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onTouchCancel={cancelPress}
      onClick={(e) => {
        // после долгого нажатия не открываем чат — пользователь хотел меню
        if (longPressed.current) {
          e.preventDefault();
          longPressed.current = false;
        }
      }}
    >
      {content}
    </Link>
  );
}

export default memo(RoomItem);
