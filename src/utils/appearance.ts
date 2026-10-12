// Настройки оформления: палитра для светлой и тёмной темы, шрифт и размер текста.
// Хранятся только в браузере. Цвета — в styles/global.css ([data-palette=…]),
// здесь только описание вариантов и применение к <html>.
//
// Тот же порядок применения повторяет inline-скрипт в index.html и django/chat.html
// (до загрузки бандла, чтобы не мигало) — при изменении ключей и шрифтов править и там.

export type LightPalette = 'sage' | 'paper';
export type DarkPalette = 'pine' | 'ink' | 'library';
export type FontId = 'ptserif' | 'ptsans' | 'literata';
export type TextSize = 's' | 'm' | 'l';

export interface Appearance {
  light: LightPalette;
  dark: DarkPalette;
  font: FontId;
  size: TextSize;
}

export const DEFAULT_APPEARANCE: Appearance = { light: 'sage', dark: 'pine', font: 'ptserif', size: 'm' };

/** swatch — фон переписки, исходящее сообщение, основной цвет, акцент. */
export interface PaletteInfo<T> {
  id: T;
  label: string;
  swatch: [string, string, string, string];
}

export const LIGHT_PALETTES: PaletteInfo<LightPalette>[] = [
  { id: 'sage', label: 'Шалфей', swatch: ['#e3e7d4', '#dcebc9', '#254f23', '#e9aa44'] },
  { id: 'paper', label: 'Бумага', swatch: ['#ece5d6', '#efe2c6', '#6a4520', '#e9aa44'] },
];

export const DARK_PALETTES: PaletteInfo<DarkPalette>[] = [
  { id: 'pine', label: 'Хвоя', swatch: ['#0f150c', '#2e4d27', '#4c8c40', '#e9aa44'] },
  { id: 'ink', label: 'Чернила', swatch: ['#0a0e15', '#22385a', '#5d8fd6', '#e9aa44'] },
  { id: 'library', label: 'Библиотека', swatch: ['#100c09', '#3d2f1d', '#c49a52', '#b4483c'] },
];

/** href — таблица стилей Google Fonts; у PT Serif её нет: он подключён в шаблоне всегда. */
export const FONTS: { id: FontId; label: string; family: string; href?: string }[] = [
  { id: 'ptserif', label: 'PT Serif', family: "'PT Serif', Georgia, serif" },
  {
    id: 'ptsans',
    label: 'PT Sans',
    family: "'PT Sans', system-ui, sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400&display=swap',
  },
  {
    id: 'literata',
    label: 'Literata',
    family: "'Literata', Georgia, serif",
    href: 'https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,700;1,7..72,400&display=swap',
  },
];

export const SIZES: { id: TextSize; label: string }[] = [
  { id: 's', label: 'Мелкий' },
  { id: 'm', label: 'Средний' },
  { id: 'l', label: 'Крупный' },
];

const KEY = 'alterlit-chat-appearance';

const pick = <T extends string>(v: unknown, list: { id: T }[], fallback: T): T =>
  list.some((x) => x.id === v) ? (v as T) : fallback;

export function loadAppearance(): Appearance {
  let raw: Partial<Record<keyof Appearance, unknown>> = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    /* приватный режим или испорченное значение */
  }
  const d = DEFAULT_APPEARANCE;
  return {
    light: pick(raw.light, LIGHT_PALETTES, d.light),
    dark: pick(raw.dark, DARK_PALETTES, d.dark),
    font: pick(raw.font, FONTS, d.font),
    size: pick(raw.size, SIZES, d.size),
  };
}

export function saveAppearance(a: Appearance) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* приватный режим */
  }
}

/** Подключает таблицу стилей шрифта один раз. Скачиваются только нужные подмножества глифов. */
export function ensureFont(id: FontId) {
  const href = FONTS.find((f) => f.id === id)?.href;
  if (!href || document.getElementById(`font-${id}`)) return;
  const link = document.createElement('link');
  link.id = `font-${id}`;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/** Выставляет атрибуты на <html>; dark — итоговая схема с учётом «как в системе». */
export function applyAppearance(a: Appearance, dark: boolean) {
  const root = document.documentElement;
  root.dataset.palette = dark ? a.dark : a.light;
  ensureFont(a.font);
  if (a.font === 'ptserif') delete root.dataset.font;
  else root.dataset.font = a.font;
  if (a.size === 'm') delete root.dataset.size;
  else root.dataset.size = a.size;
}
