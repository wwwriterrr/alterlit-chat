# Чат Alterlit — фронтенд

React 19 + TypeScript + Vite + Redux Toolkit. SPA, встраивается в шаблон Django.

## Запуск

```bash
npm install
cp .env.example .env.local   # BACKEND_URL, при необходимости DEV_COOKIE
npm run dev                  # http://localhost:5173, /api /media /ws проксируются на бэкенд
npm run build                # → dist/
```

Для работы с боевым бэкендом без логина: в `.env.local` задать
`BACKEND_URL=https://alterlit.ru` и `DEV_COOKIE=csrftoken=…; alterlitsessionid=…` —
прокси сам подставит cookie, `X-CSRFToken` и `Referer`. `.env.local` в `.gitignore`.

## Сборка для Django

Содержимое `dist/` выкладывается так, чтобы оно отдавалось по `/assets/chat_legacy/`:

| Файл | Имя |
| --- | --- |
| `chat.js` | постоянное — подключается в шаблоне |
| `chat.css` | постоянное — подключается в шаблоне |
| `chunks/*.js`, `assets/*` | с хэшем, `chat.js` грузит их сам |

Шаблон — `django/chat.html`, пример маршрута — `django/urls_example.py`
(все вложенные пути `/messenger/...` отдают один шаблон; `ensure_csrf_cookie` ставит `csrftoken`).
Чат открывается по адресу `https://alterlit.ru/messenger/` — это задано атрибутом `data-base="/messenger/"` у `#root`.

Маршруты SPA (от `/messenger/`): `/` — список, `/room/<id>` — диалог, `/dialog/<peer_id>` — открыть
или создать диалог с пользователем (ссылка для кнопки «Написать» в профиле).

## Редактирование и удаление

`PATCH /rooms/<room>/messages/<id>/ {"content"}` и `DELETE` того же адреса (бэкенд — `django/chat_legacy/message_edit_delete_patch.py`).
Меню сообщения — правый клик или долгое нажатие: «Копировать текст», для своих — «Изменить» и «Удалить».
↑ в пустом поле — редактировать последнее своё сообщение, Esc — отменить. Правка и удаление
показываются сразу и откатываются, если сервер вернул ошибку; у собеседника — через `change_message`/`remove_message`.

## Удаление чата

`DELETE /rooms/<id>/` — чат попадает в `profile.deleted_rooms` и пропадает только у этого пользователя,
непрочитанное становится прочитанным. Новое сообщение в чате (сигнал `post_save`) или
`POST /rooms/dialog/<peer_id>/` возвращают его со всей историей. Бэкенд — `django/chat_legacy/views.py`
и `django/chat_legacy/delete_room_patch.py`. Во фронте: правый клик / долгое нажатие на диалоге
или «⋮» в шапке чата; после удаления — уведомление с кнопкой «Вернуть».

## Личный поток событий

`ws/chat/stream/` — группа `chat_user_<id>`, события из всех чатов пользователя:
`new_message`, `change_message`, `remove_message`, `typing`, `read_message`,
`room_read`, `room_deleted`, `room_restored` (бэкенд — `django/chat_legacy/stream_patch.py`
и `views.py`). Пока поток подключён, список диалогов не опрашивается; если поток недоступен —
запасной опрос раз в 30 с. Сообщение в чат, которого нет в списке (новый или вернувшийся
из удалённых), вызывает один перезапрос `/rooms/`. Непрочитанное — в заголовке вкладки.

## Устройство

- `src/api` — axios с CSRF, REST-эндпоинты, `RoomSocket` (переподключение, ping, обёртка `{message}`)
- `src/store` — слайсы `auth`, `rooms`, `messages` (оптимистичная отправка с прогрессом, повтор), `users` (кэш имён), `ui` (тема)
- `src/hooks/useRoomSocket.ts` — жизненный цикл открытой комнаты: GET messages → WS → mark-read
- `src/utils/files.ts` — проверка файлов по тем же лимитам, что и `PostFiles`
- `src/utils/html.ts` — безопасный рендер HTML-сообщений сайта

## Расхождения API с контрактом 1.0 (на 08.10.2026)

- `/api/v1/chat/auth/*` на проде отвечают 500; текущий пользователь берётся из `/api/v1/users/session/self/`.
- Любой несуществующий путь под `/api/v1/` отдаёт 500 вместо 404.
- Комнаты и сообщения пагинированы (`limit/offset`), сообщения новые первыми, `next` — абсолютный URL.
- `files[].type` — MIME, а не категория; `descr` — JSON `{"name": "...", "type": "msg_attach"}`.
- `content` — HTML редактора сайта (`<p>…</p>`); клиент отправляет в том же формате (`VITE_SEND_HTML`).
- Даты без часового пояса — считаются `+03:00` (`VITE_SERVER_UTC_OFFSET`).
- Сессионная cookie называется `alterlitsessionid`.
- С 08.10.2026 `/rooms/` отдаёт `members: [{id, username, name, avatar}]` (`name` = `profile.nickname` или логин).
  Фронт по-прежнему понимает и старый формат (список id) — тогда имена берутся из `sender_username`.
- До выката `ws/chat/stream/` список диалогов обновляется опросом раз в 30 с и при возврате на вкладку.
