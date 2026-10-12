import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { usersApi } from '../api/chatApi';
import { errorText } from '../api/http';
import type { BlockState } from '../api/types';
import { peerIdOf } from '../utils/people';
import type { AppDispatch, RootState } from './index';
import { showToast } from './uiSlice';

// Чёрный список: состояние блокировки с конкретными собеседниками.
// Сам список заблокированных грузит панель «Заблокированные» — здесь только флаги.

export interface PeerBlock {
  blocked: boolean;
  blockedMe: boolean;
}

interface BlacklistState {
  byPeer: Record<number, PeerBlock>;
  /** запрос состояния или (раз)блокировки уже в пути */
  busy: Record<number, boolean>;
}

const initialState: BlacklistState = { byPeer: {}, busy: {} };

const blacklistSlice = createSlice({
  name: 'blacklist',
  initialState,
  reducers: {
    blockBusy(state, action: PayloadAction<{ peerId: number; busy: boolean }>) {
      if (action.payload.busy) state.busy[action.payload.peerId] = true;
      else delete state.busy[action.payload.peerId];
    },
    blockKnown(state, action: PayloadAction<BlockState>) {
      const { user_id, blocked, blocked_me } = action.payload;
      state.byPeer[user_id] = { blocked, blockedMe: blocked_me };
    },
    /** Полный список «кого я заблокировал»: остальным снимаем флаг, blockedMe не трогаем. */
    blacklistLoaded(state, action: PayloadAction<number[]>) {
      const ids = new Set(action.payload);
      for (const [id, peer] of Object.entries(state.byPeer)) {
        if (peer.blocked && !ids.has(Number(id))) peer.blocked = false;
      }
      ids.forEach((id) => {
        state.byPeer[id] = { blockedMe: state.byPeer[id]?.blockedMe ?? false, blocked: true };
      });
    },
    /** Панель «Заблокированные» знает только про «я заблокировал». */
    blockedByMe(state, action: PayloadAction<{ peerId: number; blocked: boolean }>) {
      const prev = state.byPeer[action.payload.peerId];
      state.byPeer[action.payload.peerId] = { blockedMe: prev?.blockedMe ?? false, blocked: action.payload.blocked };
    },
  },
});

export const { blockBusy, blockKnown, blockedByMe, blacklistLoaded } = blacklistSlice.actions;
export default blacklistSlice.reducer;

/** Узнать, есть ли блокировка с собеседником. force — перепроверить (например, после 403 на отправке). */
export function fetchBlockState(peerId: number, force = false) {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    const st = getState().blacklist;
    if (st.busy[peerId] || (!force && st.byPeer[peerId])) return;
    dispatch(blockBusy({ peerId, busy: true }));
    try {
      dispatch(blockKnown(await usersApi.blockState(peerId)));
    } catch {
      /* ручки ещё нет или сеть — пункт меню просто не покажется */
    } finally {
      dispatch(blockBusy({ peerId, busy: false }));
    }
  };
}

/** Сколько страниц чёрного списка грузить при старте: дальше — уже по запросу из чата. */
const BOOT_PAGES = 5;
const BOOT_PAGE_SIZE = 100;

/** При старте: кого я заблокировал — чтобы пометить такие чаты в списке без запроса на каждый. */
export function loadBlacklist() {
  return async (dispatch: AppDispatch) => {
    const ids: number[] = [];
    try {
      for (let page = 0; page < BOOT_PAGES; page++) {
        const res = await usersApi.blacklist(ids.length, BOOT_PAGE_SIZE);
        ids.push(...res.objects.map((u) => u.id));
        if (!res.more) {
          dispatch(blacklistLoaded(ids));
          return;
        }
      }
      // список длиннее загруженного — отмечаем известных, остальные узнаются при открытии чата
      ids.forEach((id) => dispatch(blockedByMe({ peerId: id, blocked: true })));
    } catch {
      /* без списка пометок не будет — чаты всё равно проверяются при открытии */
    }
  };
}

/** Перепроверить блокировку с собеседником диалога (после 403 на отправке). */
export function refreshRoomBlock(roomId: number) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    const room = getState().rooms.list.find((r) => r.id === roomId);
    if (room) dispatch(fetchBlockState(peerIdOf(room.members, getState().auth.user?.id), true));
  };
}

/** Заблокировать или разблокировать. -> удалось ли. */
export function setBlocked(peerId: number, blocked: boolean, opts: { quiet?: boolean } = {}) {
  return async (dispatch: AppDispatch) => {
    dispatch(blockBusy({ peerId, busy: true }));
    try {
      const state = blocked ? await usersApi.block(peerId) : await usersApi.unblock(peerId);
      dispatch(blockKnown(state));
      if (!opts.quiet) dispatch(showToast(blocked ? 'Пользователь заблокирован' : 'Пользователь разблокирован'));
      return true;
    } catch (e) {
      const fallback = blocked ? 'Не удалось заблокировать пользователя.' : 'Не удалось разблокировать пользователя.';
      dispatch(showToast(errorText(e, fallback)));
      return false;
    } finally {
      dispatch(blockBusy({ peerId, busy: false }));
    }
  };
}
