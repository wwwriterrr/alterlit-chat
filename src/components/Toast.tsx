import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { openDialog } from '../store/roomsSlice';
import { hideToast, type ToastAction } from '../store/uiSlice';
import s from './Toast.module.css';

export default function Toast() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const toast = useAppSelector((st) => st.ui.toast);

  useEffect(() => {
    if (!toast) return;
    // с кнопкой — дольше, чтобы успеть нажать
    const timer = window.setTimeout(() => dispatch(hideToast(toast.id)), toast.action ? 7000 : 4500);
    return () => window.clearTimeout(timer);
  }, [toast, dispatch]);

  const run = (action: ToastAction, id: number) => {
    dispatch(hideToast(id));
    if (action.kind === 'restoreRoom') {
      // get_or_create_dialog убирает чат из удалённых и отдаёт его целиком
      dispatch(openDialog(action.peerId)).then((res) => {
        if (openDialog.fulfilled.match(res)) navigate(`/room/${res.payload.id}`);
      });
    }
  };

  return (
    <div className={s.region} role="status" aria-live="polite">
      {toast && (
        <div key={toast.id} className={s.toast}>
          <span>{toast.text}</span>
          {toast.action && (
            <button className={s.action} onClick={() => run(toast.action!, toast.id)}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
