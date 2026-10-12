# Чёрный список: заблокировать пользователя, посмотреть заблокированных, разблокировать.
# Данные — существующее поле Profile.blacklist (M2M на User): в profile.blacklist
# пользователя A лежат те, кого A заблокировал. Сайт и чат видят один и тот же список.
#
#   GET    /api/v1/users/session/blacklist/?offset=0&limit=30
#          → {"objects": [карточка, …], "more": bool, "offset": n}
#            карточка — как в UserDetail: {id, username, nickname, avatar, groups, is_staff}
#   GET    /api/v1/users/session/blacklist/<user_id>/  → {"user_id", "blocked", "blocked_me"}
#   PUT    /api/v1/users/session/blacklist/<user_id>/  → заблокировать (повторно — не ошибка), тот же ответ
#   DELETE /api/v1/users/session/blacklist/<user_id>/  → разблокировать (повторно — не ошибка), тот же ответ
#
#   blocked    — я заблокировал этого пользователя;
#   blocked_me — он заблокировал меня (фронт показывает вместо поля ввода
#                «Пользователь ограничил вам личные сообщения», а не ждёт 403 на отправке).
#
# Ошибки: себя — 400; нет такого пользователя — 404 (заблокировать можно только активного,
# разблокировать — любого: аккаунт могли отключить уже после блокировки). Аноним — 403.
#
# Что даёт блокировка в чате — п. 4: ни он мне, ни я ему не можем писать в диалог,
# и он не может создать диалог (get_or_create_dialog это уже проверяет).
# Существующий диалог не удаляется и история остаётся.


# ── 1. api/user/serializers.py ──────────────────────────────────────────────
# Новый сериализатор не нужен: карточка в списке — UserDetailSerializer.


# ── 2. api/user/views.py ────────────────────────────────────────────────────
from django.contrib.auth.models import Group, User
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.user.serializers import UserDetailSerializer

BLACKLIST_LIMIT = 30
BLACKLIST_MAX_LIMIT = 100


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


def _block_state(me, peer):
    """Блокировки в обе стороны между текущим пользователем и peer."""
    peer_profile = getattr(peer, 'profile', None)  # у пользователя без профиля — RelatedObjectDoesNotExist
    return {
        'user_id': peer.pk,
        'blocked': me.profile.blacklist.filter(pk=peer.pk).exists(),
        'blocked_me': bool(peer_profile) and peer_profile.blacklist.filter(pk=me.pk).exists(),
    }


class BlacklistList(APIView):
    """GET blacklist/ — кого заблокировал текущий пользователь, постранично."""
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        offset, offset_error = _int_param(request, 'offset', 0, 0, 100_000)
        limit, limit_error = _int_param(request, 'limit', BLACKLIST_LIMIT, 1, BLACKLIST_MAX_LIMIT)
        errors = {k: [v] for k, v in (('offset', offset_error), ('limit', limit_error)) if v}
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        users = (request.user.profile.blacklist
                 .select_related('profile')
                 # Profile широкий (баланс, коды сброса пароля…) — берём только нужное
                 .only('id', 'username', 'is_staff', 'profile__nickname', 'profile__avatar')
                 .prefetch_related(Prefetch('groups', queryset=Group.objects.only('name')))
                 # id в конце — стабильный порядок для offset
                 .order_by('profile__nickname', 'username', 'id'))

        found = list(users[offset:offset + limit + 1])  # +1 — чтобы понять, есть ли ещё
        return Response({
            'objects': UserDetailSerializer(found[:limit], many=True).data,
            'more': len(found) > limit,
            'offset': offset,
        })


class BlacklistDetail(APIView):
    """GET — состояние, PUT — заблокировать, DELETE — разблокировать."""
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        peer = get_object_or_404(User, pk=pk)
        return Response(_block_state(request.user, peer))

    def put(self, request, pk):
        if pk == request.user.pk:
            return Response({'detail': 'Нельзя заблокировать самого себя'},
                            status=status.HTTP_400_BAD_REQUEST)
        peer = get_object_or_404(User, pk=pk, is_active=True)
        request.user.profile.blacklist.add(peer)  # add идемпотентен
        return Response(_block_state(request.user, peer))

    def delete(self, request, pk):
        peer = get_object_or_404(User, pk=pk)
        request.user.profile.blacklist.remove(peer)  # remove идемпотентен
        return Response(_block_state(request.user, peer))


# ── 3. api/user/urls.py (подключён в /api/v1/users/) ────────────────────────
from django.urls import path
from api.user import views

urlpatterns = [
    # … session/self/, session/<pk>/ и остальное
    path('session/blacklist/', views.BlacklistList.as_view(), name='blacklist'),
    path('session/blacklist/<int:pk>/', views.BlacklistDetail.as_view(), name='blacklist-detail'),
]


# ── 4. api/chat_legacy/views.py — RoomMessagesList.create ──────────────────
# В начало create(), сразу после `room = self.get_room()`:
#
#     peers = room.members.exclude(pk=request.user.pk)
#     if peers.filter(profile__blacklist=request.user).exists():
#         return Response({'detail': 'Пользователь ограничил вам личные сообщения'},
#                         status=status.HTTP_403_FORBIDDEN)
#     if request.user.profile.blacklist.filter(pk__in=peers).exists():
#         return Response({'detail': 'Вы заблокировали этого пользователя'},
#                         status=status.HTTP_403_FORBIDDEN)
#
# Правку и удаление своих уже отправленных сообщений блокировка не запрещает.
