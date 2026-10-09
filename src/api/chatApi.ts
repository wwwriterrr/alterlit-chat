import type { AxiosProgressEvent } from 'axios';
import { http, setCsrfFallback } from './http';

const USERS_SELF = import.meta.env.VITE_SELF_URL || '/api/v1/users/session/self/';
import type { Message, Paginated, RawRoom, Room, RoomMember, User } from './types';

/** next из DRF — абсолютный URL; превращаем в путь, чтобы работал и через dev-прокси. */
function toPath(url: string) {
  try {
    const u = new URL(url, location.origin);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function normalizeRoom({ members_info, ...raw }: RawRoom): Room {
  const nested = raw.members.filter((m): m is RoomMember => typeof m === 'object' && m !== null);
  const info = nested.length ? nested : (members_info ?? []);
  return {
    ...raw,
    members: raw.members.map((m) => (typeof m === 'number' ? m : m.id)),
    membersInfo: info.length ? info : undefined,
  };
}

function unwrap<T>(data: T[] | Paginated<T>): { items: T[]; next: string | null } {
  if (Array.isArray(data)) return { items: data, next: null };
  return { items: data.results, next: data.next ? toPath(data.next) : null };
}

export const authApi = {
  async csrf() {
    const { data } = await http.get<{ csrfToken: string }>('/auth/csrf/');
    if (data?.csrfToken) setCsrfFallback(data.csrfToken);
  },
  /** Текущий пользователь сайта — живёт вне /api/v1/chat/. */
  async me() {
    const { data } = await http.get<User>(USERS_SELF, { baseURL: '' });
    return data;
  },
  async login(username: string, password: string) {
    const { data } = await http.post<User>('/auth/login/', { username, password });
    return data;
  },
  async logout() {
    await http.post('/auth/logout/');
  },
};

export const chatApi = {
  async rooms() {
    const rooms: Room[] = [];
    let url: string | null = null;
    // идём по страницам, если включена пагинация (ROOMS_LIMIT = 200)
    for (let i = 0; i < 20; i++) {
      const res: { data: RawRoom[] | Paginated<RawRoom> } = url
        ? await http.get(url, { baseURL: '' })
        : await http.get('/rooms/');
      const page = unwrap(res.data);
      rooms.push(...page.items.map(normalizeRoom));
      url = page.next;
      if (!url) break;
    }
    return rooms;
  },
  async dialogWith(peerId: number) {
    const { data } = await http.post<RawRoom>(`/rooms/dialog/${peerId}/`);
    return normalizeRoom(data);
  },
  /** url — абсолютная ссылка `next` из пагинации, если есть. */
  async messages(roomId: number, url?: string) {
    const { data } = await http.get<Message[] | Paginated<Message>>(url ?? `/rooms/${roomId}/messages/`, {
      baseURL: url ? '' : undefined,
    });
    return unwrap(data);
  },
  async send(
    roomId: number,
    content: string,
    files: File[],
    opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
  ) {
    const fd = new FormData();
    if (content) fd.append('content', content);
    files.forEach((f) => fd.append('files', f));
    const { data } = await http.post<Message>(`/rooms/${roomId}/messages/`, fd, {
      signal: opts.signal,
      onUploadProgress: (e: AxiosProgressEvent) => {
        if (e.total) opts.onProgress?.(e.loaded / e.total);
      },
    });
    return data;
  },
  async editMessage(roomId: number, messageId: number, content: string) {
    const { data } = await http.patch<Message>(`/rooms/${roomId}/messages/${messageId}/`, { content });
    return data;
  },
  async deleteMessage(roomId: number, messageId: number) {
    await http.delete(`/rooms/${roomId}/messages/${messageId}/`);
  },
  /** Удаляет чат только у себя: пропадает из списка, вернётся с новым сообщением. */
  async deleteRoom(roomId: number) {
    await http.delete(`/rooms/${roomId}/`);
  },
  async markRead(roomId: number) {
    const { data } = await http.post<{ marked: number }>(`/rooms/${roomId}/mark-read/`);
    return data;
  },
};
