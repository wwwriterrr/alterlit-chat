import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router';
import App from './App';
import { setUnauthorizedHandler } from './api/http';
import { store } from './store';
import { verifySession } from './store/authSlice';
import './styles/global.css';

setUnauthorizedHandler(() => store.dispatch(verifySession()));

const rootEl = document.getElementById('root')!;
// URL страницы чата задаёт шаблон Django (data-base), а не путь к статике
const routerBase = (rootEl.dataset.base || import.meta.env.VITE_ROUTER_BASE || '/').replace(/\/$/, '');

createRoot(rootEl).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter basename={routerBase}>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
