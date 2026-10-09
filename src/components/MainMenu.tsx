import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setTheme, setWallpaper, type ThemePref } from '../store/uiSlice';
import { WALLPAPERS } from '../utils/wallpaper';
import { logoutUrl } from '../utils/people';
import Avatar from './Avatar';
import { IconLogout, IconMenu, IconMoon, IconSun } from './Icons';
import s from './MainMenu.module.css';

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Как в системе' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
];

export default function MainMenu() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((st) => st.auth.user);
  const theme = useAppSelector((st) => st.ui.theme);
  const wallpaper = useAppSelector((st) => st.ui.wallpaper);
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
          <div className={s.group} role="group" aria-label="Тема">
            <div className={s.groupTitle}>
              {theme === 'dark' ? <IconMoon width={18} height={18} /> : <IconSun width={18} height={18} />}
              Тема оформления
            </div>
            <div className={s.segments}>
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  role="menuitemradio"
                  aria-checked={theme === t.value}
                  className={s.segment}
                  onClick={() => dispatch(setTheme(t.value))}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className={s.group} role="radiogroup" aria-label="Обои чата">
            <div className={s.groupTitle}>Обои чата</div>
            <div className={s.wallpapers}>
              {WALLPAPERS.map((w) => (
                <button
                  key={w.id}
                  role="radio"
                  aria-checked={wallpaper === w.id}
                  className={s.wp}
                  onClick={() => dispatch(setWallpaper(w.id))}
                >
                  <span className={`${s.wpPreview} chat-wallpaper`} data-wp={w.id} aria-hidden />
                  <span className={s.wpLabel}>{w.label}</span>
                </button>
              ))}
            </div>
          </div>
          <a role="menuitem" className={`${s.item} ${s.danger}`} href={logoutUrl()}>
            <IconLogout width={20} height={20} />
            Выйти из аккаунта
          </a>
        </div>
      )}
    </div>
  );
}
