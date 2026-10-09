/** Ответ /api/v1/users/session/self/ */
export interface User {
  id: number;
  username: string;
  name?: string | null;
  avatar?: string | null;
  is_staff?: boolean;
}

export type FileCategory = 'image' | 'audio' | 'video' | 'other';

export interface ChatFile {
  id: number;
  url: string;
  type: FileCategory | string | null;
  descr: string | null;
  user: number | null;
}

export interface Message {
  id: number;
  sender_id: number;
  sender_username: string;
  room: number;
  date: string;
  /** когда сообщение редактировали; null — не редактировалось */
  date_edited?: string | null;
  content: string | null;
  files: ChatFile[];
}

/** Участник комнаты в расширенном формате RoomSerializer.members. */
export interface RoomMember {
  id: number;
  username: string;
  name?: string | null;
  avatar?: string | null;
}

/** Комната как её отдаёт бэкенд: members — id (контракт 1.0) или объекты. */
export interface RawRoom extends Omit<Room, 'members' | 'membersInfo'> {
  members: Array<number | RoomMember>;
  /** альтернатива: members остаются id, профили — отдельным полем */
  members_info?: RoomMember[];
}

export interface Room {
  id: number;
  title: string;
  /** всегда id — нормализуется в chatApi */
  members: number[];
  /** профили участников, если бэкенд их отдаёт */
  membersInfo?: RoomMember[];
  date_created: string;
  last_message_content: string | null;
  last_message_date: string | null;
  unread_count: number;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** События комнатного сокета и личного потока (в потоке room_id есть всегда). */
export type WsServerEvent =
  | { type: 'new_message'; message_id: number; room_id?: number; message_data: Message }
  | { type: 'change_message'; message_id: number; room_id?: number; message_data: Message }
  | { type: 'remove_message'; message_id: number; room_id?: number }
  | { type: 'read_message'; user_id?: number; room_id?: number }
  | { type: 'typing'; is_typing: boolean; user_id?: number; room_id?: number }
  | { type: 'room_read'; room_id: number }
  | { type: 'room_deleted'; room_id: number }
  | { type: 'room_restored'; room_id: number }
  | { type: 'ping' };
