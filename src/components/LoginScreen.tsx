import { useAppSelector } from '../store/hooks';
import { loginUrl } from '../utils/people';
import s from './LoginScreen.module.css';

/** Чат открывается только с сессией сайта — входить нужно на alterlit.ru. */
export default function LoginScreen() {
  const expired = useAppSelector((st) => st.auth.expired);

  return (
    <main className={`${s.root} chat-wallpaper`}>
      <div className={s.card}>
        <div className={s.logo} aria-hidden>
          <svg viewBox="0 0 32 32" width="56" height="56">
            <rect width="32" height="32" rx="16" fill="var(--forest)" />
            <path d="M9 11c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v7c0 1.1-.9 2-2 2h-6.5L10.5 23v-3H11a2 2 0 0 1-2-2z" fill="var(--amber)" />
          </svg>
        </div>
        <h1 className={s.title}>{expired ? 'Сессия закончилась' : 'Необходима авторизация'}</h1>
        <p className={s.lead}>
          {expired
            ? 'Войдите на alterlit.ru снова, чтобы продолжить переписку.'
            : 'Сообщения доступны после входа на alterlit.ru.'}
        </p>
        <a className={s.submit} href={loginUrl()}>
          Перейти на alterlit.ru
        </a>
      </div>
    </main>
  );
}
