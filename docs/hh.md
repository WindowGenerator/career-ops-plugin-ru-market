# HH: только браузерный companion

С версии 0.7.0 плагин `ru-market` не обращается к API HH: адаптер `lib/hh.mjs`, переменная `HH_ACCESS_TOKEN` и хост `api.hh.ru` удалены. API отвечал `403` уже на первой странице выдачи. HH собирается браузерным companion через core `provider: local-parser`; установка, конфигурация (`hh_browser`), серверные параметры, тайм-ауты и диагностика описаны в [companion/README.md](../companion/README.md), готовая запись есть в [examples/hh-browser.yml](../examples/hh-browser.yml).

## Миграция с 0.6.x

1. Удалите `hh` из `ru_market.primary_source_order` (допустимые длины списка теперь 2, 4, 5 или 6; обязательны `habr-career` и `geekjob`) и блок `sources.hh` из `portals.yml`; иначе плагин выбросит ошибку `config`.
2. Удалите `HH_ACCESS_TOKEN` из `.env`: он больше не читается.
3. Добавьте отдельную запись `HH browser` с блоком `hh_browser` из примера; запросы перенесите из `sources.hh.queries` в `hh_browser.queries`, `area` и `max_pages` в `area` и `pages`, `title_only` в `search_field: [name]`. Поля `schedule`, `period`, `host`, `locale`, `per_page` не поддерживаются.
4. Переустановите плагин и companion командой из README: она обновит патч core и поставит общий модуль `scripts/ru-market/lib/untrusted.mjs`.

## Юридический и технический риск

[Условия HH](https://hh.ru/article/33205) требуют взаимодействия программных приложений через API; companion использует анонимный браузерный контекст без входа и cookies и останавливается на проверках доступа. Этот риск принимает пользователь.
