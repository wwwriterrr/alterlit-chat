import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const IconSend = (p: P) => (
  <svg {...base} {...p}><path d="M4.5 12 3 4.5l18 7.5-18 7.5L4.5 12Zm0 0H12" /></svg>
);
export const IconClip = (p: P) => (
  <svg {...base} {...p}><path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5" /></svg>
);
export const IconBack = (p: P) => (
  <svg {...base} {...p}><path d="M15 5 8 12l7 7" /></svg>
);
export const IconMenu = (p: P) => (
  <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconSearch = (p: P) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
);
export const IconClose = (p: P) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconDown = (p: P) => (
  <svg {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>
);
export const IconChevronLeft = IconBack;
export const IconChevronRight = (p: P) => (
  <svg {...base} {...p}><path d="m9 5 7 7-7 7" /></svg>
);
export const IconFile = (p: P) => (
  <svg {...base} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></svg>
);
export const IconMusic = (p: P) => (
  <svg {...base} {...p}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>
);
export const IconDownload = (p: P) => (
  <svg {...base} {...p}><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" /></svg>
);
export const IconRetry = (p: P) => (
  <svg {...base} {...p}><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.7M4 4v4.7h4.7" /></svg>
);
export const IconSun = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const IconMoon = (p: P) => (
  <svg {...base} {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></svg>
);
export const IconLogout = (p: P) => (
  <svg {...base} {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" /></svg>
);
export const IconQuill = (p: P) => (
  <svg {...base} {...p}><path d="M20 4c-7 0-12 5-13.5 12.5L5 20" /><path d="M20 4c0 6-4 10.5-10.5 11.5" /><path d="M9 11h5" /></svg>
);

/** Галочки статуса: одна — доставлено на сервер, две — прочитано. */
export const Checks = ({ read, ...p }: P & { read: boolean }) => (
  <svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="m1.5 6.5 3.2 3.2L11 3" />
    {read && <path d="m8.5 9.2.5.5L15.5 3" />}
  </svg>
);
export const Clock = (p: P) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" aria-hidden {...p}>
    <circle cx="6" cy="6" r="4.8" /><path d="M6 3.4V6l1.8 1.2" />
  </svg>
);
export const IconEdit = (p: P) => (
  <svg {...base} {...p}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>
);
export const IconTrash = (p: P) => (
  <svg {...base} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
);
export const IconCopy = (p: P) => (
  <svg {...base} {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
);
export const IconCheck = (p: P) => (
  <svg {...base} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IconMore = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="5.5" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none" /></svg>
);
export const IconUser = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6" /></svg>
);
