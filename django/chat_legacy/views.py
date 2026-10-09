from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Case, Count, IntegerField, OuterRef, Prefetch, Q, Subquery, Value, When
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)

from blog.models import Room, Message, PostFiles
from api.chat_legacy.serializers import (
    MessageSerializer,
    MessageCreateSerializer,
    MessageUpdateSerializer,
    RoomSerializer,
    ChatUserSearchSerializer,
)
from api.chat_legacy.validation import validate_files
from alterlit.channels_utils import (
    CHANNELS_MESSAGE_TYPES,
    send_message_to_channel,
    send_to_users,
)


# ---------- Комнаты пользователя (общий queryset) ----------
def rooms_for(user):
    """
    Диалоги пользователя с аннотациями для RoomSerializer и профилями участников.
    Удалённые пользователем чаты (profile.deleted_rooms) не попадают в выдачу.
    """
    last = Message.objects.filter(room=OuterRef('pk')).order_by('-date')

    # Count('messages', filter=~Q(messages__is_read=user)) идёт через JOIN по is_read
    # и засчитывает сообщение, если его прочитал кто-то другой. exclude() по M2M
    # строит корректный NOT IN, поэтому считаем подзапросом.
    unread = (Message.objects
              .filter(room=OuterRef('pk'))
              .exclude(is_read=user)
              .order_by()
              .values('room')
              .annotate(c=Count('pk'))
              .values('c'))

    # Profile «широкий» (settings, balance, коды сброса пароля…) —
    # тянем только то, что нужно карточке участника
    members_qs = (User.objects
                  .select_related('profile')
                  .only('id', 'username', 'profile__nickname', 'profile__avatar'))

    return (Room.objects
            .filter(members=user)
            # Profile.deleted_rooms (related_name='deleted_rooms') → обратная связь Room→Profile;
            # exclude по M2M даёт корректный NOT IN
            .exclude(deleted_rooms__user=user)
            .annotate(
                unread_count=Coalesce(Subquery(unread, output_field=IntegerField()), 0),
                last_message_date=Subquery(last.values('date')[:1]),
                last_message_content=Subquery(last.values('content')[:1]),
            )
            .prefetch_related(Prefetch('members', queryset=members_qs)))


def mark_room_read(user, room):
    """Отмечает все сообщения комнаты прочитанными пользователем. -> сколько отмечено."""
    unread = list(room.messages.exclude(is_read=user).values_list('id', flat=True))
    # bulk через through — вместо цикла INSERT на каждое сообщение;
    # ignore_conflicts — два параллельных запроса (две вкладки) не уронят друг друга
    Message.is_read.through.objects.bulk_create(
        (Message.is_read.through(message_id=mid, user_id=user.id) for mid in unread),
        ignore_conflicts=True,
    )
    return len(unread)


# ---------- Список диалогов ----------
class RoomList(generics.ListAPIView):
    serializer_class = RoomSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return rooms_for(self.request.user).order_by('-last_message_date')


