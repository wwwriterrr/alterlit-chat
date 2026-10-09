import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message } from '../api/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { editMessage, sendMessage } from '../store/messagesSlice';
import { ACCEPT, attachmentSummary, formatSize, fileExt, type Attachment } from '../utils/files';
import { htmlToText } from '../utils/html';
import { normalizeContent, toEditorHtml } from '../utils/richtext';
import RichInput, { type RichInputHandle } from './RichInput';
import { IconCheck, IconClip, IconClose, IconEdit, IconFile, IconMusic, IconSend } from './Icons';
import s from './Composer.module.css';

// черновики (разметка редактора) переживают переключение между диалогами
const drafts = new Map<number, string>();
// VITE_SEND_HTML=false — отправлять простой текст, как в контракте
const SEND_HTML = import.meta.env.VITE_SEND_HTML !== 'false';

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
  const [empty, setEmpty] = useState(() => !drafts.get(roomId));
  const meId = useAppSelector((st) => st.auth.user?.id);
  // для ↑ в пустом поле — редактировать последнее своё сообщение, как в Telegram
  const lastOwn = useAppSelector((st) => {
    const items = st.messages.byRoom[roomId]?.items ?? [];
    for (let i = items.length - 1; i >= 0; i--) if (items[i].sender_id === meId) return items[i];
    return undefined;
  });
  const stashedDraft = useRef<string | null>(null);
  const input = useRef<RichInputHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const typingSentAt = useRef(0);
  const idleTimer = useRef<number | undefined>(undefined);
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  // черновик этого диалога
  useEffect(() => {
    input.current?.setHtml(drafts.get(roomId) ?? '');
    if (!coarse) input.current?.focus();
    return () => window.clearTimeout(idleTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // вход в редактирование: черновик откладываем, в поле — сообщение с форматированием;
  // выход: черновик возвращается
  const editingId = editing?.id;
  useEffect(() => {
    const ed = input.current;
    if (!ed) return;
    if (editingId === undefined) {
      if (stashedDraft.current !== null) {
        ed.setHtml(stashedDraft.current);
        stashedDraft.current = null;
      }
      return;
    }
    if (stashedDraft.current === null) stashedDraft.current = drafts.get(roomId) ?? '';
    ed.focus();
    ed.setHtml(toEditorHtml(editing?.content ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const stopTyping = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    if (typingSentAt.current) {
      typingSentAt.current = 0;
      sendTyping(false);
    }
  }, [sendTyping]);

  const onChange = useCallback(
    (isEmpty: boolean) => {
      setEmpty(isEmpty);
      if (editing) return;
      drafts.set(roomId, isEmpty ? '' : (input.current?.getHtml() ?? ''));
      if (isEmpty) return stopTyping();
      const now = Date.now();
      if (now - typingSentAt.current > TYPING_EVERY_MS) {
        typingSentAt.current = now;
        sendTyping(true);
      }
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(stopTyping, TYPING_IDLE_MS);
    },
    [editing, roomId, sendTyping, stopTyping],
  );

  const canSend = editing ? !empty || editing.files.length > 0 : !empty || attachments.length > 0;

  const content = () => {
    const ed = input.current;
    if (!ed) return '';
    return SEND_HTML ? ed.serialize() : ed.plainText();
  };

  const saveEdit = (message: Message) => {
    const next = content();
    const changed = SEND_HTML
      ? normalizeContent(next) !== normalizeContent(message.content)
      : next !== htmlToText(message.content);
    if (changed) dispatch(editMessage(message, next));
    onEditEnd();
  };

  const send = () => {
    if (!canSend) return;
    if (editing) return saveEdit(editing);
    dispatch(sendMessage(roomId, content(), attachments));
    input.current?.clear();
    drafts.delete(roomId);
    stopTyping();
    onSent();
    input.current?.focus();
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
            <RichInput
              id={`composer-${roomId}`}
              ref={input}
              coarse={coarse}
              placeholder={editing ? 'Текст сообщения' : attachments.length ? 'Добавьте подпись' : 'Сообщение'}
              onChange={onChange}
              onSubmit={send}
              onEscape={() => {
                if (!editing) return false;
                onEditEnd();
                return true;
              }}
              onArrowUpEmpty={() => {
                if (editing || attachments.length || !lastOwn) return false;
                onEditStart(lastOwn);
                return true;
              }}
              onPasteFiles={(files) => !editing && onAddFiles(files)}
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
