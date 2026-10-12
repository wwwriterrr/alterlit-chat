import { useAppSelector } from '../store/hooks';
import { peerIdOf } from '../utils/people';

/** Собеседник в диалоге: из участников комнаты, а если её ещё нет в списке — из сообщений. */
export function useRoomPeer(roomId: number) {
  const meId = useAppSelector((st) => st.auth.user?.id);
  const room = useAppSelector((st) => st.rooms.list.find((r) => r.id === roomId));
  const fallbackPeer = useAppSelector((st) =>
    st.messages.byRoom[roomId]?.items.find((m) => m.sender_id !== meId)?.sender_id,
  );
  return { room, peerId: room ? peerIdOf(room.members, meId) : fallbackPeer };
}
