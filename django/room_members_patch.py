# Профили участников в списке комнат: RoomSerializer.members → [{id, username, name, avatar}]
# Фронт понимает и старый формат (members: [1, 2]), так что выкатывать можно в любой момент.
#
# Источник данных — модель Profile (blog/models.py):
#     user     = models.OneToOneField(User, on_delete=models.CASCADE)   # → user.profile
#     nickname = models.CharField(max_length=50, null=True, blank=True)  # «Псевдоним»
#     avatar   = models.ImageField(upload_to=avatar_path_and_rename, null=True, blank=True)
#     avatar_min = ImageSpecField(ResizeToFill(100, 100), source='avatar')  # превью 100×100
# Отображаемое имя: profile.nickname, если пусто — user.username.

# ── api/chat/serializers.py ─────────────────────────────────────────────────
from django.contrib.auth.models import User
from rest_framework import serializers
from blog.models import Room


class ChatMemberSerializer(serializers.ModelSerializer):
    """Публичная карточка участника. Без email/is_staff/groups — их видит собеседник."""
    name = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'name', 'avatar']
        read_only_fields = fields

    @staticmethod
    def _profile(obj):
        # у пользователя без профиля user.profile бросает RelatedObjectDoesNotExist
        # (наследник AttributeError) — getattr с default это перехватывает
        return getattr(obj, 'profile', None)

    def get_name(self, obj):
        """Псевдоним, а если его нет — логин."""
        profile = self._profile(obj)
        nickname = (getattr(profile, 'nickname', None) or '').strip()
        return nickname or obj.username

    def get_avatar(self, obj):
        """Относительный /media/avatars/..., как в /api/v1/users/session/self/."""
        profile = self._profile(obj)
        avatar = getattr(profile, 'avatar', None)
        return avatar.url if avatar else None
        # Можно отдавать превью 100×100 (аватар в списке — 54px):
        #     return profile.avatar_min.url if avatar else None
        # но ImageSpecField генерирует файл при первом обращении к .url —
        # первый запрос списка с новыми аватарами станет медленнее.


class RoomSerializer(serializers.ModelSerializer):
    members = ChatMemberSerializer(many=True, read_only=True)  # было: список id
    unread_count = serializers.IntegerField(read_only=True)
    last_message_content = serializers.CharField(read_only=True)
    last_message_date = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Room
        fields = ['id', 'title', 'members', 'date_created',
                  'last_message_content', 'last_message_date', 'unread_count']
        read_only_fields = fields


# ── api/chat/views.py ───────────────────────────────────────────────────────
from django.db.models import Count, IntegerField, OuterRef, Prefetch, Subquery
from django.db.models.functions import Coalesce
from blog.models import Message


def rooms_for(user):
    """Комнаты пользователя с аннотациями и участниками — без N+1."""
    last = Message.objects.filter(room=OuterRef('pk')).order_by('-date')
    # Count('messages', filter=~Q(messages__is_read=user)) идёт через JOIN по is_read
    # и засчитывает сообщение, если его прочитал кто-то ДРУГОЙ. exclude() по M2M
    # строит корректный NOT IN, поэтому считаем подзапросом.
    unread = (Message.objects.filter(room=OuterRef('pk'))
              .exclude(is_read=user)
              .order_by().values('room').annotate(c=Count('pk')).values('c'))
    # Profile очень «широкий» (settings, balance, коды сброса пароля…) —
    # тянем только то, что нужно карточке участника
    members_qs = (User.objects.select_related('profile')
                  .only('id', 'username', 'profile__nickname', 'profile__avatar'))
    return (Room.objects.filter(members=user)
            .annotate(
                unread_count=Coalesce(Subquery(unread, output_field=IntegerField()), 0),
                last_message_date=Subquery(last.values('date')[:1]),
                last_message_content=Subquery(last.values('content')[:1]),
            )
            .prefetch_related(Prefetch('members', queryset=members_qs)))


class RoomList(generics.ListAPIView):
    serializer_class = RoomSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return rooms_for(self.request.user).order_by('-last_message_date')


@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def get_or_create_dialog(request, peer_id):
    if peer_id == request.user.id:
        return Response({'detail': 'Нельзя писать самому себе'}, status=400)
    peer = get_object_or_404(User, id=peer_id)
    a, b = sorted([request.user.id, peer.id])
    room, created = Room.objects.get_or_create(title=f'dialog{a}|{b}')
    room.members.add(request.user, peer)
    # перечитываем с аннотациями и участниками, чтобы ответ был как в списке
    room = rooms_for(request.user).get(pk=room.pk)
    return Response(RoomSerializer(room).data, status=201 if created else 200)


# ── Вариант Б: не трогать members ───────────────────────────────────────────
# Если members-как-id уже использует старый чат на сайте — оставьте members
# и добавьте отдельное поле, фронт понимает и его:
#
#     members_info = ChatMemberSerializer(source='members', many=True, read_only=True)
#     fields = [..., 'members', 'members_info', ...]
