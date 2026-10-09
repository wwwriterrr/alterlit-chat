import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RoomMember } from '../api/types';

// Профили собеседников (имя, аватар) приходят в RoomSerializer.members.
// Пока бэкенд отдаёт только id, логины берутся из сообщений (sender_username).
// Оба источника кэшируются в localStorage, чтобы список не «мигал» при загрузке.
const KEY = 'alterlit-chat-people';

interface UsersState {
  /** id → логин из sender_username */
  usernames: Record<number, string>;
  /** id → профиль из members (приоритетнее логина) */
  profiles: Record<number, RoomMember>;
}

function load(): UsersState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { usernames: saved.usernames ?? {}, profiles: saved.profiles ?? {} };
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
        if (!prev || prev.username !== m.username || prev.name !== m.name || prev.avatar !== m.avatar) {
          state.profiles[m.id] = { id: m.id, username: m.username, name: m.name ?? null, avatar: m.avatar ?? null };
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
