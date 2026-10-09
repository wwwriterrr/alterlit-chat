import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setNewChatOpen } from '../store/uiSlice';
import { IconEdit, IconQuill } from './Icons';
import s from './EmptyChat.module.css';

export default function EmptyChat() {
  const dispatch = useAppDispatch();
  const noRooms = useAppSelector((st) => st.rooms.status === 'ready' && st.rooms.list.length === 0);

  return (
    <div className={s.root}>
      {noRooms ? (
        <button className={s.chip} onClick={() => dispatch(setNewChatOpen(true))}>
          <IconEdit width={18} height={18} />
          Найдите собеседника, чтобы начать переписку
        </button>
      ) : (
        <div className={s.chip}>
          <IconQuill width={18} height={18} />
          Выберите диалог слева, чтобы продолжить переписку
        </div>
      )}
    </div>
  );
}
