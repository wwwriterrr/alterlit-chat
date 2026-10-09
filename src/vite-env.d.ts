/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_WS_HOST?: string;
  readonly VITE_ROUTER_BASE?: string;
  readonly VITE_SERVER_UTC_OFFSET?: string;
  readonly VITE_SELF_URL?: string;
  readonly VITE_SEND_HTML?: string;
}
