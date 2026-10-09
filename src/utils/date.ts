const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const short = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });

// На проде даты приходят без часового пояса (USE_TZ=False) — считаем их временем сервера
const SERVER_OFFSET = import.meta.env.VITE_SERVER_UTC_OFFSET || '+03:00';

export function parseDate(iso: string) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + SERVER_OFFSET);
}

/** Сравнение дат сервера независимо от формата (с поясом или без). */
export function dateMs(iso: string | null | undefined) {
  return iso ? parseDate(iso).getTime() : 0;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatTime(iso: string) {
  return time.format(parseDate(iso));
}

export function dayKey(iso: string) {
  const d = parseDate(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** «Сегодня», «Вчера», «3 октября», «3 октября 2024». */
export function formatDay(iso: string) {
  const d = parseDate(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  return d.getFullYear() === new Date().getFullYear() ? dayMonth.format(d) : dayMonthYear.format(d);
}

/** Время в списке диалогов, как в Telegram: сегодня — часы, неделя — день недели, дальше — дата. */
export function formatListDate(iso: string | null) {
  if (!iso) return '';
  const d = parseDate(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (diff === 0) return time.format(d);
  if (diff < 7) return weekday.format(d).replace('.', '');
  return short.format(d);
}
