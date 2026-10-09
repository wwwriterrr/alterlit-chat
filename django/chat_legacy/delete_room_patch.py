# Удаление чата у себя (Profile.deleted_rooms) — что поменять, кроме views.py.
#
# Поведение:
#   DELETE /api/v1/chat/rooms/<room_pk>/  → 204
#     • комната добавляется в request.user.profile.deleted_rooms и пропадает из /rooms/;
#     • все сообщения комнаты становятся прочитанными для этого пользователя;
#     • история не удаляется, собеседник ничего не замечает.
#   Чат возвращается со всей историей, когда:
#     • в нём появляется новое сообщение (от кого угодно — сигнал ниже);
#     • пользователь сам открывает диалог: POST /rooms/dialog/<peer_id>/.
#
# views.py — см. django/chat_legacy/views.py (rooms_for исключает удалённые,
# delete_room, mark_room_read, get_or_create_dialog возвращает чат).


# ── 1. api/chat_legacy/urls.py ──────────────────────────────────────────────
#     path('rooms/<int:room_pk>/', views.delete_room, name='api-room-delete'),
#
# (рядом с rooms/<int:room_pk>/messages/ — порядок не важен, пути не пересекаются)


# ── 2. blog/signals.py — новое сообщение возвращает чат ─────────────────────
# ВНИМАНИЕ: полная актуальная версия сигналов — в stream_patch.py (там же рассылка
# в личные потоки). Фрагмент ниже оставлен для истории шага.
# Именно в сигнале, а не во view: тогда чат всплывёт и при сообщении,
# отправленном через старый интерфейс сайта или админку.

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from blog.models import Message, Profile


@receiver(post_save, sender=Message)
def message_saved(sender, instance, created, **kwargs):
    if created:
        # Вернуть комнату всем, кто её удалил. Одним DELETE по промежуточной
        # таблице M2M, без загрузки профилей. В той же транзакции, что и сообщение.
        Profile.deleted_rooms.through.objects.filter(room_id=instance.room_id).delete()

    group_name = f'chat_{instance.room_id}'
    event_type = (CHANNELS_MESSAGE_TYPES['new_message'] if created
                  else CHANNELS_MESSAGE_TYPES['change_message'])

    def _send():
        send_message_to_channel(group_name, {
            'type': event_type,
            'message_id': instance.id,
            'room_id': instance.room_id,
            'message_data': _serialize_message(instance),
        })
    transaction.on_commit(_send)


# ── Заметки ─────────────────────────────────────────────────────────────────
# • Если в старом чате сайта уже есть своя логика вокруг deleted_rooms
#   (скрытие/возврат), стоит проверить, что она не расходится с этой:
#   обе пишут в одну и ту же таблицу.
# • Новое сообщение в «удалённом» чате у получателя появится в списке при
#   следующем обновлении (фронт перезапрашивает /rooms/ раз в 30 с и при
#   возврате на вкладку). Мгновенно — только через общий WS (ws/mainstream/),
#   это отдельная задача.
