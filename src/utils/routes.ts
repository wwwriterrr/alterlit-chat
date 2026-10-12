// Пути внутри SPA (от data-base, например /messenger/). Все заканчиваются на «/» —
// как URL на стороне Django; собирать адреса только через эти функции.

export const routes = {
  home: '/',
  room: (roomId: number | string) => `/room/${roomId}/`,
  dialog: (peerId: number | string) => `/dialog/${peerId}/`,
};

/**
 * Адрес без завершающего «/» (/messenger, /messenger/room/36) заменяем на канонический
 * до старта роутера: иначе /messenger не совпадёт с basename /messenger/ и экран будет пустым.
 */
export function canonicalizeLocation() {
  const { pathname, search, hash } = window.location;
  if (!pathname.endsWith('/')) window.history.replaceState(window.history.state, '', `${pathname}/${search}${hash}`);
}
