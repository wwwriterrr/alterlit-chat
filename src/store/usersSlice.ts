import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RoomMember } from '../api/types';
import { badgeOf, type PersonBadge } from '../utils/people';

// Профили собеседников (имя, аватар) приходят в RoomSerializer.members.
// Пока бэкенд отдаёт только id, логины берутся из сообщений (sender_username).
// Оба источника кэшируются в localStorage, чтобы список не «мигал» при загрузке.
const KEY = 'alterlit-chat-people';

/** То, что храним о собеседнике. */
export interface PersonProfile {
  id: number;
  username: string;
  name: string | null;
  avatar: string | null;
  badge: PersonBadge;
}

interface UsersState {
  /** id → логин из sender_username */
  usernames: Record<number, string>;
  /** id → профиль из members (приоритетнее логина) */
  profiles: Record<number, PersonProfile>;
}

function load(): UsersState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    const profiles: Record<number, PersonProfile> = saved.profiles ?? {};
    // значки особых пользователей — по id, а не из кэша: раньше у 79691 был сохранён 'owner'
    for (const p of Object.values(profiles)) {
      const byId = badgeOf({ id: p.id });
      if (byId) p.badge = byId;
      else if (p.badge !== 'staff') p.badge = null;
    }
    return { usernames: saved.usernames ?? {}, profiles };
  } catch {
    return { usernames: {}, profiles: {} };
  }
}

function save(state: UsersState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* приватный режим */
  }
}

const usersSlice = createSlice({
  name: 'users',
  initialState: load,
  reducers: {
    learnNames(state, action: PayloadAction<Array<[number, string]>>) {
      let changed = false;
      for (const [id, name] of action.payload) {
        if (name && state.usernames[id] !== name) {
          state.usernames[id] = name;
          changed = true;
        }
      }
      if (changed) save(state);
    },
    learnProfiles(state, action: PayloadAction<RoomMember[]>) {
      let changed = false;
      for (const m of action.payload) {
        const prev = state.profiles[m.id];
        const next: PersonProfile = {
          id: m.id,
          username: m.username,
          name: m.name ?? null,
          avatar: m.avatar ?? null,
          // старый бэкенд без is_staff — оставляем, что знали
          badge: m.is_staff === undefined ? (prev?.badge ?? badgeOf(m)) : badgeOf(m),
        };
        if (
          !prev ||
          prev.username !== next.username ||
          prev.name !== next.name ||
          prev.avatar !== next.avatar ||
          prev.badge !== next.badge
        ) {
          state.profiles[m.id] = next;
          changed = true;
        }
      }
      if (changed) save(state);
    },
  },
});

/** Отображаемое имя: имя из профиля → логин из профиля → логин из сообщений. */
export function displayName(state: UsersState, id: number): string | undefined {
  const p = state.profiles[id];
  return p?.name?.trim() || p?.username || state.usernames[id];
}

export const { learnNames, learnProfiles } = usersSlice.actions;
export default usersSlice.reducer;
