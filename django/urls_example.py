# Пример: SPA на /messenger/ — все вложенные пути отдают один шаблон,
# маршрутизацию внутри делает React Router.
from django.urls import re_path
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.generic import TemplateView

urlpatterns = [
    re_path(r'^messenger/(?:.*)?$',
            ensure_csrf_cookie(TemplateView.as_view(template_name='chat.html')),
            name='messenger'),
]
