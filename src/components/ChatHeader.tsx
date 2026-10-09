import { useState } from 'react';
import { Link } from 'react-router';
import type { SocketStatus } from '../hooks/useRoomSocket';
import { useAppDispatch, useAppSelector, usePeer } from '../store/hooks';
import { askDeleteRoom } from '../store/uiSlice';
import { peerIdOf } from '../utils/people';
import Avatar from './Avatar';
import { IconBack, IconMore, IconTrash } from './Icons';
import { MessageMenu } from './MessageMenu';
import s from './ChatHeader.module.css';

export default function ChatHeader({ roomId, socketStatus }: { roomId: number; socketStatus: SocketStatus }) {
  const meId = useAppSelector((st) => st.auth.user?.id);
  const room = useAppSelector((st) => st.rooms.list.find((r) => r.id === roomId));
  // если комнаты ещё нет в списке — берём собеседника из сообщений
  const fallbackPeer = useAppSelector((st) =>
    st.messages.byRoom[roomId]?.items.find((m) => m.sender_id !== meId)?.sender_id,
  );
  const peerId = room ? peerIdOf(room.members, meId) : fallbackPeer;
  const { name, known, avatar } = usePeer(peerId);
  const isTyping = useAppSelector((st) => Boolean(st.rooms.typingUntil[roomId]));
  const dispatch = useAppDispatch();
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);

  let subtitle: { text: string; tone: 'accent' | 'muted' } | null = null;
  if (isTyping) subtitle = { text: 'печатает…', tone: 'accent' };
  else if (socketStatus === 'connecting' || socketStatus === 'closed') subtitle = { text: 'соединение…', tone: 'muted' };

  return (
    <header className={s.header}>
      <Link to="/" className={s.back} aria-label="К списку диалогов">
        <IconBack />
      </Link>
      {peerId !== undefined && <Avatar id={peerId} name={known ? name : ''} src={avatar} size={40} />}
      <div className={s.text}>
        <h2 className={s.name}>{peerId !== undefined ? name : 'Диалог'}</h2>
        {subtitle && (
          <div className={s.sub} data-tone={subtitle.tone} aria-live="polite">
            {subtitle.text}
          </div>
        )}
      </div>
      {room && (
        <button
          className={s.more}
          aria-label="Действия с чатом"
          aria-haspopup="menu"
          aria-expanded={!!menuAt}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenuAt({ x: r.right - 220, y: r.bottom + 6 });
          }}
        >
          <IconMore />
        </button>
      )}
      {menuAt && (
        <MessageMenu
          x={menuAt.x}
          y={menuAt.y}
          onClose={() => setMenuAt(null)}
          items={[
            {
              key: 'delete',
              label: 'Удалить чат',
              icon: <IconTrash />,
              danger: true,
              onSelect: () => dispatch(askDeleteRoom(roomId)),
            },
          ]}
        />
      )}
    </header>
  );
}
