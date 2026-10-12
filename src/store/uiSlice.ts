import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { loadAppearance, saveAppearance, type Appearance } from '../utils/appearance';
import { WALLPAPERS, type WallpaperId } from '../utils/wallpaper';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'alterlit-chat-theme';
const WP_KEY = 'alterlit-chat-wallpaper';

/** Действие в уведомлении — сериализуемое описание, выполняет компонент Toast. */
export type ToastAction = { label: string; kind: 'restoreRooms'; peerIds: number[] };
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
    appearance: loadAppearance(),
    wallpaper: loadWallpaper(),
    toast: null as Toast | null,
    /** id чатов, для которых открыт диалог «Удалить чат(ы)?» */
    confirmDeleteRooms: null as number[] | null,
    /** режим выбора в списке диалогов: id отмеченных; null — обычный список */
    selectedRooms: null as number[] | null,
    /** панель «Новый чат» вместо списка диалогов */
    newChatOpen: false,
    /** панель «Оформление» вместо списка диалогов */
    appearanceOpen: false,
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
    setNewChatOpen(state, action: PayloadAction<boolean>) {
      state.newChatOpen = action.payload;
      if (action.payload) {
        state.appearanceOpen = false;
        state.selectedRooms = null;
      }
    },
    setAppearanceOpen(state, action: PayloadAction<boolean>) {
      state.appearanceOpen = action.payload;
      if (action.payload) {
        state.newChatOpen = false;
        state.selectedRooms = null;
      }
    },
    setAppearance(state, action: PayloadAction<Partial<Appearance>>) {
      state.appearance = { ...state.appearance, ...action.payload };
      saveAppearance(state.appearance);
    },
    askDeleteRooms(state, action: PayloadAction<number[] | null>) {
      state.confirmDeleteRooms = action.payload?.length ? action.payload : null;
    },
    /** «Выбрать» в меню чата: включает режим выбора с этим чатом. */
    startSelecting(state, action: PayloadAction<number>) {
      state.selectedRooms = [action.payload];
    },
    /** Отметить/снять чат; сняли последний — режим выбора выключается. */
    toggleSelected(state, action: PayloadAction<number>) {
      const list = state.selectedRooms ?? [];
      const next = list.includes(action.payload) ? list.filter((id) => id !== action.payload) : [...list, action.payload];
      state.selectedRooms = next.length ? next : null;
    },
    stopSelecting(state) {
      state.selectedRooms = null;
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

export const {
  setTheme,
  setAppearance,
  setAppearanceOpen,
  setWallpaper,
  showToast,
  hideToast,
  askDeleteRooms,
  startSelecting,
  toggleSelected,
  stopSelecting,
  setNewChatOpen,
} = uiSlice.actions;
export default uiSlice.reducer;
