# is_staff и groups в карточке пользователя чата.
#
# Карточка (ChatMemberSerializer) отдаётся в трёх местах:
#   • GET  /api/v1/chat/rooms/                — members у каждой комнаты
#   • POST /api/v1/chat/rooms/dialog/<id>/    — members у комнаты (тот же RoomSerializer)
#   • GET  /api/v1/chat/users/search/         — objects (ChatUserSearchSerializer)
# Было:  {"id", "username", "name", "avatar"}
# Стало: {"id", "username", "name", "avatar", "is_staff", "groups": ["SITE ADMINS", …]}
#
# Сообщения (MessageSerializer) не меняются: там только sender_id/sender_username,
# карточку отправителя фронт берёт из members комнаты.
# Фронт новые поля пока не читает — выкатывать можно в любой момент.
#
# Запросов к БД: +1 на всю выдачу (группы всех участников одним prefetch), без N+1.


# ── 1. api/chat_legacy/serializers.py ───────────────────────────────────────
from django.contrib.auth.models import User
from rest_framework import serializers


class ChatMemberSerializer(serializers.ModelSerializer):
    """Публичная карточка участника. Без email — её видит собеседник."""
    name = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    # имена групп списком; данные — из prefetch в member_cards(), без запроса на каждого
    groups = serializers.SlugRelatedField(many=True, read_only=True, slug_field='name')  # НОВОЕ

    class Meta:
        model = User
        fields = ['id', 'username', 'name', 'avatar', 'is_staff', 'groups']  # + is_staff, groups
        read_only_fields = fields

    # _profile, get_name, get_avatar — без изменений


class ChatUserSearchSerializer(ChatMemberSerializer):
    room_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta(ChatMemberSerializer.Meta):
        fields = ['id', 'username', 'name', 'avatar', 'is_staff', 'groups', 'room_id']  # + is_staff, groups
        read_only_fields = fields


# ── 2. api/chat_legacy/views.py ─────────────────────────────────────────────
# Полная версия — django/chat_legacy/views.py в репозитории. Суть изменений:

# 2.1. импорт
from django.contrib.auth.models import Group, User  # + Group

# 2.2. общий queryset карточки — над rooms_for()
from django.db.models import Prefetch


def member_cards(qs=None):
    """
    User-queryset под ChatMemberSerializer: id, username, is_staff, профиль и группы.
    Profile «широкий» (settings, balance, коды сброса пароля…) — тянем только нужное;
    группы — одним запросом на всю выдачу и только имена.
    """
    qs = User.objects.all() if qs is None else qs
    return (qs
            .select_related('profile')
            .only('id', 'username', 'is_staff', 'profile__nickname', 'profile__avatar')
            .prefetch_related(Prefetch('groups', queryset=Group.objects.only('name'))))

# 2.3. rooms_for(): убрать локальный members_qs, в конце —
#     .prefetch_related(Prefetch('members', queryset=member_cards())))
#
# 2.4. search_users(): начать с member_cards() вместо User.objects
#     и убрать из цепочки .select_related('profile') и .only(...):
#
#     users = (member_cards()
#              .filter(is_active=True)
#              .filter(Q(profile__nickname__icontains=q) | Q(username__icontains=q))
#              .exclude(pk=user.pk)
#              …
#
# Важно: без is_staff в .only() Django догрузит его отдельным запросом
# на каждого пользователя — молча, без ошибки.
