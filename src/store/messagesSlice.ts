import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { chatApi } from '../api/chatApi';
import { errorText } from '../api/http';
import type { FileCategory, Message } from '../api/types';
import { dateMs } from '../utils/date';
import type { Attachment } from '../utils/files';
import type { AppDispatch, RootState } from './index';
import { messageArrived, roomPreview } from './roomsSlice';
import { showToast } from './uiSlice';
import { learnNames } from './usersSlice';

export interface PendingFile {
  name: string;
  size: number;
  category: FileCategory;
  previewUrl: string | null;
}

export interface PendingMessage {
  localId: string;
  roomId: number;
  content: string;
  files: PendingFile[];
  createdAt: string;
  progress: number;
  status: 'sending' | 'failed';
  error?: string;
}

export interface RoomMessages {
  items: Message[];
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  next: string | null;
  loadingOlder: boolean;
  pending: PendingMessage[];
}

interface MessagesState {
  byRoom: Record<number, RoomMessages>;
}

const initialState: MessagesState = { byRoom: {} };

// File и AbortController несериализуемы — держим вне стора
const outbox = new Map<string, { files: File[]; abort: AbortController }>();

function ensure(state: MessagesState, roomId: number): RoomMessages {
  return (state.byRoom[roomId] ??= {
    items: [],
    status: 'loading',
    error: null,
    next: null,
    loadingOlder: false,
    pending: [],
  });
}

function byDate(a: Message, b: Message) {
  return dateMs(a.date) - dateMs(b.date) || a.id - b.id;
}

function upsert(list: Message[], incoming: Message[]) {
  const index = new Map(list.map((m, i) => [m.id, i]));
  for (const m of incoming) {
    const i = index.get(m.id);
    if (i === undefined) {
      index.set(m.id, list.length);
      list.push(m);
    } else list[i] = m;
  }
  list.sort(byDate);
}

function namesOf(messages: Message[]): Array<[number, string]> {
  return messages.map((m) => [m.sender_id, m.sender_username]);
}

export const fetchMessages = createAsyncThunk(
  'messages/fetch',
  async (roomId: number, { dispatch, rejectWithValue }) => {
    try {
      const page = await chatApi.messages(roomId);
      dispatch(learnNames(namesOf(page.items)));
      return page;
    } catch (e) {
      return rejectWithValue(errorText(e, 'Не удалось загрузить сообщения.'));
    }
  },
);

export const fetchOlder = createAsyncThunk<
  { items: Message[]; next: string | null },
  number,
  { state: RootState }
>(
  'messages/fetchOlder',
  async (roomId, { getState, dispatch }) => {
    const next = getState().messages.byRoom[roomId]?.next;
    const page = await chatApi.messages(roomId, next ?? undefined);
    dispatch(learnNames(namesOf(page.items)));
    return page;
  },
  {
    condition: (roomId, { getState }) => {
      const room = getState().messages.byRoom[roomId];
      return !!room?.next && !room.loadingOlder;
    },
  },
);

const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    received(state, action: PayloadAction<Message>) {
      upsert(ensure(state, action.payload.room).items, [action.payload]);
    },
    removed(state, action: PayloadAction<{ roomId: number; messageId: number }>) {
      const room = state.byRoom[action.payload.roomId];
      if (room) room.items = room.items.filter((m) => m.id !== action.payload.messageId);
    },
    pendingAdded(state, action: PayloadAction<PendingMessage>) {
      ensure(state, action.payload.roomId).pending.push(action.payload);
    },
    pendingProgress(state, action: PayloadAction<{ roomId: number; localId: string; progress: number }>) {
      const p = state.byRoom[action.payload.roomId]?.pending.find((x) => x.localId === action.payload.localId);
      if (p) p.progress = action.payload.progress;
    },
    pendingFailed(state, action: PayloadAction<{ roomId: number; localId: string; error: string }>) {
      const p = state.byRoom[action.payload.roomId]?.pending.find((x) => x.localId === action.payload.localId);
      if (p) {
        p.status = 'failed';
        p.error = action.payload.error;
      }
    },
    pendingRetrying(state, action: PayloadAction<{ roomId: number; localId: string }>) {
      const p = state.byRoom[action.payload.roomId]?.pending.find((x) => x.localId === action.payload.localId);
      if (p) {
        p.status = 'sending';
        p.progress = 0;
        p.error = undefined;
      }
    },
    pendingRemoved(state, action: PayloadAction<{ roomId: number; localId: string }>) {
      const room = state.byRoom[action.payload.roomId];
      if (room) room.pending = room.pending.filter((x) => x.localId !== action.payload.localId);
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchMessages.pending, (s, a) => {
      const room = ensure(s, a.meta.arg);
      if (!room.items.length) room.status = 'loading';
    });
    b.addCase(fetchMessages.fulfilled, (s, a) => {
      const room = ensure(s, a.meta.arg);
      // слияние, а не замена: после переподключения WS досинхронизируем пропущенное
      upsert(room.items, a.payload.items);
      if (room.status !== 'ready') room.next = a.payload.next;
      room.status = 'ready';
      room.error = null;
    });
    b.addCase(fetchMessages.rejected, (s, a) => {
      const room = ensure(s, a.meta.arg);
      if (room.status !== 'ready') {
        room.status = 'error';
        room.error = (a.payload as string) ?? 'Не удалось загрузить сообщения.';
      }
    });
    b.addCase(fetchOlder.pending, (s, a) => {
      ensure(s, a.meta.arg).loadingOlder = true;
    });
    b.addCase(fetchOlder.fulfilled, (s, a) => {
      const room = ensure(s, a.meta.arg);
      upsert(room.items, a.payload.items);
      room.next = a.payload.next;
      room.loadingOlder = false;
    });
    b.addCase(fetchOlder.rejected, (s, a) => {
      ensure(s, a.meta.arg).loadingOlder = false;
    });
  },
});

