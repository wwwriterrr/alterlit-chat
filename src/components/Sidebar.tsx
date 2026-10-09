import { useCallback, useMemo, useState } from 'react';
import type { Room } from '../api/types';
import { useMatch } from 'react-router';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchRooms, markRoomRead } from '../store/roomsSlice';
import { askDeleteRoom } from '../store/uiSlice';
import { displayName } from '../store/usersSlice';
import { plainText } from '../utils/html';
import { peerIdOf } from '../utils/people';
import { IconCheck, IconClose, IconSearch, IconTrash } from './Icons';
import { MessageMenu, type MenuItem } from './MessageMenu';
import MainMenu from './MainMenu';
import RoomItem from './RoomItem';
import s from './Sidebar.module.css';

export default function Sidebar() {
  const dispatch = useAppDispatch();
  const roomId = useMatch('/room/:roomId')?.params.roomId;
  const meId = useAppSelector((st) => st.auth.user?.id);
  const { list, status, error } = useAppSelector((st) => st.rooms);
  const users = useAppSelector((st) => st.users);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ room: Room; x: number; y: number } | null>(null);
  const openMenu = useCallback((room: Room, x: number, y: number) => setMenu({ room, x, y }), []);
  const closeMenu = useCallback(() => setMenu(null), []);

  const menuItems = (room: Room): MenuItem[] => [
    ...(room.unread_count > 0
      ? [{ key: 'read', label: 'Отметить прочитанным', icon: <IconCheck />, onSelect: () => dispatch(markRoomRead(room.id)) }]
      : []),
    { key: 'delete', label: 'Удалить чат', icon: <IconTrash />, danger: true, onSelect: () => dispatch(askDeleteRoom(room.id)) },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const peer = peerIdOf(r.members, meId);
      const profile = users.profiles[peer];
      const name = [displayName(users, peer), profile?.username].filter(Boolean).join(' ').toLowerCase();
      return name.includes(q) || plainText(r.last_message_content).toLowerCase().includes(q);
    });
  }, [list, query, users, meId]);

  return (
    <>
      <header className={s.header}>
        <MainMenu />
        <label className={s.search}>
          <IconSearch className={s.searchIcon} width={18} height={18} />
          <span className="visually-hidden">Поиск по диалогам</span>
          <input
            type="search"
            placeholder="Поиск"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          />
          {query && (
            <button type="button" className={s.clear} onClick={() => setQuery('')} aria-label="Очистить поиск">
              <IconClose width={16} height={16} />
            </button>
          )}
        </label>
      </header>

      <nav className={s.list} aria-label="Диалоги">
        {status === 'loading' && <RoomSkeleton />}

        {status === 'error' && (
          <div className={s.note}>
            <p>{error ?? 'Не удалось загрузить диалоги.'}</p>
            <button className={s.retry} onClick={() => dispatch(fetchRooms())}>
              Повторить
            </button>
          </div>
        )}

        {status === 'ready' && list.length === 0 && (
          <div className={s.note}>
            <p className={s.noteTitle}>Здесь появятся ваши диалоги</p>
            <p>Чтобы начать переписку, откройте профиль автора на alterlit.ru и нажмите «Написать».</p>
          </div>
        )}

        {status === 'ready' && list.length > 0 && filtered.length === 0 && (
          <div className={s.note}>
            <p>По запросу «{query.trim()}» ничего не найдено</p>
          </div>
        )}

        <ul className={s.ul}>
          {filtered.map((room) => (
            <li key={room.id}>
              <RoomItem room={room} active={String(room.id) === roomId} onMenu={openMenu} />
            </li>
          ))}
        </ul>
      </nav>
      {menu && <MessageMenu x={menu.x} y={menu.y} items={menuItems(menu.room)} onClose={closeMenu} />}
    </>
  );
}

function RoomSkeleton() {
  return (
    <div aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className={s.skel}>
          <span className={s.skelAvatar} />
          <span className={s.skelLines}>
            <span style={{ width: `${40 + ((i * 17) % 30)}%` }} />
            <span style={{ width: `${55 + ((i * 23) % 35)}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}
