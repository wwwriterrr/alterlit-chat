import type { PeerBlock } from '../store/blacklistSlice';
import { setBlocked } from '../store/blacklistSlice';
import { useAppDispatch } from '../store/hooks';
import { IconBlock } from './Icons';
import s from './BlockedBar.module.css';

/** Вместо поля ввода, когда писать нельзя: я заблокировал собеседника или он меня. */
export default function BlockedBar({ peerId, block, busy }: { peerId: number; block: PeerBlock; busy: boolean }) {
  const dispatch = useAppDispatch();
  return (
    <div className={s.dock}>
      <div className={s.bar} role="status">
        <IconBlock className={s.icon} width={18} height={18} />
        {block.blocked ? (
          <>
            <span className={s.text}>Вы заблокировали пользователя</span>
            <button className={s.action} disabled={busy} onClick={() => dispatch(setBlocked(peerId, false))}>
              Разблокировать
            </button>
          </>
        ) : (
          <span className={s.text}>Пользователь ограничил вам личные сообщения</span>
        )}
      </div>
    </div>
  );
}
