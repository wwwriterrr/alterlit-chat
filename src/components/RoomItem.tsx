import { memo, useRef } from 'react';
import { Link } from 'react-router';
import type { Room } from '../api/types';
import { useAppSelector, usePeer } from '../store/hooks';
import { formatListDate } from '../utils/date';
import { plainText } from '../utils/html';
import { peerIdOf } from '../utils/people';
import Avatar from './Avatar';
import s from './RoomItem.module.css';

const LONG_PRESS_MS = 450;

interface Props {
  room: Room;
  active: boolean;
  onMenu: (room: Room, x: number, y: number) => void;
}

function RoomItem({ room, active, onMenu }: Props) {
  const pressTimer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const cancelPress = () => window.clearTimeout(pressTimer.current);
  const meId = useAppSelector((st) => st.auth.user?.id);
  const peerId = peerIdOf(room.members, meId);
  const { name, known, avatar } = usePeer(peerId);
  const isTyping = useAppSelector((st) => Boolean(st.rooms.typingUntil[room.id]));
  const preview = plainText(room.last_message_content) || (room.last_message_date ? 'Вложение' : 'Нет сообщений');

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
      <Avatar id={peerId} name={known ? name : ''} src={avatar} size={54} />
      <span className={s.body}>
        <span className={s.row}>
          <span className={s.name}>{name}</span>
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
    </Link>
  );
}

export default memo(RoomItem);
