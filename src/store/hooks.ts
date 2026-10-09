import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './index';
import { displayName } from './usersSlice';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/** Собеседник: имя и аватар; known=false — имя пока неизвестно. */
export function usePeer(peerId: number | undefined) {
  const name = useAppSelector((s) => (peerId === undefined ? undefined : displayName(s.users, peerId)));
  const avatar = useAppSelector((s) => (peerId === undefined ? null : (s.users.profiles[peerId]?.avatar ?? null)));
  // логин: из профиля участника, а если его нет — из sender_username сообщений
  const username = useAppSelector((s) =>
    peerId === undefined ? undefined : (s.users.profiles[peerId]?.username ?? s.users.usernames[peerId]),
  );
  return { name: name ?? 'Собеседник', known: name !== undefined, avatar, username };
}
