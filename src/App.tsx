import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import ChatLayout from './components/ChatLayout';
import ChatView from './components/ChatView';
import DialogOpener from './components/DialogOpener';
import EmptyChat from './components/EmptyChat';
import LoginScreen from './components/LoginScreen';
import Splash from './components/Splash';
import { bootstrap } from './store/authSlice';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { installWallpaperAssets } from './utils/wallpaper';

export default function App() {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.auth.status);
  const theme = useAppSelector((s) => s.ui.theme);
  const wallpaper = useAppSelector((s) => s.ui.wallpaper);

  useEffect(() => {
    dispatch(bootstrap());
    void installWallpaperAssets();
  }, [dispatch]);

  useEffect(() => {
    document.documentElement.dataset.wp = wallpaper;
  }, [wallpaper]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  if (status === 'checking') return <Splash />;
  if (status === 'error') return <Splash error onRetry={() => dispatch(bootstrap())} />;
  if (status === 'guest') return <LoginScreen />;

  return (
    <Routes>
      <Route element={<ChatLayout />}>
        <Route index element={<EmptyChat />} />
        <Route path="room/:roomId" element={<ChatView />} />
        <Route path="dialog/:peerId" element={<DialogOpener />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
