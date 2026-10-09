import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

// В dev-режиме API, медиа и WebSocket проксируются на бэкенд, чтобы cookie
// работали как same-origin. Для работы с боевым сервером без логина можно
// задать DEV_COOKIE (строка Cookie из браузера) в .env.local — прокси
// подставит её сам, а заодно X-CSRFToken и Referer для Django CSRF.
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = (env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const devCookie = env.DEV_COOKIE || '';
  const csrf = /(?:^|;\s*)csrftoken=([^;]+)/.exec(devCookie)?.[1];

  const proxy = (ws = false): ProxyOptions => ({
    target: ws ? backend.replace(/^http/, 'ws') : backend,
    ws,
    changeOrigin: true,
    secure: true,
    configure: (p) => {
      if (!devCookie) return;
      const inject = (req: { setHeader: (k: string, v: string) => void }) => {
        req.setHeader('cookie', devCookie);
        req.setHeader('origin', backend);
        req.setHeader('referer', backend + '/');
        // Всегда токен из DEV_COOKIE: у браузера на dev-хосте может быть своя кука
        // csrftoken (например, от другого Django на том же хосте — куки не делятся
        // по портам), и тогда заголовок не совпал бы с подставленной кукой.
        if (csrf) req.setHeader('x-csrftoken', csrf);
      };
      p.on('proxyReq', (req) => inject(req));
      p.on('proxyReqWs', (req) => inject(req));
      // сессией управляет DEV_COOKIE — куки бэкенда в браузер не пропускаем
      p.on('proxyRes', (res) => {
        delete res.headers['set-cookie'];
      });
    },
  });

  return {
    // Статику отдаёт Django с /assets/chat_legacy/ — от этого пути строятся ссылки на чанки и ассеты
    base: command === 'build' ? env.VITE_ASSETS_BASE || '/assets/chat_legacy/' : '/',
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      manifest: true,
      cssCodeSplit: false,
      rollupOptions: {
        // точка входа без index.html: её подключает шаблон Django
        input: 'src/main.tsx',
        output: {
          // входные файлы — со статическими именами (прописаны в шаблоне),
          // чанки и ассеты — с хэшем, чтобы не залипали в кэше
          entryFileNames: 'chat.js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: (info) =>
            info.names?.some((n) => n.endsWith('.css')) ? 'chat.css' : 'assets/[name]-[hash][extname]',
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined;
            if (/node_modules\/(react|react-dom|scheduler|react-router)\//.test(id)) return 'react';
            return 'vendor';
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': proxy(),
        '/media': proxy(),
        '/ws': proxy(true),
      },
    },
  };
});
