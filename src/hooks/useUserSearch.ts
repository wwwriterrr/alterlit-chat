import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { chatApi } from '../api/chatApi';
import { errorText } from '../api/http';
import type { UserSearchResult } from '../api/types';

export const SEARCH_MIN_LENGTH = 2;
const DEBOUNCE_MS = 300;

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Поиск собеседника с задержкой ввода и подгрузкой страниц по offset.
 * Устаревший запрос отменяется — ответ на «Ал» не перезапишет результаты «Але».
 */
export function useUserSearch(query: string) {
  const q = query.trim();
  const [items, setItems] = useState<UserSearchResult[]>([]);
  const [more, setMore] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    abortRef.current?.abort();
    setItems([]);
    setMore(false);
    setError(null);
    setLoadingMore(false);
    if (q.length < SEARCH_MIN_LENGTH) {
      setStatus('idle');
      return;
    }
    setStatus('loading');
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(async () => {
      try {
        const page = await chatApi.searchUsers(q, 0, controller.signal);
        setItems(page.objects);
        setMore(page.more);
        setStatus('ready');
      } catch (e) {
        if (axios.isCancel(e)) return;
        setError(errorText(e, 'Не удалось выполнить поиск.'));
        setStatus('error');
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q, attempt]);

  const loadMore = useCallback(async () => {
    if (!more || loadingMore || status !== 'ready') return;
    const controller = abortRef.current;
    setLoadingMore(true);
    try {
      const page = await chatApi.searchUsers(q, items.length, controller?.signal);
      setItems((prev) => {
        const seen = new Set(prev.map((u) => u.id));
        return [...prev, ...page.objects.filter((u) => !seen.has(u.id))];
      });
      setMore(page.more);
    } catch (e) {
      if (!axios.isCancel(e)) setMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [more, loadingMore, status, q, items.length]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { q, items, more, status, loadingMore, error, loadMore, retry };
}
