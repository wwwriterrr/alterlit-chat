# Пользователь по id или по логину — апп api/users/.
#
#   GET /api/v1/users/<id>/
#   GET /api/v1/users/by-username/<username>/
#        → {"id": 7, "username": "bob", "nickname": "Боб" | null,
#           "avatar": "/media/avatars/…" | null, "groups": ["Авторы", …]}
#        404 — нет такого, неактивен или скрыт (profile.global_hidden); аноним — 403.
#
# Почему два адреса, а не один «id или логин»: логин в Django может состоять
# из одних цифр («12345»), и тогда не понять, что имелось в виду.
#
# nickname отдаётся как есть (может быть null) — подставлять username вместо пустого
# псевдонима решает клиент. avatar лежит в Profile (user.profile.avatar), у User его нет.


# ── 1. api/users/serializers.py ─────────────────────────────────────────────
from django.contrib.auth.models import User
from rest_framework import serializers


class UserDetailSerializer(serializers.ModelSerializer):
    """Публичная карточка: без email, is_staff и полей профиля сверх нужного."""
    nickname = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    groups = serializers.SlugRelatedField(many=True, read_only=True, slug_field='name')

    class Meta:
        model = User
        fields = ['id', 'username', 'nickname', 'avatar', 'groups']
        read_only_fields = fields

    @staticmethod
    def _profile(obj):
        # у пользователя без профиля user.profile бросает RelatedObjectDoesNotExist
        # (наследник AttributeError) — getattr с default это перехватывает
        return getattr(obj, 'profile', None)

    def get_nickname(self, obj):
        nickname = (getattr(self._profile(obj), 'nickname', None) or '').strip()
        return nickname or None

    def get_avatar(self, obj):
        """Относительный /media/avatars/..., как в /api/v1/users/session/self/."""
        avatar = getattr(self._profile(obj), 'avatar', None)
        return avatar.url if avatar else None


# ── 2. api/users/views.py ───────────────────────────────────────────────────
from django.contrib.auth.models import Group, User
from django.db.models import Prefetch
from rest_framework import generics
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated

from api.users.serializers import UserDetailSerializer


class UserDetail(generics.RetrieveAPIView):
    """GET <pk>/ и by-username/<username>/ — один класс, поле поиска выбирается по URL."""
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = UserDetailSerializer

    def get_queryset(self):
        return (User.objects
                .filter(is_active=True)
                .exclude(profile__global_hidden=True)
                .select_related('profile')
                # Profile широкий (баланс, коды сброса пароля…) — берём только нужное
                .only('id', 'username', 'profile__nickname', 'profile__avatar')
                # группы одним запросом и только имена
                .prefetch_related(Prefetch('groups', queryset=Group.objects.only('name'))))

    def get_object(self):
        # по какому адресу пришли — по тому полю и ищем
        self.lookup_field = 'username' if 'username' in self.kwargs else 'pk'
        return super().get_object()  # 404, если не нашли


# ── 3. api/users/urls.py (подключён в /api/v1/users/) ───────────────────────
from django.urls import path, re_path
from api.users import views

urlpatterns = [
    # … session/self/ и остальное
    # Имена параметров — ровно pk и username: по ним UserDetail.get_object
    # выбирает поле поиска (<int:id> или <int:user_id> → AssertionError и 500).
    path('<int:pk>/', views.UserDetail.as_view(), name='user-detail'),
    # символы логина Django: буквы, цифры и @ . + - _
    re_path(r'^by-username/(?P<username>[\w.@+-]+)/$', views.UserDetail.as_view(),
            name='user-detail-by-username'),
]
# session/… не конфликтует: <int:pk> совпадает только с числом.
