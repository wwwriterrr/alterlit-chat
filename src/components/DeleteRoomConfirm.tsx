import { useMatch, useNavigate } from 'react-router';
import { useAppDispatch, useAppSelector, usePeer } from '../store/hooks';
import { deleteRoom } from '../store/roomsSlice';
import { askDeleteRoom } from '../store/uiSlice';
import { peerIdOf } from '../utils/people';
import { ConfirmDialog } from './MessageMenu';

/** Подтверждение «Удалить чат?» — общее для списка диалогов и шапки чата. */
export default function DeleteRoomConfirm() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const roomId = useAppSelector((st) => st.ui.confirmDeleteRoom);
  const meId = useAppSelector((st) => st.auth.user?.id);
  const room = useAppSelector((st) => st.rooms.list.find((r) => r.id === roomId));
  const { name } = usePeer(room ? peerIdOf(room.members, meId) : undefined);
  const openRoomId = useMatch('/room/:roomId')?.params.roomId;

  if (roomId === null || !room) return null;

  const cancel = () => dispatch(askDeleteRoom(null));

  return (
    <ConfirmDialog
      title={`Удалить чат «${name}»?`}
      text="Чат пропадёт только у вас, непрочитанные сообщения станут прочитанными. Если собеседник напишет снова, чат вернётся со всей историей."
      confirmLabel="Удалить чат"
      onCancel={cancel}
      onConfirm={() => {
        cancel();
        if (openRoomId === String(roomId)) navigate('/', { replace: true });
        dispatch(deleteRoom(roomId));
      }}
    />
  );
}
