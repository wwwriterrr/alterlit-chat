import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import type { Message } from '../api/types';
import { useAppSelector } from '../store/hooks';
import { Navigate, useParams } from 'react-router';
import { useRoomSocket } from '../hooks/useRoomSocket';
import { addAttachments, type Attachment } from '../utils/files';
import ChatHeader from './ChatHeader';
import Composer from './Composer';
import Lightbox, { type LightboxState } from './Lightbox';
import MessageList from './MessageList';
import s from './ChatView.module.css';

export default function ChatView() {
  const { roomId: param } = useParams();
  const roomId = Number(param);
  if (!Number.isInteger(roomId) || roomId <= 0) return <Navigate to="/" replace />;
  // key сбрасывает состояние (вложения, прокрутку) при переходе в другой диалог
  return <Room key={roomId} roomId={roomId} />;
}

function Room({ roomId }: { roomId: number }) {
  const { status, sendTyping } = useRoomSocket(roomId);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  // берём актуальную версию из стора: если сообщение удалят или изменят — режим закроется/обновится
  const editing = useAppSelector((st) =>
    editingId === null ? null : (st.messages.byRoom[roomId]?.items.find((m) => m.id === editingId) ?? null),
  );
  const startEdit = useCallback((m: Message) => setEditingId(m.id), []);
  const endEdit = useCallback(() => setEditingId(null), []);
  useEffect(() => {
    if (editingId !== null && !editing) setEditingId(null);
  }, [editingId, editing]);
  const dragDepth = useRef(0);
  const scrollToBottomRef = useRef<() => void>(() => {});

  const addFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    setAttachments((current) => {
      const { accepted, errors } = addAttachments(current, files);
      setFileErrors(errors);
      return [...current, ...accepted];
    });
  }, []);

  const removeAttachment = useCallback((key: string) => {
    setAttachments((current) => {
      const target = current.find((a) => a.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((a) => a.key !== key);
    });
    setFileErrors([]);
  }, []);

  // превью отправленных вложений освобождает discardMessage/браузер; здесь — только неотправленные
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  useEffect(
    () => () => attachmentsRef.current.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl)),
    [],
  );

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  return (
    <div
      className={s.root}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <ChatHeader roomId={roomId} socketStatus={status} />
      <MessageList roomId={roomId} onOpenImage={setLightbox} scrollToBottomRef={scrollToBottomRef} onEdit={startEdit} />
      <Composer
        roomId={roomId}
        attachments={attachments}
        fileErrors={fileErrors}
        onAddFiles={addFiles}
        onRemoveAttachment={removeAttachment}
        onDismissErrors={() => setFileErrors([])}
        onSent={() => {
          setAttachments([]);
          setFileErrors([]);
          scrollToBottomRef.current();
        }}
        sendTyping={sendTyping}
        editing={editing}
        onEditStart={startEdit}
        onEditEnd={endEdit}
      />
      {dragging && (
        <div className={s.drop} aria-hidden>
          <div className={s.dropInner}>
            <span className={s.dropTitle}>Отпустите, чтобы прикрепить</span>
            <span className={s.dropHint}>до 3 фото или документов, 1 видео или 1 аудио</span>
          </div>
        </div>
      )}
      {lightbox && <Lightbox state={lightbox} onChange={setLightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
