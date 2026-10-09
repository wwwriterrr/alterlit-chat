# Новый чат: поиск собеседника + создание/переключение диалога.
#
#   GET  /api/v1/chat/users/search/?q=<строка>&offset=<n>&limit=<n>
#        → {"objects": [...], "more": bool, "offset": n}
#        offset — сколько пропустить (по умолчанию 0), limit — размер страницы (20, не больше 50);
#        следующая страница: offset + len(objects), пока more = true.
#   POST /api/v1/chat/rooms/dialog/<peer_id>/     → комната (уже есть: get_or_create_dialog)
#
# Отличия от /api/v1/session/autocomplete/users/:
#   • ищет и по псевдониму (profile.nickname), и по логину (username);
#   • не отдаёт самого пользователя, неактивных и скрытых (profile.global_hidden);
#   • не отдаёт тех, кто занёс пользователя в чёрный список (profile.blacklist);
#   • у каждого найденного — room_id существующего диалога (или null): фронт сразу
#     переключается на чат, не дёргая POST dialog/;
#   • порядок: точное совпадение → с кем уже есть диалог → начинается с запроса → остальные.
# Формат ответа совместим с автокомплитом ({objects, more}), карточка — как members в комнате.


# ── 1. api/chat_legacy/serializers.py ───────────────────────────────────────
from rest_framework import serializers


class ChatUserSearchSerializer(ChatMemberSerializer):  # noqa: F821 — уже есть в serializers.py
    """Карточка найденного пользователя + id диалога с ним, если он уже есть."""
    room_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta(ChatMemberSerializer.Meta):  # noqa: F821
        fields = ['id', 'username', 'name', 'avatar', 'room_id']
        read_only_fields = fields


# ── 2. api/chat_legacy/views.py ─────────────────────────────────────────────
from django.contrib.auth.models import User
from django.db.models import Case, IntegerField, OuterRef, Q, Subquery, Value, When
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from blog.models import Room
from api.chat_legacy.serializers import ChatUserSearchSerializer

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


# ── 3. get_or_create_dialog — проверки собеседника ──────────────────────────
# В начало функции, вместо `peer = get_object_or_404(User, id=peer_id)`:
#
#     peer = get_object_or_404(User, id=peer_id, is_active=True)
#     peer_profile = getattr(peer, 'profile', None)
#     if peer_profile and peer_profile.blacklist.filter(pk=request.user.pk).exists():
#         return Response({'detail': 'Пользователь ограничил вам личные сообщения'},
#                         status=403)
#
# Profile.is_blocked сюда НЕ добавлять: это временная блокировка входа
# (неверный пароль, подозрительная активность), а не бан — писать такому
# пользователю можно.
#
# ЧС стоит проверять и при отправке сообщения в уже существующий диалог
# (RoomMessagesList.create), иначе запрет обходится через старый чат.


# ── 4. api/chat_legacy/urls.py (к /api/v1/) ─────────────────────────────────
#     path('chat/users/search/', chat_legacy_views.search_users, name='chat_legacy_users-search'),


# ── Заметки по /api/v1/session/autocomplete/users/ ──────────────────────────
# • любой offset (даже offset=0) и limit дают 500 — пагинация сломана;
#   без них ручка отдаёт только первые 20 и more=true без способа получить дальше.
