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
import { useMediaQuery } from './hooks/useMediaQuery';
import { applyAppearance } from './utils/appearance';
import { installWallpaperAssets } from './utils/wallpaper';

export default function App() {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.auth.status);
  const theme = useAppSelector((s) => s.ui.theme);
  const wallpaper = useAppSelector((s) => s.ui.wallpaper);
  const appearance = useAppSelector((s) => s.ui.appearance);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = theme === 'dark' || (theme === 'system' && systemDark);

  useEffect(() => {
    dispatch(bootstrap());
    void installWallpaperAssets();
  }, [dispatch]);

  useEffect(() => {
    document.documentElement.dataset.wp = wallpaper;
  }, [wallpaper]);

  useEffect(() => applyAppearance(appearance, dark), [appearance, dark]);

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