# ---------- Удаление чата у себя ----------
@api_view(['DELETE'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def delete_room(request, room_pk):
    """
    Чат пропадает из списка только у текущего пользователя: история не удаляется,
    собеседник ничего не замечает. Непрочитанное становится прочитанным.
    Чат вернётся, когда в нём появится новое сообщение (см. blog/signals.py)
    или пользователь сам откроет диалог (get_or_create_dialog).
    """
    user = request.user
    room = get_object_or_404(Room, pk=room_pk, members=user)
    with transaction.atomic():
        user.profile.deleted_rooms.add(room)  # add идемпотентен
        mark_room_read(user, room)
        # другие вкладки этого пользователя уберут чат из списка
        transaction.on_commit(lambda: send_to_users([user.id], {
            'type': CHANNELS_MESSAGE_TYPES['room_deleted'],
            'room_id': room.id,
        }))
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------- Сообщения диалога: список + отправка ----------
class RoomMessagesList(generics.ListCreateAPIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = MessageSerializer

    def get_room(self):
        # members=user → чужие диалоги недоступны
        return get_object_or_404(Room, pk=self.kwargs['room_pk'],
                                 members=self.request.user)

    def get_queryset(self):
        return (Message.objects
            .filter(room=self.get_room())
            .select_related('sender')
            .prefetch_related('files')
            .order_by('-date')
        )

    def create(self, request, *args, **kwargs):
        room = self.get_room()

        in_serializer = MessageCreateSerializer(data=request.data)
        in_serializer.is_valid(raise_exception=True)

        content = in_serializer.validated_data.get('content') or ''
        validated_files = validate_files(request.FILES.getlist('files'))

        with transaction.atomic():
            # post_save этого сообщения вернёт чат всем, кто его удалил (blog/signals.py)
            message = Message.objects.create(
                sender=request.user, room=room, content=content,
            )
            for item in validated_files:
                post_file = PostFiles.objects.create(
                    user=request.user,
                    file=item['file'],
                    type=item['type'],
                )
                message.files.add(post_file)
            message.is_read.add(request.user)  # автор видит своё прочитанным

            # перечитываем в «output»-виде с полными files
            message = (Message.objects
                       .select_related('sender')
                       .prefetch_related('files')
                       .get(pk=message.pk))

        return Response(self.get_serializer(message).data,
                        status=status.HTTP_201_CREATED)


# ---------- Сообщение: редактирование и удаление ----------
# Ограничение на редактирование, как в Telegram (48 ч). None — без ограничения.
EDIT_WINDOW = None  # например: datetime.timedelta(hours=48)


def _message_qs():
    return Message.objects.select_related('sender').prefetch_related('files')


def _is_orphan(post_file):
    """
    PostFiles может быть привязан не только к сообщениям (посты, комментарии…).
    Проверяем ВСЕ обратные связи модели, чтобы не удалить файл,
    который ещё где-то используется.
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


# ---------- Поиск собеседника для нового чата ----------
SEARCH_MIN_LENGTH = 2
SEARCH_LIMIT = 20
SEARCH_MAX_LIMIT = 50
SEARCH_MAX_OFFSET = 1000  # дальше листать поиск бессмысленно — пусть уточняют запрос


def _int_param(request, name, default, minimum, maximum):
    """Целый параметр запроса с границами. -> (значение, ошибка | None)."""
    raw = request.query_params.get(name)
    if raw in (None, ''):
        return default, None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None, f'Должно быть целым числом от {minimum} до {maximum}'
    if not minimum <= value <= maximum:
        return None, f'Должно быть целым числом от {minimum} до {maximum}'
    return value, None


@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def search_users(request):
    user = request.user
    offset, offset_error = _int_param(request, 'offset', 0, 0, SEARCH_MAX_OFFSET)
    limit, limit_error = _int_param(request, 'limit', SEARCH_LIMIT, 1, SEARCH_MAX_LIMIT)
    errors = {k: [v] for k, v in (('offset', offset_error), ('limit', limit_error)) if v}
    if errors:
        return Response(errors, status=400)

    q = (request.query_params.get('q') or '').strip()[:50]
    if len(q) < SEARCH_MIN_LENGTH:
        return Response({'objects': [], 'more': False, 'offset': offset})

    # диалог текущего пользователя с кандидатом: комната, где состоят оба
    dialog = (Room.objects
              .filter(title__startswith='dialog', members=user)
              .filter(members=OuterRef('pk'))
              .values('pk')[:1])

    users = (User.objects
             .filter(is_active=True)
             .filter(Q(profile__nickname__icontains=q) | Q(username__icontains=q))
             .exclude(pk=user.pk)
             .exclude(profile__global_hidden=True)
             # Profile.blacklist (related_name='blacklist'): кандидат занёс меня в ЧС
             .exclude(profile__blacklist=user)
             .select_related('profile')
             .only('id', 'username', 'profile__nickname', 'profile__avatar')
             .annotate(room_id=Subquery(dialog, output_field=IntegerField()))
             .annotate(rank=Case(
                 When(Q(username__iexact=q) | Q(profile__nickname__iexact=q), then=Value(0)),
                 When(room_id__isnull=False, then=Value(1)),
                 When(Q(username__istartswith=q) | Q(profile__nickname__istartswith=q), then=Value(2)),
                 default=Value(3),
                 output_field=IntegerField(),
             ))
             # id в конце — стабильный порядок, иначе страницы по offset
             # могут пересекаться у пользователей с одинаковым именем
             .order_by('rank', 'profile__nickname', 'username', 'id'))

    found = list(users[offset:offset + limit + 1])  # +1 — чтобы понять, есть ли ещё
    return Response({
        'objects': ChatUserSearchSerializer(found[:limit], many=True).data,
        'more': len(found) > limit and offset + limit < SEARCH_MAX_OFFSET,
        'offset': offset,
    })


# ---------- Диалог: get_or_create (найди или создай) ----------
@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def get_or_create_dialog(request, peer_id):
    if peer_id == request.user.id:
        return Response({'detail': 'Нельзя писать самому себе'},
                        status=400)
    peer = get_object_or_404(User, id=peer_id, is_active=True)
    peer_profile = getattr(peer, 'profile', None)
    if peer_profile and peer_profile.blacklist.filter(pk=request.user.pk).exists():
        return Response({'detail': 'Пользователь ограничил вам личные сообщения'},
                        status=403)
    a, b = sorted([request.user.id, peer.id])

    with transaction.atomic():
        # unique_together('title',) у модели Room делает get_or_create атомарным
        room, created = Room.objects.get_or_create(title=f'dialog{a}|{b}')
        room.members.add(request.user, peer)  # add идемпотентен
        # пользователь сам открыл диалог («Написать» в профиле) — возвращаем удалённый чат
        profile = request.user.profile
        was_deleted = profile.deleted_rooms.filter(pk=room.pk).exists()
        if was_deleted:
            profile.deleted_rooms.remove(room)
            transaction.on_commit(lambda: send_to_users([request.user.id], {
                'type': CHANNELS_MESSAGE_TYPES['room_restored'],
                'room_id': room.id,
            }))

    # перечитываем с аннотациями и участниками — ответ такой же, как в списке
    room = rooms_for(request.user).get(pk=room.pk)
    serializer = RoomSerializer(room, context={'request': request})
    return Response(serializer.data, status=201 if created else 200)


# ---------- Отметить все сообщения прочитанными ----------
@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def mark_as_read(request, room_pk):
    user = request.user
    room = get_object_or_404(Room, pk=room_pk, members=user)
    marked = mark_room_read(user, room)
    if marked:
        member_ids = list(room.members.values_list('id', flat=True))
        # собеседнику — «прочитано» (две галочки), себе — сброс счётчика в других вкладках
        read_event = {'type': CHANNELS_MESSAGE_TYPES['read_message'], 'room_id': room.id, 'user_id': user.id}
        send_message_to_channel(f'chat_{room.id}', read_event)
        send_to_users([m for m in member_ids if m != user.id], read_event)
        send_to_users([user.id], {'type': CHANNELS_MESSAGE_TYPES['room_read'], 'room_id': room.id})
    return Response({'marked': marked})
