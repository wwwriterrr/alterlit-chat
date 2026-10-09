import { useCallback, useEffect, useRef, useState } from 'react';
import { chatApi } from '../api/chatApi';
import { roomSocket, type ChatSocket } from '../api/socket';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchMessages, received, removed, syncRoomPreview } from '../store/messagesSlice';
import { messageArrived, peerRead, roomRead, typing } from '../store/roomsSlice';
import { learnNames } from '../store/usersSlice';
import { store } from '../store';

export type SocketStatus = 'connecting' | 'open' | 'closed' | 'forbidden';

/**
 * Жизненный цикл открытой комнаты (п. 6.4 контракта):
 * GET messages → WS ws/chat/<id>/ → POST mark-read.
 */
export function useRoomSocket(roomId: number) {
  const dispatch = useAppDispatch();
  const meId = useAppSelector((s) => s.auth.user?.id);
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const socketRef = useRef<ChatSocket | null>(null);

  const markRead = useCallback(() => {
    dispatch(roomRead(roomId));
    // read_message собеседнику и room_read в другие вкладки рассылает сервер
    chatApi.markRead(roomId).catch(() => undefined);
  }, [dispatch, roomId]);

  useEffect(() => {
    dispatch(fetchMessages(roomId));
    markRead();

    let readQueued = false;
    const readWhenVisible = () => {
      if (document.visibilityState === 'visible') markRead();
      else readQueued = true;
    };
    const onVisible = () => {
      if (readQueued && document.visibilityState === 'visible') {
        readQueued = false;
        markRead();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    const socket = roomSocket(roomId, {
      onStatus: (next, reconnected) => {
        setStatus(next);
        if (reconnected) dispatch(fetchMessages(roomId));
      },
      onEvent: (event) => {
        switch (event.type) {
          case 'new_message':
          case 'change_message': {
            const m = event.message_data;
            if (!m || m.room !== roomId) return;
            dispatch(received(m));
            dispatch(learnNames([[m.sender_id, m.sender_username]]));
            if (event.type === 'new_message') {
              dispatch(messageArrived({ message: m, countUnread: false }));
              if (m.sender_id !== meId) {
                dispatch(typing({ roomId, isTyping: false }));
                readWhenVisible();
              }
            } else {
              dispatch(syncRoomPreview(roomId));
            }
            break;
          }
          case 'remove_message':
            dispatch(removed({ roomId, messageId: event.message_id }));
            dispatch(syncRoomPreview(roomId));
            break;
          case 'read_message': {
            if (event.user_id === meId) return;
            const mine = store.getState().messages.byRoom[roomId]?.items.filter((m) => m.sender_id === meId);
            const last = mine?.[mine.length - 1];
            if (last) dispatch(peerRead({ roomId, upTo: last.id }));
            break;
          }
          case 'typing':
            if (event.user_id !== meId) dispatch(typing({ roomId, isTyping: event.is_typing }));
            break;
        }
      },
    });
    socketRef.current = socket;

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      socket.close();
      socketRef.current = null;
    };
  }, [dispatch, roomId, meId, markRead]);

  const sendTyping = useCallback(
    // user_id и room_id проставляет сервер (ChatConsumer)
    (isTyping: boolean) => socketRef.current?.send({ type: 'typing', is_typing: isTyping }),
    [],
  );

  return { status, sendTyping };
}
