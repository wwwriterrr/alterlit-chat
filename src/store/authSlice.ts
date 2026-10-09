import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';
import { authApi } from '../api/chatApi';
import { errorText, getCsrfToken } from '../api/http';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  status: 'checking' | 'authed' | 'guest' | 'error';
  loginPending: boolean;
  loginError: string | null;
}

const initialState: AuthState = { user: null, status: 'checking', loginPending: false, loginError: null };

function isAuthError(e: unknown) {
  // DRF + SessionAuthentication отвечает анониму 403, а не 401
  return axios.isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 403);
}

export const bootstrap = createAsyncThunk('auth/bootstrap', async () => {
  if (!getCsrfToken()) await authApi.csrf().catch(() => undefined);
  try {
    return await authApi.me();
  } catch (e) {
    if (isAuthError(e)) return null;
    throw e;
  }
});

export const login = createAsyncThunk<User, { username: string; password: string }, { rejectValue: string }>(
  'auth/login',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      if (!getCsrfToken()) await authApi.csrf();
      const user = await authApi.login(username, password);
      return await authApi.me().catch(() => user);
    } catch (e) {
      return rejectWithValue(errorText(e, 'Не удалось войти. Попробуйте ещё раз.'));
    }
  },
);

export const logout = createAsyncThunk('auth/logout', async () => {
  await authApi.logout().catch(() => undefined);
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionExpired(state) {
      state.user = null;
      state.status = 'guest';
    },
  },
  extraReducers: (b) => {
    b.addCase(bootstrap.fulfilled, (s, a) => {
      s.user = a.payload;
      s.status = a.payload ? 'authed' : 'guest';
    });
    b.addCase(bootstrap.pending, (s) => {
      s.status = 'checking';
    });
    b.addCase(bootstrap.rejected, (s) => {
      s.status = 'error';
    });
    b.addCase(login.pending, (s) => {
      s.loginPending = true;
      s.loginError = null;
    });
    b.addCase(login.fulfilled, (s, a) => {
      s.loginPending = false;
      s.user = a.payload;
      s.status = 'authed';
    });
    b.addCase(login.rejected, (s, a) => {
      s.loginPending = false;
      s.loginError = a.payload ?? 'Не удалось войти. Попробуйте ещё раз.';
    });
    b.addCase(logout.fulfilled, (s) => {
      s.user = null;
      s.status = 'guest';
    });
  },
});

export const { sessionExpired } = authSlice.actions;
export default authSlice.reducer;
