import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import type { UserSearchResult } from '../api/types';
import { SEARCH_MIN_LENGTH, useUserSearch } from '../hooks/useUserSearch';
import { useAppDispatch } from '../store/hooks';
import { startChatWith } from '../store/roomsSlice';
import Avatar from './Avatar';
import { IconBack, IconClose, IconSearch } from './Icons';
import s from './NewChatPanel.module.css';

/** Панель «Новый чат»: поиск собеседника на месте списка диалогов. */
export default function NewChatPanel({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [opening, setOpening] = useState<number | null>(null);
  const { q, items, status, more, loadingMore, error, loadMore, retry } = useUserSearch(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setActive(0), [q]);

  // подгрузка следующей страницы, когда низ списка показался на экране
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !more) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, loadMore]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = async (user: UserSearchResult) => {
    if (opening !== null) return;
    setOpening(user.id);
    const roomId = await dispatch(startChatWith(user));
    setOpening(null);
    if (roomId !== null) {
      onClose();
      navigate(`/room/${roomId}`);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (query) setQuery('');
      else onClose();
    } else if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      void choose(items[active]);
    }
  };

  return (
    <div className={s.panel}>
      <header className={s.header}>
        <button className={s.back} onClick={onClose} aria-label="Назад к диалогам">
          <IconBack />
        </button>
        <label className={s.search}>
          <IconSearch className={s.searchIcon} width={18} height={18} />
          <span className="visually-hidden">Поиск собеседника</span>
          <input
            ref={inputRef}
            type="search"
            placeholder="Имя или логин"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="new-chat-results"
            aria-activedescendant={items[active] ? `new-chat-user-${items[active].id}` : undefined}
            autoComplete="off"
          />
          {query && (
            <button type="button" className={s.clear} onClick={() => setQuery('')} aria-label="Очистить поиск">
              <IconClose width={16} height={16} />
            </button>
          )}
        </label>
      </header>

      <div className={s.body}>
        <h2 className={s.title}>Новый чат</h2>

        {status === 'idle' && (
          <p className={s.note}>
            {q.length === 0
              ? 'Найдите собеседника по имени или логину на alterlit.ru.'
              : `Введите хотя бы ${SEARCH_MIN_LENGTH} символа.`}
          </p>
        )}
        {status === 'loading' && <div className={s.loader} role="status" aria-label="Ищем" />}
        {status === 'error' && (
          <div className={s.note} role="alert">
            <p>{error}</p>
            <button className={s.retry} onClick={retry}>
              Повторить
            </button>
          </div>
        )}
        {status === 'ready' && items.length === 0 && (
          <p className={s.note}>По запросу «{q}» никого не нашли. Проверьте написание или попробуйте логин.</p>
        )}

        {items.length > 0 && (
          <ul className={s.list} id="new-chat-results" role="listbox" aria-label="Найденные пользователи" ref={listRef}>
            {items.map((u, i) => (
              <li key={u.id} role="presentation">
                <button
                  id={`new-chat-user-${u.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  className={s.item}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(u)}
                  disabled={opening !== null}
                  data-opening={opening === u.id || undefined}
                >
                  <Avatar id={u.id} name={u.name || u.username} src={u.avatar} size={46} />
                  <span className={s.text}>
                    <span className={s.name}>{u.name || u.username}</span>
                    <span className={s.login}>@{u.username}</span>
                  </span>
                  {opening === u.id ? (
                    <span className={s.spinner} aria-label="Открываем" />
                  ) : (
                    u.room_id !== null && <span className={s.tag}>есть чат</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {more && <div ref={sentinelRef} className={s.sentinel} aria-hidden />}
        {loadingMore && <div className={s.loader} aria-label="Загружаем ещё" />}
      </div>
    </div>
  );
}
