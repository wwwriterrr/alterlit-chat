import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { WALLPAPERS, type WallpaperId } from '../utils/wallpaper';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'alterlit-chat-theme';
const WP_KEY = 'alterlit-chat-wallpaper';

/** Действие в уведомлении — сериализуемое описание, выполняет компонент Toast. */
export type ToastAction = { label: string; kind: 'restoreRoom'; peerId: number };
export interface Toast {
  id: number;
  text: string;
  action?: ToastAction;
}

function loadWallpaper(): WallpaperId {
  try {
    const v = localStorage.getItem(WP_KEY);
    return WALLPAPERS.some((w) => w.id === v) ? (v as WallpaperId) : 'feathers';
  } catch {
    return 'feathers';
  }
}

function load(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    theme: load(),
    wallpaper: loadWallpaper(),
    toast: null as Toast | null,
    /** id чата, для которого открыт диалог «Удалить чат?» */
    confirmDeleteRoom: null as number | null,
  },
  reducers: {
    showToast: {
      reducer(state, action: PayloadAction<{ text: string; action?: ToastAction }>) {
        state.toast = { id: Date.now(), ...action.payload };
      },
      prepare(text: string, toastAction?: ToastAction) {
        return { payload: { text, action: toastAction } };
      },
    },
    askDeleteRoom(state, action: PayloadAction<number | null>) {
      state.confirmDeleteRoom = action.payload;
    },
    hideToast(state, action: PayloadAction<number>) {
      if (state.toast?.id === action.payload) state.toast = null;
    },
    setWallpaper(state, action: PayloadAction<WallpaperId>) {
      state.wallpaper = action.payload;
      try {
        localStorage.setItem(WP_KEY, action.payload);
      } catch {
        /* приватный режим */
      }
    },
    setTheme(state, action: PayloadAction<ThemePref>) {
      state.theme = action.payload;
      try {
        if (action.payload === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, action.payload);
      } catch {
        /* приватный режим */
      }
    },
  },
});

export const { setTheme, setWallpaper, showToast, hideToast, askDeleteRoom } = uiSlice.actions;
export default uiSlice.reducer;
