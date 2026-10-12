import { configureStore } from '@reduxjs/toolkit';
import auth from './authSlice';
import blacklist from './blacklistSlice';
import messages from './messagesSlice';
import rooms from './roomsSlice';
import ui from './uiSlice';
import users from './usersSlice';

export const store = configureStore({
  reducer: { auth, rooms, messages, users, ui, blacklist },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
