import { useState, type FormEvent } from 'react';
import { login } from '../store/authSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import s from './LoginScreen.module.css';

export default function LoginScreen() {
  const dispatch = useAppDispatch();
  const { loginPending, loginError } = useAppSelector((st) => st.auth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    dispatch(login({ username: username.trim(), password }));
  };

  return (
    <main className={`${s.root} chat-wallpaper`}>
      <form className={s.card} onSubmit={submit} noValidate>
        <div className={s.logo} aria-hidden>
          <svg viewBox="0 0 32 32" width="56" height="56">
            <rect width="32" height="32" rx="16" fill="var(--forest)" />
            <path d="M9 11c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v7c0 1.1-.9 2-2 2h-6.5L10.5 23v-3H11a2 2 0 0 1-2-2z" fill="var(--amber)" />
          </svg>
        </div>
        <h1 className={s.title}>Сообщения Alterlit</h1>
        <p className={s.lead}>Войдите с логином и паролем от alterlit.ru</p>

        <label className={s.field}>
          <span className={s.label}>Имя пользователя</span>
          <input
            className={s.input}
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className={s.field}>
          <span className={s.label}>Пароль</span>
          <input
            className={s.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {loginError && (
          <p className={s.error} role="alert">
            {loginError}
          </p>
        )}

        <button className={s.submit} disabled={loginPending || !username.trim() || !password}>
          {loginPending ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
