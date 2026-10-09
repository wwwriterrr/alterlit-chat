import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { chatApi } from '../api/chatApi';
import { errorText } from '../api/http';
import type { Message, Room, UserSearchResult } from '../api/types';
import { dateMs } from '../utils/date';
import { attachmentSummary } from '../utils/files';
import type { AppDispatch, RootState } from './index';
import { showToast } from './uiSlice';
import { displayName, learnNames, learnProfiles } from './usersSlice';

interface RoomsState {
  list: Room[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  /** roomId → до какого момента (ms) показывать «печатает…» */
  typingUntil: Record<number, number>;
  /** roomId → id последнего своего сообщения, которое собеседник точно видел */
  peerReadUpTo: Record<number, number>;
  /** чаты, удаление которых ещё не подтвердил сервер — не возвращаем их из опроса /rooms/ */
  hiding: number[];
  /** на сервере есть ещё чаты дальше загруженных */
  hasMore: boolean;
  loadingMore: boolean;
}

export const ROOMS_PAGE = 30;

const initialState: RoomsState = {
  list: [],
  status: 'idle',
  error: null,
  typingUntil: {},
  peerReadUpTo: {},
  hiding: [],
  hasMore: false,
  loadingMore: false,
};

/**
 * Загрузка/обновление списка одним запросом: первая страница при старте,
 * а при обновлении — столько, сколько уже загружено (offset=0, limit=N).
 * Так обновляется ровно видимая часть списка, без обхода всех страниц.
 */
export const fetchRooms = createAsyncThunk<
  { items: Room[]; more: boolean },
  void,
  { state: RootState; rejectValue: string }
>('rooms/fetch', async (_, { dispatch, getState, rejectWithValue }) => {
  try {
    const limit = Math.max(ROOMS_PAGE, getState().rooms.list.length);
    const page = await chatApi.rooms(0, limit);
    const profiles = page.items.flatMap((r) => r.membersInfo ?? []);
    if (profiles.length) dispatch(learnProfiles(profiles));
    return page;
  } catch (e) {
    return rejectWithValue(errorText(e, 'Не удалось загрузить диалоги.'));
  }
});

/** Следующая страница при прокрутке списка. */
export const fetchMoreRooms = createAsyncThunk<
  { items: Room[]; more: boolean },
  void,
  { state: RootState }
>(
  'rooms/fetchMore',
  async (_, { dispatch, getState }) => {
    const page = await chatApi.rooms(getState().rooms.list.length, ROOMS_PAGE);
    const profiles = page.items.flatMap((r) => r.membersInfo ?? []);
    if (profiles.length) dispatch(learnProfiles(profiles));
    return page;
  },
  {
    condition: (_, { getState }) => {
      const { hasMore, loadingMore, status } = getState().rooms;
      return hasMore && !loadingMore && status === 'ready';
    },
  },
);

/**
 * Запасной путь для бэкенда без профилей в members: для диалогов с неизвестным
 * именем берём первую страницу сообщений и запоминаем sender_username.
 */
export const resolvePeerNames = createAsyncThunk<void, void, { state: RootState }>(
  'rooms/resolvePeerNames',
  async (_, { getState, dispatch }) => {
    const { rooms, users, auth } = getState();
    const meId = auth.user?.id;
    const unknown = rooms.list.filter((r) => {
      if (r.membersInfo || !r.last_message_date) return false;
      const peer = r.members.find((m) => m !== meId);
      return peer !== undefined && !displayName(users, peer) && !triedRooms.has(r.id);
    });
    for (const room of unknown.slice(0, 15)) {
      triedRooms.add(room.id);
      try {
        const page = await chatApi.messages(room.id);
        dispatch(learnNames(page.items.map((m) => [m.sender_id, m.sender_username] as [number, string])));
      } catch {
        /* не критично */
      }
    }
  },
);
const triedRooms = new Set<number>();

export const openDialog = createAsyncThunk('rooms/openDialog', async (peerId: number, { dispatch, rejectWithValue }) => {
  try {
    const room = await chatApi.dialogWith(peerId);
    if (room.membersInfo) dispatch(learnProfiles(room.membersInfo));
    return room;
  } catch (e) {
    return rejectWithValue(errorText(e, 'Не удалось открыть диалог.'));
  }
});

function sortRooms(list: Room[]) {
  list.sort((a, b) => {
    return dateMs(b.last_message_date ?? b.date_created) - dateMs(a.last_message_date ?? a.date_created);
  });
}

function upsertRoom(state: RoomsState, room: Room) {
  const i = state.list.findIndex((r) => r.id === room.id);
  if (i >= 0) state.list[i] = { ...state.list[i], ...room };
  else state.list.push(room);
  sortRooms(state.list);
}

const roomsSlice = createSlice({
  name: 'rooms',
  initialState,
  reducers: {
    messageArrived(state, action: PayloadAction<{ message: Message; countUnread: boolean }>) {
      const { message, countUnread } = action.payload;
      const room = state.list.find((r) => r.id === message.room);
      if (!room) return;
      if (dateMs(room.last_message_date) > dateMs(message.date)) return;
      room.last_message_date = message.date;
      room.last_message_content = message.content || attachmentSummary(message.files);
      if (countUnread) room.unread_count += 1;
      delete state.typingUntil[message.room];
      sortRooms(state.list);
    },
    /** Превью из последнего загруженного сообщения — после правки или удаления. */
    roomPreview(state, action: PayloadAction<{ roomId: number; last: Message | undefined }>) {
      const room = state.list.find((r) => r.id === action.payload.roomId);
      if (!room) return;
      const { last } = action.payload;
      room.last_message_content = last ? last.content || attachmentSummary(last.files) : null;
      if (last) room.last_message_date = last.date;
      sortRooms(state.list);
    },
    roomHidden(state, action: PayloadAction<number>) {
      state.list = state.list.filter((r) => r.id !== action.payload);
      if (!state.hiding.includes(action.payload)) state.hiding.push(action.payload);
      delete state.typingUntil[action.payload];
    },
    /** Чат удалён в другой вкладке — убрать из списка, не трогая hiding. */
    roomRemoved(state, action: PayloadAction<number>) {
      state.list = state.list.filter((r) => r.id !== action.payload);
      delete state.typingUntil[action.payload];
    },
    /** Правка последнего сообщения в незагруженном чате — превью из события. */
    roomLastEdited(state, action: PayloadAction<Message>) {
      const m = action.payload;
      const room = state.list.find((r) => r.id === m.room);
      if (room && dateMs(room.last_message_date) === dateMs(m.date)) {
        room.last_message_content = m.content || attachmentSummary(m.files);
      }
    },
    roomHideSettled(state, action: PayloadAction<{ roomId: number; restore?: Room }>) {
      state.hiding = state.hiding.filter((id) => id !== action.payload.roomId);
      if (action.payload.restore) upsertRoom(state, action.payload.restore);
    },
    roomRead(state, action: PayloadAction<number>) {
      const room = state.list.find((r) => r.id === action.payload);
      if (room) room.unread_count = 0;
    },
    typing(state, action: PayloadAction<{ roomId: number; isTyping: boolean }>) {
      if (action.payload.isTyping) state.typingUntil[action.payload.roomId] = Date.now() + 6000;
      else delete state.typingUntil[action.payload.roomId];
    },
    expireTyping(state, action: PayloadAction<number>) {
      for (const [id, until] of Object.entries(state.typingUntil)) {
        if (until <= action.payload) delete state.typingUntil[Number(id)];
      }
    },
    peerRead(state, action: PayloadAction<{ roomId: number; upTo: number }>) {
      state.peerReadUpTo[action.payload.roomId] = Math.max(
        state.peerReadUpTo[action.payload.roomId] ?? 0,
        action.payload.upTo,
      );
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchRooms.pending, (s) => {
      if (s.status !== 'ready') s.status = 'loading';
    });
    b.addCase(fetchRooms.fulfilled, (s, a) => {
      s.list = a.payload.items.filter((r) => !s.hiding.includes(r.id));
      s.hasMore = a.payload.more;
      sortRooms(s.list);
      s.status = 'ready';
      s.error = null;
    });
    b.addCase(fetchRooms.rejected, (s, a) => {
      if (s.status !== 'ready') s.status = 'error';
      s.error = (a.payload as string) ?? null;
    });
    b.addCase(fetchMoreRooms.pending, (s) => {
      s.loadingMore = true;
    });
    b.addCase(fetchMoreRooms.fulfilled, (s, a) => {
      // страницы могли сдвинуться (чат поднялся наверх) — повторы отбрасываем по id
      const known = new Set(s.list.map((r) => r.id));
      s.list.push(...a.payload.items.filter((r) => !known.has(r.id) && !s.hiding.includes(r.id)));
      s.hasMore = a.payload.more;
      s.loadingMore = false;
      sortRooms(s.list);
    });
    b.addCase(fetchMoreRooms.rejected, (s) => {
      s.loadingMore = false;
    });
    b.addCase(openDialog.fulfilled, (s, a) => upsertRoom(s, a.payload));
  },
});

export const { messageArrived, roomPreview, roomHidden, roomRemoved, roomLastEdited, roomHideSettled, roomRead, typing, expireTyping, peerRead } = roomsSlice.actions;
export default roomsSlice.reducer;

/**
 * Удаление чата у себя. Чат пропадает из списка сразу; если сервер откажет —
 * возвращается на место. После успеха — уведомление с кнопкой «Вернуть».
 */
export function deleteRoom(roomId: number) {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    const room = getState().rooms.list.find((r) => r.id === roomId);
    if (!room) return;
    const meId = getState().auth.user?.id;
    const peerId = room.members.find((m) => m !== meId);
    dispatch(roomHidden(roomId));
    try {
      await chatApi.deleteRoom(roomId);
      dispatch(roomHideSettled({ roomId }));
      dispatch(
        showToast('Чат удалён', peerId !== undefined ? { label: 'Вернуть', kind: 'restoreRoom', peerId } : undefined),
      );
    } catch (e) {
      dispatch(roomHideSettled({ roomId, restore: room }));
      dispatch(showToast(errorText(e, 'Не удалось удалить чат. Попробуйте ещё раз.')));
    }
  };
}

/** «Отметить прочитанным» из меню списка, не открывая чат. */
export function markRoomRead(roomId: number) {
  return async (dispatch: AppDispatch) => {
    dispatch(roomRead(roomId));
    try {
      await chatApi.markRead(roomId);
    } catch {
      dispatch(fetchRooms());
    }
  };
}

/**
 * Открыть чат с найденным пользователем: если диалог есть в списке — просто
 * переход, иначе POST dialog/ (создаст новый или вернёт удалённый). -> id комнаты.
 */
export function startChatWith(user: UserSearchResult) {
  return async (dispatch: AppDispatch, getState: () => RootState): Promise<number | null> => {
    dispatch(learnProfiles([user]));
    if (user.room_id && getState().rooms.list.some((r) => r.id === user.room_id)) return user.room_id;
    const res = await dispatch(openDialog(user.id));
    if (openDialog.fulfilled.match(res)) return res.payload.id;
    dispatch(showToast((res.payload as string) ?? 'Не удалось открыть диалог.'));
    return null;
  };
}
