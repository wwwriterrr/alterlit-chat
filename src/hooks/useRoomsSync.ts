import { useEffect } from 'react';
import { store } from '../store';
import { useAppDispatch } from '../store/hooks';
import { expireTyping, fetchRooms, resolvePeerNames } from '../store/roomsSlice';

const INTERVAL_MS = 30_000;

/**
 * Начальная загрузка списка диалогов и запасной опрос.
 * Пока личный поток ws/chat/stream/ подключён (live), список обновляется
 * событиями и опрос не нужен. Если поток недоступен (бэкенд без него,
 * обрыв связи) — раз в 30 секунд и при возврате на вкладку.
 */
export function useRoomsSync(live: boolean) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(fetchRooms()).then(() => dispatch(resolvePeerNames()));
    // «печатает…» гаснет сам, если собеседник замолчал и не прислал is_typing: false
    const typingTimer = window.setInterval(() => {
      if (Object.keys(store.getState().rooms.typingUntil).length) dispatch(expireTyping(Date.now()));
    }, 1000);
    return () => window.clearInterval(typingTimer);
  }, [dispatch]);

  useEffect(() => {
    if (live) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') dispatch(fetchRooms()).then(() => dispatch(resolvePeerNames()));
    };
    const timer = window.setInterval(refresh, INTERVAL_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [dispatch, live]);
}
