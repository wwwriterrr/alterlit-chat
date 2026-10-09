import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { chatApi } from '../api/chatApi';
import { errorText } from '../api/http';
import type { Message, Room } from '../api/types';
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
}

const initialState: RoomsState = {
  list: [],
  status: 'idle',
  error: null,
  typingUntil: {},
  peerReadUpTo: {},
  hiding: [],
};

export const fetchRooms = createAsyncThunk('rooms/fetch', async (_: void, { dispatch, rejectWithValue }) => {
  try {
    const rooms = await chatApi.rooms();
    const profiles = rooms.flatMap((r) => r.membersInfo ?? []);
    if (profiles.length) dispatch(learnProfiles(profiles));
    return rooms;
  } catch (e) {
    return rejectWithValue(errorText(e, 'Не удалось загрузить диалоги.'));
  }
});

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
      s.list = a.payload.filter((r) => !s.hiding.includes(r.id));
      sortRooms(s.list);
      s.status = 'ready';
      s.error = null;
    });
    b.addCase(fetchRooms.rejected, (s, a) => {
      if (s.status !== 'ready') s.status = 'error';
      s.error = (a.payload as string) ?? null;
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
