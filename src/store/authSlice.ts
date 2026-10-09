import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';
import { authApi } from '../api/chatApi';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  status: 'checking' | 'authed' | 'guest' | 'error';
  /** сессия закончилась во время работы (а не «ещё не входил») */
  expired: boolean;
}

const initialState: AuthState = { user: null, status: 'checking', expired: false };

function isAuthError(e: unknown) {
  // DRF + SessionAuthentication отвечает анониму 403, а не 401
  return axios.isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 403);
}

/**
 * Вход и выход — на сайте (страница /accounts/login/, /logout/), чат только
 * проверяет сессию. Куку csrftoken ставит view шаблона (ensure_csrf_cookie).
 */
export const bootstrap = createAsyncThunk('auth/bootstrap', async () => {
  try {
    return await authApi.me();
  } catch (e) {
    if (isAuthError(e)) return null;
    throw e;
  }
});

let verifying = false;

/**
 * API ответил 401/403. Это может быть и «нет доступа к чату», поэтому
 * переспрашиваем сессию: если её нет — показываем «войдите снова».
 */
export const verifySession = createAsyncThunk('auth/verify', async (_, { dispatch }) => {
  if (verifying) return;
  verifying = true;
  try {
    await authApi.me();
  } catch (e) {
    if (isAuthError(e)) dispatch(sessionExpired());
  } finally {
    verifying = false;
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionExpired(state) {
      state.expired = state.status === 'authed';
      state.user = null;
      state.status = 'guest';
    },
  },
  extraReducers: (b) => {
    b.addCase(bootstrap.pending, (s) => {
      s.status = 'checking';
    });
    b.addCase(bootstrap.fulfilled, (s, a) => {
      s.user = a.payload;
      s.status = a.payload ? 'authed' : 'guest';
    });
    b.addCase(bootstrap.rejected, (s) => {
      s.status = 'error';
    });
  },
});

export const { sessionExpired } = authSlice.actions;
export default authSlice.reducer;
