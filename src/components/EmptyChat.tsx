import { IconQuill } from './Icons';
import s from './EmptyChat.module.css';

export default function EmptyChat() {
  return (
    <div className={s.root}>
      <div className={s.chip}>
        <IconQuill width={18} height={18} />
        Выберите диалог слева, чтобы продолжить переписку
      </div>
    </div>
  );
}
