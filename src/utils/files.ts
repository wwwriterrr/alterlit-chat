import type { ChatFile, FileCategory } from '../api/types';

// Зеркало PostFiles и api/chat/validation.py — проверяем до отправки,
// чтобы не грузить 300 МБ ради ответа 400.
const MB = 1024 * 1024;

const TYPES: Record<FileCategory, string[]> = {
  image: ['image/gif', 'image/png', 'image/jpeg'],
  audio: ['audio/mpeg', 'audio/x-wav', 'audio/wav', 'video/ogg'],
  video: ['video/mp4'],
  other: [
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  ],
};

const EXT_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/x-wav', '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv', '.txt': 'text/plain',
};

export const LIMITS: Record<FileCategory, { count: number; size: number }> = {
  image: { count: 3, size: 26 * MB },
  audio: { count: 1, size: 30 * MB },
  video: { count: 1, size: 300 * MB },
  other: { count: 3, size: 26 * MB },
};

const COUNT_TEXT: Record<FileCategory, string> = {
  image: 'Можно прикрепить не больше 3 изображений',
  audio: 'Можно прикрепить только 1 аудиофайл',
  video: 'Можно прикрепить только 1 видео',
  other: 'Можно прикрепить не больше 3 документов',
};

export const ACCEPT = [...Object.values(TYPES).flat(), ...Object.keys(EXT_MAP)].join(',');

function extOf(name: string) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

export function mimeOf(file: File) {
  const t = (file.type || '').toLowerCase();
  if (t && t !== 'application/octet-stream') return t;
  return EXT_MAP[extOf(file.name)] ?? '';
}

export function categoryOf(file: File): FileCategory | null {
  const mime = mimeOf(file);
  for (const cat of Object.keys(TYPES) as FileCategory[]) {
    if (TYPES[cat].includes(mime)) return cat;
  }
  return null;
}

export interface Attachment {
  key: string;
  file: File;
  category: FileCategory;
  previewUrl: string | null;
}

let seq = 0;

/** Добавляет файлы к уже выбранным; возвращает принятые и ошибки. */
export function addAttachments(current: Attachment[], incoming: File[]) {
  const counts: Record<FileCategory, number> = { image: 0, audio: 0, video: 0, other: 0 };
  current.forEach((a) => (counts[a.category] += 1));
  const accepted: Attachment[] = [];
  const errors: string[] = [];

  for (const file of incoming) {
    const category = categoryOf(file);
    if (!category) {
      errors.push(`«${file.name}»: такой формат не поддерживается`);
      continue;
    }
    if (counts[category] >= LIMITS[category].count) {
      if (!errors.includes(COUNT_TEXT[category])) errors.push(COUNT_TEXT[category]);
      continue;
    }
    if (file.size > LIMITS[category].size) {
      errors.push(`«${file.name}» больше ${LIMITS[category].size / MB} МБ`);
      continue;
    }
    counts[category] += 1;
    accepted.push({
      key: `a${++seq}`,
      file,
      category,
      previewUrl: category === 'image' || category === 'video' ? URL.createObjectURL(file) : null,
    });
  }
  return { accepted, errors };
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0).replace('.', ',')} МБ`;
}

export function fileExt(nameOrUrl: string) {
  return extOf(nameOrUrl.split('?')[0]).replace('.', '').toUpperCase() || 'ФАЙЛ';
}

/** descr на проде — JSON вида {"name": "исходное имя.jpg", "type": "msg_attach"}. */
export function fileName(f: ChatFile) {
  if (f.descr) {
    try {
      const parsed = JSON.parse(f.descr) as { name?: unknown };
      if (typeof parsed?.name === 'string' && parsed.name) return parsed.name;
    } catch {
      return f.descr;
    }
  }
  const base = f.url.split('?')[0].split('/').pop() || 'файл';
  return decodeURIComponent(base);
}

/** type бывает и категорией (по контракту), и MIME (как на проде). */
export function fileCategory(f: { type: string | null; url?: string }): FileCategory {
  const t = (f.type || '').toLowerCase();
  if (t === 'image' || t === 'audio' || t === 'video' || t === 'other') return t;
  for (const cat of Object.keys(TYPES) as FileCategory[]) {
    if (TYPES[cat].includes(t)) return cat;
  }
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  const byExt = f.url ? EXT_MAP[extOf(f.url.split('?')[0])] : undefined;
  return byExt ? (categoryOf(new File([], 'x', { type: byExt })) ?? 'other') : 'other';
}

export function attachmentSummary(files: { type: string | null; url?: string }[]) {
  if (!files.length) return '';
  const t = fileCategory(files[0]);
  if (files.length > 1) return files.length < 5 ? `${files.length} вложения` : `${files.length} вложений`;
  if (t === 'image') return 'Фотография';
  if (t === 'video') return 'Видео';
  if (t === 'audio') return 'Аудио';
  return 'Документ';
}
