import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { SocketStatus } from '../hooks/useRoomSocket';
import { useAppDispatch, useAppSelector, usePeer } from '../store/hooks';
import { askDeleteRooms } from '../store/uiSlice';
import { useBlockState } from '../hooks/useBlockState';
import { useRoomPeer } from '../hooks/useRoomPeer';
import { setBlocked } from '../store/blacklistSlice';
import { profileUrl } from '../utils/people';
import Avatar from './Avatar';
import PersonName from './PersonName';
import { IconBack, IconBlock, IconMore, IconTrash, IconUser } from './Icons';
import { ConfirmDialog, MessageMenu } from './MessageMenu';
import s from './ChatHeader.module.css';

export default function ChatHeader({ roomId, socketStatus }: { roomId: number; socketStatus: SocketStatus }) {
  const { room, peerId } = useRoomPeer(roomId);
  const { name, known, avatar, username, badge } = usePeer(peerId);
  const { state: block, busy: blockBusy } = useBlockState(peerId);
  const [confirmBlock, setConfirmBlock] = useState(false);
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
      <PeerLink username={username} label={known ? `Открыть профиль «${name}» в новой вкладке` : undefined}>
        {peerId !== undefined && <Avatar id={peerId} name={known ? name : ''} src={avatar} size={40} />}
        <div className={s.text}>
          <h2 className={s.name}>{peerId !== undefined ? <PersonName name={name} badge={badge} /> : 'Диалог'}</h2>
          {subtitle && (
            <div className={s.sub} data-tone={subtitle.tone} aria-live="polite">
              {subtitle.text}
            </div>
          )}
        </div>
      </PeerLink>
      {room && (
        <button
          className={s.more}
          aria-label="Действия с чатом"
          aria-haspopup="menu"
          aria-expanded={!!menuAt}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenuAt({ x: r.right - 300, y: r.bottom + 6 });
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
            ...(username
              ? [
                  {
                    key: 'profile',
                    // имя жирным, без склонения: «Перейти в профиль Аля К.»
                    label: known ? (
                      <>
                        Перейти в профиль <b>{name}</b>
                      </>
                    ) : (
                      'Перейти в профиль собеседника'
                    ),
                    icon: peerId !== undefined ? <Avatar id={peerId} name={known ? name : ''} src={avatar} size={24} /> : <IconUser />,
                    onSelect: () => window.open(profileUrl(username), '_blank', 'noopener'),
                  },
                ]
              : []),
            // состояние неизвестно (ручки нет или ошибка) — пункт не показываем
            ...(peerId !== undefined && block && !blockBusy
              ? [
                  block.blocked
                    ? {
                        key: 'unblock',
                        label: 'Разблокировать',
                        icon: <IconBlock />,
                        onSelect: () => dispatch(setBlocked(peerId, false)),
                      }
                    : {
                        key: 'block',
                        label: 'Заблокировать',
                        icon: <IconBlock />,
                        danger: true,
                        onSelect: () => setConfirmBlock(true),
                      },
                ]
              : []),
            {
              key: 'delete',
              label: 'Удалить чат',
              icon: <IconTrash />,
              danger: true,
              onSelect: () => dispatch(askDeleteRooms([roomId])),
            },
          ]}
        />
      )}
      {confirmBlock && peerId !== undefined && (
        <ConfirmDialog
          title={known ? `Заблокировать «${name}»?` : 'Заблокировать собеседника?'}
          text="Вы не сможете писать друг другу, пока блокировка не снята. Переписка останется. Разблокировать можно в меню чата или в разделе «Заблокированные»."
          confirmLabel="Заблокировать"
          onCancel={() => setConfirmBlock(false)}
          onConfirm={() => {
            setConfirmBlock(false);
            dispatch(setBlocked(peerId, true));
          }}
        />
      )}
    </header>
  );
}

/** Аватар и имя собеседника — ссылка на его профиль на сайте (в новой вкладке), если логин известен. */
function PeerLink({ username, label, children }: { username?: string; label?: string; children: ReactNode }) {
  if (!username) return <div className={s.peer}>{children}</div>;
  return (
    <a className={s.peer} href={profileUrl(username)} target="_blank" rel="noopener noreferrer" title={label}>
      {children}
    </a>
  );
}
