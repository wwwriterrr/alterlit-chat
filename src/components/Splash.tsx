import s from './Splash.module.css';

export default function Splash({ error, onRetry }: { error?: boolean; onRetry?: () => void }) {
  return (
    <div className={`${s.root} chat-wallpaper`} role={error ? 'alert' : 'status'} aria-label={error ? undefined : 'Загрузка'}>
      {error ? (
        <div className={s.card}>
          <p className={s.title}>Сервер сообщений не отвечает</p>
          <p className={s.text}>Проверьте подключение к интернету и попробуйте ещё раз.</p>
          <button className={s.retry} onClick={onRetry}>
            Повторить
          </button>
        </div>
      ) : (
        <div className={s.mark} />
      )}
    </div>
  );
}
