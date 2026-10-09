import { useEffect, useRef, useState } from 'react';
import { useMatch, useNavigate } from 'react-router';
import { streamSocket } from '../api/socket';
import type { WsServerEvent } from '../api/types';
import { store } from '../store';
import { useAppDispatch } from '../store/hooks';
import { received, removed, syncRoomPreview } from '../store/messagesSlice';
import {
  fetchRooms,
  messageArrived,
  peerRead,
  roomLastEdited,
  roomRead,
  roomRemoved,
  typing,
} from '../store/roomsSlice';
import { learnNames } from '../store/usersSlice';
import type { SocketStatus } from './useRoomSocket';

/**
 * Личный поток ws/chat/stream/: события из всех чатов пользователя.
 * Держит список диалогов актуальным без опроса. Открытый чат дополнительно
 * слушает свой комнатный сокет — повторы событий безопасны (upsert по id).
 */
export function useChatStream() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const openRoomParam = useMatch('/room/:roomId')?.params.roomId;
  const [status, setStatus] = useState<SocketStatus>('connecting');

  // актуальные значения для обработчика, который создаётся один раз
  const openRoomRef = useRef<number | null>(null);
  openRoomRef.current = openRoomParam ? Number(openRoomParam) : null;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    // несколько событий подряд (например, пачка удалений) → один запрос списка
    let refetchTimer: number | undefined;
    const refetchRooms = () => {
      window.clearTimeout(refetchTimer);
      refetchTimer = window.setTimeout(() => dispatch(fetchRooms()), 300);
    };

    const state = () => store.getState();
    const meId = () => state().auth.user?.id;
    const hasRoom = (id: number) => state().rooms.list.some((r) => r.id === id);
    const isCached = (id: number) => state().messages.byRoom[id]?.status === 'ready';

    const onEvent = (event: WsServerEvent) => {
      switch (event.type) {
        case 'new_message': {
          const m = event.message_data;
          if (!m) return;
          dispatch(learnNames([[m.sender_id, m.sender_username]]));
          // новый диалог или чат, вернувшийся из удалённых, — его ещё нет в списке
          if (!hasRoom(m.room)) return refetchRooms();
          if (isCached(m.room)) dispatch(received(m));
          const fromPeer = m.sender_id !== meId();
          dispatch(messageArrived({ message: m, countUnread: fromPeer && m.room !== openRoomRef.current }));
          if (fromPeer) dispatch(typing({ roomId: m.room, isTyping: false }));
          break;
        }
        case 'change_message': {
          const m = event.message_data;
          if (!m) return;
          if (isCached(m.room)) {
            dispatch(received(m));
            dispatch(syncRoomPreview(m.room));
          } else {
            dispatch(roomLastEdited(m));
          }
          break;
        }
        case 'remove_message': {
          const roomId = event.room_id;
          if (roomId === undefined) return;
          if (isCached(roomId)) {
            dispatch(removed({ roomId, messageId: event.message_id }));
            dispatch(syncRoomPreview(roomId));
          } else if (hasRoom(roomId)) {
            refetchRooms(); // не знаем, было ли оно последним
          }
          break;
        }
        case 'typing':
          if (event.room_id !== undefined && event.user_id !== meId()) {
            dispatch(typing({ roomId: event.room_id, isTyping: event.is_typing }));
          }
          break;
        case 'read_message': {
          const roomId = event.room_id;
          if (roomId === undefined || event.user_id === meId()) return;
          const mine = state().messages.byRoom[roomId]?.items.filter((m) => m.sender_id === meId());
          const last = mine?.[mine.length - 1];
          if (last) dispatch(peerRead({ roomId, upTo: last.id }));
          break;
        }
        case 'room_read':
          dispatch(roomRead(event.room_id));
          break;
        case 'room_deleted':
          dispatch(roomRemoved(event.room_id));
          if (openRoomRef.current === event.room_id) navigateRef.current('/', { replace: true });
          break;
        case 'room_restored':
          refetchRooms();
          break;
      }
    };

    const socket = streamSocket({
      onEvent,
      onStatus: (next, reconnected) => {
        setStatus(next);
        // пока были офлайн, события могли потеряться — сверяем список
        if (next === 'open' && reconnected) dispatch(fetchRooms());
      },
    });

    return () => {
      window.clearTimeout(refetchTimer);
      socket.close();
    };
  }, [dispatch]);

  return status;
}
