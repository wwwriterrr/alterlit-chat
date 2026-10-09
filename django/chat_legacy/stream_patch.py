# Поток событий пользователя: ws/chat/stream/
#
# Одна группа на пользователя — chat_user_<id>. В неё попадают события из ВСЕХ
# его чатов, поэтому список диалогов обновляется мгновенно, без опроса /rooms/.
# Комнатный сокет ws/chat/<room_id>/ остаётся для открытого чата.
#
# Формат тот же, что у комнатного сокета: {"message": {"type": ..., ...}}
#
# | type            | кому                       | данные                                    |
# |-----------------|----------------------------|-------------------------------------------|
# | new_message     | всем участникам комнаты    | room_id, message_id, message_data         |
# | change_message  | всем участникам комнаты    | room_id, message_id, message_data         |
# | remove_message  | всем участникам комнаты    | room_id, message_id                       |
# | typing          | участникам, кроме автора   | room_id, user_id, is_typing               |
# | read_message    | участникам, кроме читателя | room_id, user_id  (собеседник прочитал)   |
# | room_read       | самому пользователю        | room_id  (прочитал в другой вкладке)      |
# | room_deleted    | самому пользователю        | room_id  (удалил чат в другой вкладке)    |
# | room_restored   | самому пользователю        | room_id  (вернул чат: «Написать»)         |


# ── 1. alterlit/channels_utils.py ────────────────────────────────────────────────────
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

CHANNELS_MESSAGE_TYPES = {
    # ...существующие типы без изменений...
    'new_message': 'new_message',
    'change_message': 'change_message',
    'remove_message': 'remove_message',
    'read_message': 'read_message',
    # новые
    'typing': 'typing',
    'room_read': 'room_read',
    'room_deleted': 'room_deleted',
    'room_restored': 'room_restored',
}


def send_message_to_channel(group_name, message):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        group_name, {'type': 'chat.message', 'message': message})


def user_group(user_id):
    return f'chat_user_{user_id}'


def send_to_users(user_ids, message):
    """Отправить событие в личные потоки пользователей (все их вкладки)."""
    channel_layer = get_channel_layer()
    for user_id in set(user_ids):
        async_to_sync(channel_layer.group_send)(
            user_group(user_id), {'type': 'chat.message', 'message': message})


# ── 2. blog/consumers.py ────────────────────────────────────────────────────
import json
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from blog.models import Room
from alterlit.channels_utils import user_group


class ChatStreamConsumer(AsyncWebsocketConsumer):
    """Личный поток событий чата. Только чтение: от клиента принимается лишь ping."""

    async def connect(self):
        user = self.scope.get('user')
        if user is None or user.is_anonymous:
            await self.close(code=4001)
            return
        self.group_name = user_group(user.id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            message = json.loads(text_data).get('message') or {}
        except (ValueError, AttributeError):
            return
        if message.get('type') == 'ping':
            await self.send(text_data=json.dumps({'message': {'type': 'ping'}}))

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({'message': event['message']}))


class ChatConsumer(AsyncWebsocketConsumer):
    """Комнатный сокет. Изменения: user_id ставит сервер, typing и read_message
    дублируются в личные потоки участников — «печатает…» видно в списке диалогов."""

    async def connect(self):
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.room_group_name = f'chat_{self.room_id}'

        user = self.scope.get('user')
        if user is None or user.is_anonymous or not await self._is_member(user):
            await self.close(code=4003)
            return

        self.user_id = user.id
        self.member_ids = await self._member_ids()
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            message = json.loads(text_data)['message']
            event_type = message['type']
        except (ValueError, KeyError, TypeError):
            return
        if event_type == 'ping':
            return
        # клиенту не доверяем: кто отправил и в какой комнате — знает только сервер
        message['user_id'] = self.user_id
        message['room_id'] = int(self.room_id)

        await self.channel_layer.group_send(
            self.room_group_name, {'type': 'chat.message', 'message': message})

        if event_type in ('typing', 'read_message'):
            for member_id in self.member_ids:
                if member_id != self.user_id:
                    await self.channel_layer.group_send(
                        user_group(member_id), {'type': 'chat.message', 'message': message})

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({'message': event['message']}))

    @database_sync_to_async
    def _is_member(self, user):
        return Room.objects.filter(pk=self.room_id, members=user).exists()

    @database_sync_to_async
    def _member_ids(self):
        return list(Room.objects.get(pk=self.room_id).members.values_list('id', flat=True))


# ── 3. blog/routing.py ──────────────────────────────────────────────────────
#     path('ws/chat/stream/', consumers.ChatStreamConsumer.as_asgi()),
#     path('ws/chat/<int:room_id>/', consumers.ChatConsumer.as_asgi()),
# (stream не пересекается с <int:room_id> — порядок не важен)


# ── 4. blog/signals.py ──────────────────────────────────────────────────────
from django.db import transaction
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from blog.models import Message, Profile
from alterlit.channels_utils import send_message_to_channel, send_to_users, CHANNELS_MESSAGE_TYPES


def _serialize_message(message):
    from api.chat_legacy.serializers import MessageSerializer  # избегаем цикличного импорта
    qs = (Message.objects.select_related('sender')
          .prefetch_related('files').get(pk=message.pk))
    return MessageSerializer(qs).data


def _member_ids(room_id):
    from blog.models import Room
    return list(Room.objects.get(pk=room_id).members.values_list('id', flat=True))


@receiver(post_save, sender=Message)
def message_saved(sender, instance, created, **kwargs):
    if created:
        # новое сообщение возвращает чат всем, кто его удалил
        Profile.deleted_rooms.through.objects.filter(room_id=instance.room_id).delete()

    event_type = (CHANNELS_MESSAGE_TYPES['new_message'] if created
                  else CHANNELS_MESSAGE_TYPES['change_message'])

    def _send():
        payload = {
            'type': event_type,
            'message_id': instance.id,
            'room_id': instance.room_id,
            'message_data': _serialize_message(instance),
        }
        send_message_to_channel(f'chat_{instance.room_id}', payload)
        send_to_users(_member_ids(instance.room_id), payload)
    transaction.on_commit(_send)


@receiver(post_delete, sender=Message)
def message_deleted(sender, instance, **kwargs):
    room_id, message_id = instance.room_id, instance.id

    def _send():
        payload = {
            'type': CHANNELS_MESSAGE_TYPES['remove_message'],
            'message_id': message_id,
            'room_id': room_id,
        }
        send_message_to_channel(f'chat_{room_id}', payload)
        send_to_users(_member_ids(room_id), payload)
    # после коммита: при откате транзакции клиенты не уберут живое сообщение
    transaction.on_commit(_send)


# ── 5. api/chat_legacy/views.py ─────────────────────────────────────────────
# См. django/chat_legacy/views.py: delete_room, get_or_create_dialog и mark_as_read
# шлют room_deleted / room_restored / room_read в личный поток пользователя,
# а mark_as_read — ещё и read_message собеседнику.
