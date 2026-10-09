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

export function peerIdOf(members: number[], meId: number | undefined) {
  return members.find((m) => m !== meId) ?? members[0];
}
