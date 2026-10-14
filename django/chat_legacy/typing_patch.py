# «Печатает…»: фронт уже шлёт и показывает, рассылка — в ChatConsumer (stream_patch.py).
# Этот патч закрывает дыру в ChatConsumer.receive: раньше он пересылал в комнату ЛЮБОЕ
# событие клиента. Участник мог прислать через сокет, например,
#     {"message": {"type": "new_message", "message_data": {"sender_id": <собеседник>, ...}}}
# и у собеседника до перезагрузки появилось бы «сообщение» от чужого имени.
# Настоящие new_message/change_message/remove_message/read_message шлёт только сервер
# (сигналы и вьюхи), от клиента принимаем одно — typing.
#
# Событие собеседникам (в комнату и в личные потоки, как раньше):
#     {"message": {"type": "typing", "is_typing": true, "user_id": 42, "room_id": 36}}


# ── blog/consumers.py — ChatConsumer.receive целиком ────────────────────────
import json
import time

from alterlit.channels_utils import user_group

TYPING_MIN_INTERVAL = 1.0  # сек: чаще «печатает» от одного сокета не пересылаем


class ChatConsumer(AsyncWebsocketConsumer):  # noqa: F821 — класс уже есть, меняется только receive
    # connect, disconnect, chat_message, _is_member, _member_ids — без изменений

    async def receive(self, text_data):
        try:
            message = json.loads(text_data)['message']
            event_type = message['type']
        except (ValueError, KeyError, TypeError):
            return
        if event_type != 'typing':  # ping и всё остальное от клиента — не рассылаем
            return

        is_typing = message.get('is_typing') is True
        # «перестал печатать» пропускаем всегда, «печатает» — не чаще раза в секунду
        now = time.monotonic()
        if is_typing and now - getattr(self, '_typing_sent_at', 0) < TYPING_MIN_INTERVAL:
            return
        self._typing_sent_at = now if is_typing else 0

        # собираем событие заново: от клиента берём только флаг, кто и где — знает сервер
        event = {
            'type': 'typing',
            'is_typing': is_typing,
            'user_id': self.user_id,
            'room_id': int(self.room_id),
        }
        await self.channel_layer.group_send(self.room_group_name, {'type': 'chat.message', 'message': event})
        for member_id in self.member_ids:
            if member_id != self.user_id:
                await self.channel_layer.group_send(user_group(member_id), {'type': 'chat.message', 'message': event})
