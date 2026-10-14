# Вторая галочка после перезагрузки.
#
# Сейчас «прочитано» фронт узнаёт только из живого события read_message, и после перезагрузки
# вся история снова с одной галочкой. Теперь у каждой комнаты в /api/v1/chat/rooms/
# (и в ответе POST rooms/dialog/<id>/) — новое поле:
#
#   "peer_read_up_to": 1234 | null
#       id моего последнего сообщения в комнате, которое прочитал собеседник; null — ни одного.
#
# Почему хватает одного числа: mark_room_read отмечает прочитанной всю комнату разом, так что
# прочитаны все мои сообщения до какого-то момента. Фронт ставит две галочки всем моим
# сообщениям с id <= peer_read_up_to, а дальше двигает границу по read_message.
#
# Почему «есть в is_read кто-то, кроме меня», а не просто «is_read не пуст»: по соглашению
# legacy отправителя в is_read нет, но новый мессенджер какое-то время добавлял туда автора
# (message.is_read.add(request.user) при отправке) — такие сообщения иначе выглядели бы
# прочитанными сразу. В групповых комнатах это «прочитал хотя бы один», как в Telegram.


# ── 1. api/chat_legacy/views.py — rooms_for() ───────────────────────────────
from django.db.models import Exists, OuterRef, Subquery, IntegerField

from blog.models import Message


def rooms_for(user):
    # ...last, unread — как сейчас...

    # мои сообщения комнаты, которые прочитал кто-то, кроме меня; берём самое новое
    read_by_peer = (Message.is_read.through.objects
                    .filter(message_id=OuterRef('pk'))
                    .exclude(user_id=user.id))
    peer_read = (Message.objects
                 .filter(room=OuterRef('pk'), sender=user)
                 .filter(Exists(read_by_peer))
                 .order_by('-id')
                 .values('id')[:1])

    return (Room.objects  # noqa: F821
            # ...filter/exclude как сейчас...
            .annotate(
                # ...unread_count, last_message_date, last_message_content — как сейчас...
                peer_read_up_to=Subquery(peer_read, output_field=IntegerField()),
            )
            # ...prefetch_related как сейчас...
            )


# ── 2. api/chat_legacy/serializers.py — RoomSerializer ───────────────────────
from rest_framework import serializers


class RoomSerializer(serializers.ModelSerializer):
    # ...members, unread_count, last_message_content, last_message_date — как сейчас...
    peer_read_up_to = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Room  # noqa: F821
        fields = ['id', 'title', 'members', 'date_created',
                  'last_message_content', 'last_message_date', 'unread_count',
                  'peer_read_up_to']
        read_only_fields = fields


# Индексы: подзапрос идёт по (room_id, sender_id) у Message и по message_id в таблице
# is_read (у M2M-таблицы индекс по message_id есть по умолчанию). Если список комнат
# станет заметно медленнее — составной индекс Message(room, sender, id).
