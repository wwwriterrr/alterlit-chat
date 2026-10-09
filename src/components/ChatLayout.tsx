import { Outlet, useMatch } from 'react-router';
import { useEffect } from 'react';
import { useChatStream } from '../hooks/useChatStream';
import { useRoomsSync } from '../hooks/useRoomsSync';
import { useAppSelector } from '../store/hooks';
import Sidebar from './Sidebar';
import Toast from './Toast';
import DeleteRoomConfirm from './DeleteRoomConfirm';
import s from './ChatLayout.module.css';

export default function ChatLayout() {
  const streamStatus = useChatStream();
  useRoomsSync(streamStatus === 'open');

  // счётчик непрочитанного во вкладке браузера, как у мессенджеров
  const unread = useAppSelector((st) => st.rooms.list.reduce((sum, r) => sum + (r.unread_count || 0), 0));
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Сообщения — Alterlit` : 'Сообщения — Alterlit';
  }, [unread]);
  const roomMatch = useMatch('/room/:roomId');
  const dialogMatch = useMatch('/dialog/:peerId');
  const inRoom = Boolean(roomMatch || dialogMatch);

  return (
    <div className={s.shell} data-view={inRoom ? 'chat' : 'list'}>
      <aside className={s.sidebar}>
        <Sidebar />
      </aside>
      <main className={`${s.main} chat-wallpaper`}>
        <Outlet />
      </main>
      <Toast />
      <DeleteRoomConfirm />
    </div>
  );
}
