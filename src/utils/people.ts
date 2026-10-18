// Палитра аватаров взята из цветов alterlit.ru.
const AVATAR_COLORS = ['#254F23', '#C9861E', '#407BC8', '#B85454', '#5B48D1', '#2F8C9C', '#6B7F2A', '#8A5A3C'];

export function avatarColor(id: number) {
  return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/[\s_.-]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Значок рядом с именем: staff — синий (is_staff, «Администрация сайта»),
 * chief — красный («Шеф-редактор»), owner — свой золотой значок («Владелец сайта»).
 */
export type PersonBadge = 'staff' | 'chief' | 'owner' | null;

const CHIEF_EDITOR_ID = 79691;
const OWNER_ID = 35717;

export function badgeOf(member: { id: number; is_staff?: boolean }): PersonBadge {
  if (member.id === CHIEF_EDITOR_ID) return 'chief';
  if (member.id === OWNER_ID) return 'owner';
  return member.is_staff ? 'staff' : null;
}

export function peerIdOf(members: number[], meId: number | undefined) {
  return members.find((m) => m !== meId) ?? members[0];
}

/** Профиль пользователя на сайте. Шаблон — VITE_PROFILE_URL, {username} заменяется на логин. */
export function profileUrl(username: string) {
  const template = import.meta.env.VITE_PROFILE_URL || 'https://alterlit.ru/profile/{username}/';
  return template.replace('{username}', encodeURIComponent(username));
}

/** Куда отправлять неавторизованного пользователя. VITE_LOGIN_URL, по умолчанию — главная сайта. */
export function loginUrl() {
  return import.meta.env.VITE_LOGIN_URL || 'https://alterlit.ru/';
}

/** Выход на сайте. */
export function logoutUrl() {
  return import.meta.env.VITE_LOGOUT_URL || 'https://alterlit.ru/logout/';
}
