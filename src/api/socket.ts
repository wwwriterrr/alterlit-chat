import type { WsServerEvent } from './types';

type Status = 'connecting' | 'open' | 'closed' | 'forbidden';

interface Options {
  onEvent: (event: WsServerEvent) => void;
  onStatus: (status: Status, reconnected: boolean) => void;
}

const PING_MS = 25_000;
const MAX_BACKOFF_MS = 15_000;

function wsUrl(path: string) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const host = import.meta.env.VITE_WS_HOST || location.host;
  return `${proto}://${host}${path}`;
}

/** WebSocket чата: переподключение с backoff, ping, обёртка { message }. */
export class ChatSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private everOpened = false;
  private stopped = false;
  private pingTimer: number | undefined;
  private retryTimer: number | undefined;

  constructor(private path: string, private opts: Options) {
    this.connect();
  }

  private connect() {
    if (this.stopped) return;
    this.opts.onStatus('connecting', false);
    const ws = new WebSocket(wsUrl(this.path));
    this.ws = ws;

    ws.onopen = () => {
      const reconnected = this.everOpened;
      this.everOpened = true;
      this.attempts = 0;
      this.opts.onStatus('open', reconnected);
      this.pingTimer = window.setInterval(() => this.send({ type: 'ping' }), PING_MS);
    };

    ws.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data as string) as { message?: WsServerEvent };
        if (payload.message && payload.message.type !== 'ping') this.opts.onEvent(payload.message);
      } catch {
        /* не-JSON игнорируем */
      }
    };

    ws.onclose = (e) => {
      window.clearInterval(this.pingTimer);
      if (this.stopped) return;
      if (e.code === 4001 || e.code === 4003 || e.code === 403) {
        this.opts.onStatus('forbidden', false);
        return;
      }
      this.opts.onStatus('closed', false);
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempts) + Math.random() * 500;
      this.attempts += 1;
      this.retryTimer = window.setTimeout(() => this.connect(), delay);
    };
  }

  send(message: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ message }));
  }

  close() {
    this.stopped = true;
    window.clearInterval(this.pingTimer);
    window.clearTimeout(this.retryTimer);
    this.ws?.close();
  }
}

/** Сокет открытой комнаты: ws/chat/<id>/ */
export const roomSocket = (roomId: number, opts: Options) => new ChatSocket(`/ws/chat/${roomId}/`, opts);

/** Личный поток пользователя: события из всех чатов — ws/chat/stream/ */
export const streamSocket = (opts: Options) => new ChatSocket('/ws/chat/stream/', opts);
