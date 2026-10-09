import axios, { AxiosError } from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1/chat';

let csrfFallback: string | null = null;

export function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getCsrfToken(): string | null {
  return readCookie('csrftoken') ?? csrfFallback;
}

export function setCsrfFallback(token: string) {
  csrfFallback = token;
}

export const http = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

http.interceptors.request.use((config) => {
  const method = (config.method || 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = getCsrfToken();
    if (token) config.headers.set('X-CSRFToken', token);
  }
  return config;
});

type Unauthorized = () => void;
let onUnauthorized: Unauthorized = () => {};
export function setUnauthorizedHandler(fn: Unauthorized) {
  onUnauthorized = fn;
}

http.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    if (error.response?.status === 401) onUnauthorized();
    return Promise.reject(error);
  },
);

/** Достаёт человекочитаемый текст из ответа DRF ({detail} или {field: [..]}). */
export function errorText(error: unknown, fallback = 'Что-то пошло не так. Попробуйте ещё раз.'): string {
  if (axios.isCancel(error)) return 'Отправка отменена';
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Нет связи с сервером. Проверьте подключение к интернету.';
    const data = error.response.data as unknown;
    if (data && typeof data === 'object') {
      const parts: string[] = [];
      for (const value of Object.values(data as Record<string, unknown>)) {
        if (typeof value === 'string') parts.push(value);
        else if (Array.isArray(value)) parts.push(...value.filter((v): v is string => typeof v === 'string'));
      }
      if (parts.length) return parts.join(' ');
    }
    if (error.response.status === 403) return 'Нет доступа к этому диалогу.';
    if (error.response.status === 404) return 'Диалог не найден.';
    if (error.response.status === 413) return 'Файл слишком большой для сервера.';
  }
  return fallback;
}
