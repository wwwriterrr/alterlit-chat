import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import type { Message } from '../api/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { editMessage, sendMessage } from '../store/messagesSlice';
import { ACCEPT, attachmentSummary, formatSize, fileExt, type Attachment } from '../utils/files';
import { composeContent, htmlToText } from '../utils/html';
import { IconCheck, IconClip, IconClose, IconEdit, IconFile, IconMusic, IconSend } from './Icons';
import s from './Composer.module.css';

// черновики переживают переключение между диалогами
const drafts = new Map<number, string>();

const TYPING_EVERY_MS = 3000;
const TYPING_IDLE_MS = 4000;

interface Props {
  roomId: number;
  attachments: Attachment[];
  fileErrors: string[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (key: string) => void;
  onDismissErrors: () => void;
  onSent: () => void;
  sendTyping: (isTyping: boolean) => void;
  /** сообщение в режиме редактирования (null — обычная отправка) */
  editing: Message | null;
  onEditStart: (message: Message) => void;
  onEditEnd: () => void;
}

export default function Composer({
  roomId,
  attachments,
  fileErrors,
  onAddFiles,
  onRemoveAttachment,
  onDismissErrors,
  onSent,
  sendTyping,
  editing,
  onEditStart,
  onEditEnd,
}: Props) {
  const dispatch = useAppDispatch();
  const [text, setText] = useState(() => drafts.get(roomId) ?? '');
  const meId = useAppSelector((st) => st.auth.user?.id);
  // для ↑ в пустом поле — редактировать последнее своё сообщение, как в Telegram
  const lastOwn = useAppSelector((st) => {
    const items = st.messages.byRoom[roomId]?.items ?? [];
    for (let i = items.length - 1; i >= 0; i--) if (items[i].sender_id === meId) return items[i];
    return undefined;
  });
  const stashedDraft = useRef<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const typingSentAt = useRef(0);
  const idleTimer = useRef<number | undefined>(undefined);
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    if (!editing) drafts.set(roomId, text);
  }, [roomId, text, editing]);

  // вход в редактирование: черновик откладываем, в поле — текст сообщения;
  // выход: черновик возвращается
  const editingId = editing?.id;
  useEffect(() => {
    if (editingId === undefined) {
      if (stashedDraft.current !== null) {
        setText(stashedDraft.current);
        stashedDraft.current = null;
      }
      return;
    }
    if (stashedDraft.current === null) stashedDraft.current = drafts.get(roomId) ?? '';
    const value = htmlToText(editing?.content ?? null);
    setText(value);
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(value.length, value.length);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  useEffect(() => {
    if (!coarse) area.current?.focus();
    return () => window.clearTimeout(idleTimer.current);
  }, [coarse]);

  // авто-высота поля
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const stopTyping = () => {
    window.clearTimeout(idleTimer.current);
    if (typingSentAt.current) {
      typingSentAt.current = 0;
      sendTyping(false);
    }
  };

  const onChange = (value: string) => {
    setText(value);
    if (editing) return;
    if (!value.trim()) return stopTyping();
    const now = Date.now();
    if (now - typingSentAt.current > TYPING_EVERY_MS) {
      typingSentAt.current = now;
      sendTyping(true);
    }
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const canSend = editing
    ? text.trim().length > 0 || editing.files.length > 0
    : text.trim().length > 0 || attachments.length > 0;

  const saveEdit = (message: Message) => {
    const trimmed = text.trim();
    if (trimmed !== htmlToText(message.content)) {
      dispatch(editMessage(message, trimmed ? composeContent(trimmed) : ''));
    }
    onEditEnd();
  };

  const send = () => {
    if (!canSend) return;
    if (editing) return saveEdit(editing);
    const trimmed = text.trim();
    dispatch(sendMessage(roomId, trimmed ? composeContent(trimmed) : '', attachments));
    setText('');
    drafts.delete(roomId);
    stopTyping();
    onSent();
    area.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && editing) {
      e.preventDefault();
      onEditEnd();
      return;
    }
    if (e.key === 'ArrowUp' && !editing && !text && !attachments.length && lastOwn) {
      e.preventDefault();
      onEditStart(lastOwn);
      return;
    }
    // на телефонах Enter — перенос строки, отправка — кнопкой
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !coarse) {
      e.preventDefault();
      send();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length && !editing) {
      e.preventDefault();
      onAddFiles(files);
    }
  };

  return (
    <div className={s.dock}>
      <div className={s.inner}>
        {fileErrors.length > 0 && (
          <div className={s.errors} role="alert">
            <ul>
              {fileErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
            <button onClick={onDismissErrors} aria-label="Скрыть">
              <IconClose width={16} height={16} />
            </button>
          </div>
        )}

        <div className={s.box}>
          {editing && (
            <div className={s.editBar}>
              <IconEdit className={s.editIcon} width={20} height={20} />
              <div className={s.editText}>
                <span className={s.editTitle}>Редактирование</span>
                <span className={s.editSnippet}>
                  {htmlToText(editing.content) || attachmentSummary(editing.files)}
                </span>
              </div>
              <button className={s.editCancel} onClick={onEditEnd} aria-label="Отменить редактирование">
                <IconClose width={18} height={18} />
              </button>
            </div>
          )}
          {!editing && attachments.length > 0 && (
            <ul className={s.tray} aria-label="Вложения">
              {attachments.map((a) => (
                <li key={a.key} className={s.att} data-kind={a.category}>
                  {a.category === 'image' && a.previewUrl ? (
                    <img src={a.previewUrl} alt="" className={s.thumb} />
                  ) : a.category === 'video' && a.previewUrl ? (
                    <video src={a.previewUrl} className={s.thumb} muted preload="metadata" />
                  ) : (
                    <span className={s.attIcon}>
                      {a.category === 'audio' ? <IconMusic width={20} height={20} /> : <IconFile width={20} height={20} />}
                    </span>
                  )}
                  {(a.category === 'audio' || a.category === 'other') && (
                    <span className={s.attText}>
                      <span className={s.attName}>{a.file.name}</span>
                      <span className={s.attSub}>
                        {formatSize(a.file.size)} · {fileExt(a.file.name)}
                      </span>
                    </span>
                  )}
                  <button
                    className={s.attRemove}
                    onClick={() => onRemoveAttachment(a.key)}
                    aria-label={`Убрать ${a.file.name}`}
                  >
                    <IconClose width={14} height={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className={s.row}>
            {editing ? (
              <span className={s.attachPlaceholder} />
            ) : (
              <button className={s.attach} onClick={() => fileInput.current?.click()} aria-label="Прикрепить файл" title="Прикрепить файл">
                <IconClip />
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                onAddFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <label className="visually-hidden" htmlFor={`composer-${roomId}`}>
              Сообщение
            </label>
            <textarea
              id={`composer-${roomId}`}
              ref={area}
              className={s.input}
              rows={1}
              placeholder={editing ? 'Текст сообщения' : attachments.length ? 'Добавьте подпись' : 'Сообщение'}
              value={text}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onBlur={() => !editing && stopTyping()}
            />
          </div>
        </div>

        <button
          className={s.send}
          onClick={send}
          disabled={!canSend}
          aria-label={editing ? 'Сохранить изменения' : 'Отправить'}
          title={editing ? 'Сохранить изменения' : 'Отправить'}
          data-mode={editing ? 'edit' : 'send'}
        >
          {editing ? <IconCheck /> : <IconSend />}
        </button>
      </div>
    </div>
  );
}
