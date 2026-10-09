# Редактирование и удаление сообщений:
#   PATCH  /api/v1/chat/rooms/<room_pk>/messages/<pk>/   {"content": "..."}  → 200 + объект сообщения
#   DELETE /api/v1/chat/rooms/<room_pk>/messages/<pk>/                       → 204
#
# WS-события уже есть в blog/signals.py:
#   message.save()   → post_save(created=False) → change_message (после коммита)
#   message.delete() → post_delete              → remove_message
# Поэтому view только меняет/удаляет запись, рассылку делают сигналы.


# ── 1. blog/models.py — Message: отметка «изменено» ─────────────────────────
#     date_edited = models.DateTimeField(null=True, blank=True,
#                                        verbose_name="Дата редактирования")
#
# затем: python manage.py makemigrations blog && python manage.py migrate


# ── 2. api/chat_legacy/serializers.py ───────────────────────────────────────
from rest_framework import serializers


class MessageSerializer(serializers.ModelSerializer):
    # ...как сейчас, только добавить 'date_edited' в fields:
    #     fields = ['id', 'sender_id', 'sender_username', 'room', 'date',
    #               'date_edited', 'content', 'files']
    pass


class MessageUpdateSerializer(serializers.Serializer):
    """Вход PATCH: меняется только текст, вложения остаются как были."""
    content = serializers.CharField(allow_blank=True, trim_whitespace=True)

    def validate(self, attrs):
        # сообщение без текста допустимо, только если в нём есть файлы —
        # то же правило, что и при создании
        if not attrs['content'] and not self.instance.files.exists():
            raise serializers.ValidationError({
                'content': 'Сообщение не может быть пустым. '
                           'Удалите его, если оно больше не нужно.'})
        return attrs


# ── 3. api/chat_legacy/views.py ─────────────────────────────────────────────
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from blog.models import Message, PostFiles
from api.chat_legacy.serializers import MessageSerializer, MessageUpdateSerializer

# Ограничение на редактирование, как в Telegram (48 ч). None — без ограничения.
EDIT_WINDOW = None  # например: datetime.timedelta(hours=48)


def _message_qs():
    return Message.objects.select_related('sender').prefetch_related('files')


def _is_orphan(post_file):
    """
    PostFiles может быть привязан не только к сообщениям (посты, комментарии…).
    Проверяем ВСЕ обратные связи модели, а не только message_links,
    чтобы не удалить файл, который ещё где-то используется.
    """
    for rel in PostFiles._meta.related_objects:
        # rel.field — поле на стороне связанной модели (FK, M2M или O2O);
        # фильтр по нему работает и для связей со скрытым related_name='+'
        if rel.related_model._default_manager.filter(**{rel.field.name: post_file}).exists():
            return False
    return True


class RoomMessageDetail(generics.GenericAPIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, FormParser, MultiPartParser]
    serializer_class = MessageSerializer

    def get_object(self):
        # room__members=user → чужие диалоги отдают 404, как и список сообщений
        message = get_object_or_404(
            _message_qs(),
            pk=self.kwargs['pk'],
            room_id=self.kwargs['room_pk'],
            room__members=self.request.user,
        )
        if message.sender_id != self.request.user.id:
            raise PermissionDenied('Можно изменять только свои сообщения')
        return message

    def patch(self, request, *args, **kwargs):
        message = self.get_object()
        if EDIT_WINDOW and timezone.now() - message.date > EDIT_WINDOW:
            raise PermissionDenied('Сообщение уже нельзя изменить')

        in_serializer = MessageUpdateSerializer(message, data=request.data)
        in_serializer.is_valid(raise_exception=True)
        content = in_serializer.validated_data['content']

        if content != (message.content or ''):
            message.content = content
            message.date_edited = timezone.now()
            # update_fields — не перетираем is_read/files; сигнал разошлёт change_message
            message.save(update_fields=['content', 'date_edited'])
            message = _message_qs().get(pk=message.pk)

        return Response(self.get_serializer(message).data)

    def delete(self, request, *args, **kwargs):
        message = self.get_object()
        files = list(message.files.all())

        with transaction.atomic():
            message.delete()  # M2M is_read/files чистятся каскадом; сигнал → remove_message
            orphans = [f for f in files if _is_orphan(f)]
            paths = [(f.file.storage, f.file.name) for f in orphans if f.file]
            PostFiles.objects.filter(pk__in=[f.pk for f in orphans]).delete()
            # сами файлы с диска — только после успешного коммита
            transaction.on_commit(
                lambda: [storage.delete(name) for storage, name in paths])

        return Response(status=status.HTTP_204_NO_CONTENT)


# ── 4. api/chat_legacy/urls.py — рядом с маршрутом списка сообщений ─────────
#     path('rooms/<int:room_pk>/messages/<int:pk>/',
#          views.RoomMessageDetail.as_view(), name='api-room-message'),


# ── 5. blog/signals.py — remove_message тоже после коммита ──────────────────
# Сейчас message_deleted шлёт событие сразу, внутри транзакции: если она
# откатится, клиенты уже уберут сообщение. Стоит обернуть так же, как post_save:
#
# @receiver(post_delete, sender=Message)
# def message_deleted(sender, instance, **kwargs):
#     room_id, message_id = instance.room_id, instance.id
#     transaction.on_commit(lambda: send_message_to_channel(f'chat_{room_id}', {
#         'type': CHANNELS_MESSAGE_TYPES['remove_message'],
#         'message_id': message_id,
#         'room_id': room_id,
#     }))
