import { useCallback, useEffect, useRef, useState } from 'react';
import { usersApi } from '../api/chatApi';
import { errorText } from '../api/http';
import type { UserCard } from '../api/types';
import { blockedByMe, setBlocked } from '../store/blacklistSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { badgeOf } from '../utils/people';
import Avatar from './Avatar';
import { IconBack } from './Icons';
import PersonName from './PersonName';
import s from './BlacklistPanel.module.css';

const PAGE = 30;

/** Панель «Заблокированные»: кого заблокировал пользователь, с разблокировкой. */
export default function BlacklistPanel({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [items, setItems] = useState<UserCard[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (offset: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (offset === 0) setStatus('loading');
      else setLoadingMore(true);
      try {
        const page = await usersApi.blacklist(offset, PAGE);
        // список с сервера — источник правды для флагов в чатах
        page.objects.forEach((u) => dispatch(blockedByMe({ peerId: u.id, blocked: true })));
        setItems((prev) => {
          const known = new Set(prev.map((u) => u.id));
          return offset === 0 ? page.objects : [...prev, ...page.objects.filter((u) => !known.has(u.id))];
        });
        setMore(page.more);
        setStatus('ready');
      } catch (e) {
        if (offset === 0) {
          setError(errorText(e, 'Не удалось загрузить список.'));
          setStatus('error');
        }
      } finally {
        loadingRef.current = false;
        setLoadingMore(false);
      }
    },
    [dispatch],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  // следующая страница, когда низ списка показался на экране
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !more) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && load(items.length), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, load, items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={s.panel}>
      <header className={s.header}>
        <button className={s.back} onClick={onClose} aria-label="Назад к диалогам">
          <IconBack />
        </button>
        <h1 className={s.title}>Заблокированные</h1>
      </header>

      <div className={s.body}>
        {status === 'loading' && <div className={s.loader} role="status" aria-label="Загружаем" />}
        {status === 'error' && (
          <div className={s.note} role="alert">
            <p>{error}</p>
            <button className={s.retry} onClick={() => load(0)}>
              Повторить
            </button>
          </div>
        )}
        {status === 'ready' && items.length === 0 && (
          <div className={s.note}>
            <p className={s.noteTitle}>Вы никого не заблокировали</p>
            <p>Заблокировать пользователя можно в меню «⋮» в чате с ним.</p>
          </div>
        )}

        {items.length > 0 && (
          <>
            <p className={s.hint}>Заблокированные не могут писать вам, а вы — им. Переписка сохраняется.</p>
            <ul className={s.list}>
              {items.map((u) => (
                <BlockedRow key={u.id} user={u} />
              ))}
            </ul>
          </>
        )}
        {more && <div ref={sentinelRef} className={s.sentinel} aria-hidden />}
        {loadingMore && <div className={s.loader} aria-label="Загружаем ещё" />}
      </div>
    </div>
  );
}

/** Строка остаётся после разблокировки — чтобы случайное нажатие можно было отменить. */
function BlockedRow({ user }: { user: UserCard }) {
  const dispatch = useAppDispatch();
  const blocked = useAppSelector((st) => st.blacklist.byPeer[user.id]?.blocked ?? true);
  const busy = useAppSelector((st) => Boolean(st.blacklist.busy[user.id]));
  const name = user.nickname?.trim() || user.username;

  return (
    <li className={s.item} data-unblocked={!blocked || undefined}>
      <Avatar id={user.id} name={name} src={user.avatar} size={46} />
      <span className={s.text}>
        <span className={s.name}>
          <PersonName name={name} badge={badgeOf(user)} />
        </span>
        <span className={s.login}>@{user.username}</span>
      </span>
      <button
        className={s.action}
        data-kind={blocked ? 'unblock' : 'block'}
        disabled={busy}
        onClick={() => dispatch(setBlocked(user.id, !blocked))}
        aria-label={blocked ? `Разблокировать ${name}` : `Снова заблокировать ${name}`}
      >
        {blocked ? 'Разблокировать' : 'Заблокировать'}
      </button>
    </li>
  );
}
