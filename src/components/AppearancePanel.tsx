import { useEffect } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setAppearance, setTheme, setWallpaper, type ThemePref } from '../store/uiSlice';
import {
  DARK_PALETTES,
  FONTS,
  LIGHT_PALETTES,
  SIZES,
  ensureFont,
  type PaletteInfo,
} from '../utils/appearance';
import { WALLPAPERS } from '../utils/wallpaper';
import { IconBack } from './Icons';
import s from './AppearancePanel.module.css';

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Как в системе' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
];

/** Размер буквы «А» на кнопках размера текста — нагляднее подписи. */
const SIZE_GLYPH = { s: 15, m: 18, l: 22 } as const;

/** Панель «Оформление» на месте списка диалогов: всё применяется сразу, чат справа служит превью. */
export default function AppearancePanel({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((st) => st.ui.theme);
  const appearance = useAppSelector((st) => st.ui.appearance);
  const wallpaper = useAppSelector((st) => st.ui.wallpaper);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = theme === 'dark' || (theme === 'system' && systemDark);

  // образцы «Аа» на карточках шрифтов; браузер скачает только кириллицу
  useEffect(() => FONTS.forEach((f) => ensureFont(f.id)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // выбор палитры другой схемы сразу переключает тему — иначе выбор не виден
  const pickLight = (id: (typeof LIGHT_PALETTES)[number]['id']) => {
    dispatch(setAppearance({ light: id }));
    if (dark) dispatch(setTheme('light'));
  };
  const pickDark = (id: (typeof DARK_PALETTES)[number]['id']) => {
    dispatch(setAppearance({ dark: id }));
    if (!dark) dispatch(setTheme('dark'));
  };

  return (
    <div className={s.panel}>
      <header className={s.header}>
        <button className={s.back} onClick={onClose} aria-label="Назад к диалогам">
          <IconBack />
        </button>
        <h1 className={s.title}>Оформление</h1>
      </header>

      <div className={s.body}>
        <section className={s.section} aria-labelledby="ap-theme">
          <h2 id="ap-theme" className={s.heading}>Тема</h2>
          <div className={s.segments} role="radiogroup" aria-labelledby="ap-theme">
            {THEMES.map((t) => (
              <button
                key={t.value}
                role="radio"
                aria-checked={theme === t.value}
                className={s.segment}
                onClick={() => dispatch(setTheme(t.value))}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <PaletteGroup
          id="ap-light"
          title="Светлая палитра"
          list={LIGHT_PALETTES}
          value={appearance.light}
          active={!dark}
          onPick={pickLight}
        />
        <PaletteGroup
          id="ap-dark"
          title="Тёмная палитра"
          list={DARK_PALETTES}
          value={appearance.dark}
          active={dark}
          onPick={pickDark}
        />

        <section className={s.section} aria-labelledby="ap-font">
          <h2 id="ap-font" className={s.heading}>Шрифт</h2>
          <div className={s.cards} role="radiogroup" aria-labelledby="ap-font">
            {FONTS.map((f) => (
              <button
                key={f.id}
                role="radio"
                aria-checked={appearance.font === f.id}
                className={`${s.card} ${s.fontCard}`}
                onClick={() => dispatch(setAppearance({ font: f.id }))}
              >
                <span className={s.fontSample} style={{ fontFamily: f.family }} aria-hidden>
                  Аа
                </span>
                <span className={s.cardSub}>{f.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={s.section} aria-labelledby="ap-size">
          <h2 id="ap-size" className={s.heading}>Размер текста</h2>
          <div className={s.segments} role="radiogroup" aria-labelledby="ap-size">
            {SIZES.map((z) => (
              <button
                key={z.id}
                role="radio"
                aria-checked={appearance.size === z.id}
                aria-label={z.label}
                title={z.label}
                className={`${s.segment} ${s.sizeSegment}`}
                style={{ fontSize: SIZE_GLYPH[z.id] }}
                onClick={() => dispatch(setAppearance({ size: z.id }))}
              >
                А
              </button>
            ))}
          </div>
        </section>

        <section className={s.section} aria-labelledby="ap-wp">
          <h2 id="ap-wp" className={s.heading}>Обои чата</h2>
          <div className={s.wallpapers} role="radiogroup" aria-labelledby="ap-wp">
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
        </section>

        <p className={s.note}>Настройки хранятся в этом браузере.</p>
      </div>
    </div>
  );
}

function PaletteGroup<T extends string>(props: {
  id: string;
  title: string;
  list: PaletteInfo<T>[];
  value: T;
  /** эта схема сейчас на экране */
  active: boolean;
  onPick: (id: T) => void;
}) {
  const { id, title, list, value, active, onPick } = props;
  return (
    <section className={s.section} aria-labelledby={id}>
      <h2 id={id} className={s.heading}>
        {title}
        {active && <span className={s.now}>сейчас</span>}
      </h2>
      <div className={s.cards} data-count={list.length} role="radiogroup" aria-labelledby={id}>
        {list.map((p) => (
          <button key={p.id} role="radio" aria-checked={value === p.id} className={s.card} onClick={() => onPick(p.id)}>
            <span className={s.swatch} aria-hidden>
              {p.swatch.map((c, i) => (
                <span key={i} style={{ background: c }} />
              ))}
            </span>
            <span className={s.cardTitle}>{p.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
