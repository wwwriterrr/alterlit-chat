import { useMatch, useNavigate } from 'react-router';
import { useAppDispatch, useAppSelector, usePeer } from '../store/hooks';
import { deleteRooms } from '../store/roomsSlice';
import { askDeleteRooms, stopSelecting } from '../store/uiSlice';
import { peerIdOf } from '../utils/people';
import { CHATS, plural } from '../utils/plural';
import { ConfirmDialog } from './MessageMenu';
import { routes } from '../utils/routes';

/** Подтверждение «Удалить чат?» / «Удалить N чатов?» — для меню списка, шапки чата и режима выбора. */
export default function DeleteRoomConfirm() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const ids = useAppSelector((st) => st.ui.confirmDeleteRooms);
  const meId = useAppSelector((st) => st.auth.user?.id);
  const list = useAppSelector((st) => st.rooms.list);
  // чаты могли пропасть, пока открыт диалог (удалены в другой вкладке)
  const rooms = ids ? list.filter((r) => ids.includes(r.id)) : [];
  const single = rooms.length === 1 ? rooms[0] : undefined;
  const { name } = usePeer(single ? peerIdOf(single.members, meId) : undefined);
  const openRoomId = Number(useMatch('/room/:roomId')?.params.roomId);

  if (!rooms.length) return null;

  const cancel = () => dispatch(askDeleteRooms(null));
  const n = rooms.length;

  return (
    <ConfirmDialog
      title={single ? `Удалить чат «${name}»?` : `Удалить ${n} ${plural(n, CHATS)}?`}
      text={
        single
          ? 'Чат пропадёт только у вас, непрочитанные сообщения станут прочитанными. Если собеседник напишет снова, чат вернётся со всей историей.'
          : 'Чаты пропадут только у вас, непрочитанные сообщения станут прочитанными. Если собеседник напишет снова, его чат вернётся со всей историей.'
      }
      confirmLabel={single ? 'Удалить чат' : `Удалить ${n} ${plural(n, CHATS)}`}
      onCancel={cancel}
      onConfirm={() => {
        cancel();
        dispatch(stopSelecting());
        if (rooms.some((r) => r.id === openRoomId)) navigate(routes.home, { replace: true });
        dispatch(deleteRooms(rooms.map((r) => r.id)));
      }}
    />
  );
}
