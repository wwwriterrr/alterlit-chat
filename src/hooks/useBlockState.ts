import { useEffect } from 'react';
import { fetchBlockState } from '../store/blacklistSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

/** Блокировки с собеседником; при первом обращении спрашивает сервер. undefined — ещё неизвестно. */
export function useBlockState(peerId: number | undefined) {
  const dispatch = useAppDispatch();
  const state = useAppSelector((st) => (peerId === undefined ? undefined : st.blacklist.byPeer[peerId]));
  const busy = useAppSelector((st) => (peerId === undefined ? false : Boolean(st.blacklist.busy[peerId])));
  useEffect(() => {
    if (peerId !== undefined) dispatch(fetchBlockState(peerId));
  }, [peerId, dispatch]);
  return { state, busy };
}
