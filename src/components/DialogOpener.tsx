import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAppDispatch } from '../store/hooks';
import { openDialog } from '../store/roomsSlice';
import s from './EmptyChat.module.css';

/** /dialog/<peer_id> — точка входа с сайта: кнопка «Написать» в профиле ведёт сюда. */
export default function DialogOpener() {
  const { peerId } = useParams();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = Number(peerId);
    if (!Number.isInteger(id) || id <= 0) {
      setError('В ссылке неверный номер пользователя.');
      return;
    }
    let cancelled = false;
    dispatch(openDialog(id)).then((res) => {
      if (cancelled) return;
      if (openDialog.fulfilled.match(res)) navigate(`/room/${res.payload.id}`, { replace: true });
      else setError((res.payload as string) ?? 'Не удалось открыть диалог.');
    });
    return () => {
      cancelled = true;
    };
  }, [peerId, dispatch, navigate]);

  return (
    <div className={s.root}>
      <div className={s.chip} role={error ? 'alert' : 'status'}>
        {error ?? 'Открываем диалог…'}
        {error && (
          <Link to="/" style={{ color: 'inherit', fontWeight: 600 }}>
            К диалогам
          </Link>
        )}
      </div>
    </div>
  );
}