export const { received, removed, pendingAdded, pendingProgress, pendingFailed, pendingRetrying, pendingRemoved } =
  messagesSlice.actions;

let localSeq = 0;

async function deliver(dispatch: AppDispatch, roomId: number, localId: string, content: string) {
  const box = outbox.get(localId);
  if (!box) return;
  try {
    const message = await chatApi.send(roomId, content, box.files, {
      signal: box.abort.signal,
      onProgress: (progress) => dispatch(pendingProgress({ roomId, localId, progress })),
    });
    // сначала кладём настоящее сообщение, потом убираем черновик — без мигания
    dispatch(received(message));
    dispatch(messageArrived({ message, countUnread: false }));
    dispatch(pendingRemoved({ roomId, localId }));
    outbox.delete(localId);
  } catch (e) {
    if (box.abort.signal.aborted) return;
    dispatch(pendingFailed({ roomId, localId, error: errorText(e, 'Не отправлено') }));
  }
}

export function sendMessage(roomId: number, content: string, attachments: Attachment[]) {
  return (dispatch: AppDispatch) => {
    const localId = `local-${Date.now()}-${++localSeq}`;
    outbox.set(localId, { files: attachments.map((a) => a.file), abort: new AbortController() });
    dispatch(
      pendingAdded({
        localId,
        roomId,
        content,
        files: attachments.map((a) => ({
          name: a.file.name,
          size: a.file.size,
          category: a.category,
          previewUrl: a.previewUrl,
        })),
        createdAt: new Date().toISOString(),
        progress: 0,
        status: 'sending',
      }),
    );
    void deliver(dispatch, roomId, localId, content);
  };
}

export function retryMessage(p: PendingMessage) {
  return (dispatch: AppDispatch) => {
    const box = outbox.get(p.localId);
    if (!box) return;
    box.abort = new AbortController();
    dispatch(pendingRetrying({ roomId: p.roomId, localId: p.localId }));
    void deliver(dispatch, p.roomId, p.localId, p.content);
  };
}

export function discardMessage(p: PendingMessage) {
  return (dispatch: AppDispatch) => {
    const box = outbox.get(p.localId);
    box?.abort.abort();
    outbox.delete(p.localId);
    p.files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    dispatch(pendingRemoved({ roomId: p.roomId, localId: p.localId }));
  };
}

/** Обновляет превью в списке диалогов по последнему загруженному сообщению. */
export function syncRoomPreview(roomId: number) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    const room = getState().messages.byRoom[roomId];
    if (room?.status !== 'ready') return;
    dispatch(roomPreview({ roomId, last: room.items[room.items.length - 1] }));
  };
}

/** Правка показывается сразу; если сервер откажет — возвращаем как было. */
export function editMessage(message: Message, content: string) {
  return async (dispatch: AppDispatch) => {
    dispatch(received({ ...message, content, date_edited: new Date().toISOString() }));
    dispatch(syncRoomPreview(message.room));
    try {
      dispatch(received(await chatApi.editMessage(message.room, message.id, content)));
    } catch (e) {
      dispatch(received(message));
      dispatch(showToast(errorText(e, 'Не удалось изменить сообщение. Попробуйте ещё раз.')));
    }
    dispatch(syncRoomPreview(message.room));
  };
}

/** Удаление тоже оптимистичное: при ошибке сообщение возвращается на место. */
export function deleteMessage(message: Message) {
  return async (dispatch: AppDispatch) => {
    dispatch(removed({ roomId: message.room, messageId: message.id }));
    dispatch(syncRoomPreview(message.room));
    try {
      await chatApi.deleteMessage(message.room, message.id);
    } catch (e) {
      dispatch(received(message));
      dispatch(syncRoomPreview(message.room));
      dispatch(showToast(errorText(e, 'Не удалось удалить сообщение. Попробуйте ещё раз.')));
    }
  };
}

export default messagesSlice.reducer;
