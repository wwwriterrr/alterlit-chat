import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { openPanel } from '../store/uiSlice';
import { logoutUrl } from '../utils/people';
import Avatar from './Avatar';
import { IconBlock, IconHome, IconLogout, IconMenu, IconPalette } from './Icons';
import s from './MainMenu.module.css';

export default function MainMenu() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((st) => st.auth.user);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={s.wrap} ref={ref}>
      <button className={s.trigger} aria-label="Меню" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <IconMenu />
      </button>
      {open && (
        <div className={s.menu} role="menu">
          {user && (
            <div className={s.me}>
              <Avatar id={user.id} name={user.name || user.username} src={user.avatar} size={40} />
              <div className={s.meText}>
                <div className={s.meName}>{user.name || user.username}</div>
                <div className={s.meSub}>@{user.username}</div>
              </div>
            </div>
          )}
          <button
            role="menuitem"
            className={s.item}
            onClick={() => {
              setOpen(false);
              dispatch(openPanel('appearance'));
            }}
          >
            <IconPalette width={20} height={20} />
            Оформление
          </button>
          <button
            role="menuitem"
            className={s.item}
            onClick={() => {
              setOpen(false);
              dispatch(openPanel('blacklist'));
            }}
          >
            <IconBlock width={20} height={20} />
            Заблокированные
          </button>
          <a role="menuitem" className={s.item} href="https://alterlit.ru">
            <IconHome width={20} height={20} />
            На Альтерлит
          </a>
          <a role="menuitem" className={`${s.item} ${s.danger}`} href={logoutUrl()}>
            <IconLogout width={20} height={20} />
            Выйти из аккаунта
          </a>
        </div>
      )}
    </div>
  );
}
