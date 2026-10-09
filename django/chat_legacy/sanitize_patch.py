# Очистка HTML сообщений на сервере.
#
# С форматированием в поле ввода content — это HTML от клиента. Новый фронт
# показывает его через свой санитайзер, но старый интерфейс сайта, письма-уведомления
# и любые другие клиенты могут вывести его как есть. Поэтому HTML чистится при
# КАЖДОМ сохранении: создание и правка сообщения.
#
# Зависимость: pip install nh3   (Rust-библиотека ammonia; bleach больше не развивается)


# ── 1. api/chat_legacy/sanitize.py (новый файл) ─────────────────────────────
import html

import nh3

# Ровно то, что умеет поле ввода, плюс теги редактора сайта (strong/em/ins/del/strike)
ALLOWED_TAGS = {'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'a'}
ALLOWED_ATTRIBUTES = {'a': {'href'}}
URL_SCHEMES = {'http', 'https', 'mailto'}


def clean_message_html(value):
    """
    Оставляет только разрешённые теги и href у ссылок (http/https/mailto).
    Содержимое запрещённых тегов сохраняется как текст, <script>/<style> — удаляются
    целиком. Ссылкам добавляется rel="noopener noreferrer nofollow".
    """
    if not value:
        return ''
    return nh3.clean(
        value,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes=URL_SCHEMES,
        link_rel='noopener noreferrer nofollow',
        strip_comments=True,
    ).strip()


def is_blank_html(value):
    """True, если после удаления тегов не осталось видимого текста (<p></p>, <p>&nbsp;</p>)."""
    text = html.unescape(nh3.clean(value or '', tags=set()))
    return not text.replace('\xa0', ' ').strip()


# ── 2. api/chat_legacy/serializers.py ───────────────────────────────────────
from rest_framework import serializers
from api.chat_legacy.sanitize import clean_message_html, is_blank_html


class MessageCreateSerializer(serializers.Serializer):
    """вход: files — это UploadedFile, а не объекты M2M"""
    content = serializers.CharField(required=False, allow_blank=True)
    files = serializers.ListField(child=serializers.FileField(required=False),
                                  required=False, allow_empty=True)

    def validate_content(self, value):
        value = clean_message_html(value)
        return '' if is_blank_html(value) else value

    def validate(self, attrs):
        if not attrs.get('content') and not attrs.get('files'):
            raise serializers.ValidationError(
                {'content': 'Сообщение не может быть пустым: нужен текст или хотя бы один файл.'})
        return attrs


class MessageUpdateSerializer(serializers.Serializer):
    """Вход PATCH: меняется только текст, вложения остаются как были."""
    content = serializers.CharField(allow_blank=True, trim_whitespace=True)

    def validate_content(self, value):
        value = clean_message_html(value)
        return '' if is_blank_html(value) else value

    def validate(self, attrs):
        # сообщение без текста допустимо, только если в нём есть файлы —
        # то же правило, что и при создании
        if not attrs['content'] and not self.instance.files.exists():
            raise serializers.ValidationError({
                'content': 'Сообщение не может быть пустым. '
                           'Удалите его, если оно больше не нужно.'})
        return attrs


# ── Заметки ─────────────────────────────────────────────────────────────────
# • Views менять не нужно: RoomMessagesList.create и RoomMessageDetail.patch берут
#   content из validated_data — он уже очищен.
# • Старые сообщения в базе не трогаются. Новый фронт их всё равно чистит при
#   показе; если старый интерфейс выводит content без очистки — их тоже стоит
#   прогнать через clean_message_html разовой миграцией данных.
# • Простой текст от старых клиентов остаётся текстом: «a < b» сохранится как
#   «a &lt; b» и покажется так же, как было набрано.
