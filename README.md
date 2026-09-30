# ru-market для career-ops

Плагин собирает вакансии из HH, SuperJob, «Работы России» (API), Habr Career и GeekJob (публичные HTML-выдачи).

**HH провайдер пока не работает:** API HH отвечает `403` уже на первой странице выдачи. Причину этого поведения API я разбираю; HTML-режима для HH нет. При `source: all` остальные источники продолжают сканирование.

## Установка

Из каталога `career-ops` установите плагин из последнего релиза:

```sh
curl -LsSf https://github.com/WindowGenerator/career-ops-plugin-ru-market/releases/latest/download/install.sh | sh
```

Обновление из последнего релиза:

```sh
curl -LsSf https://github.com/WindowGenerator/career-ops-plugin-ru-market/releases/latest/download/update.sh | sh
```

`update.sh` удаляет установленный плагин и ставит версию по SHA релизного коммита. Оба скрипта включают плагин после установки.

Добавьте запись из [примера](examples/portals.yml) в свой `portals.yml` и замените поисковые запросы. Источник выбирается через `ru_market.source`: `all`, `hh`, `habr-career`, `geekjob`, `superjob` или `trudvsem`. Новые источники выключены по умолчанию; для `source: all` включите `sources.superjob.enabled` или `sources.trudvsem.enabled`. Для SuperJob задайте `SUPERJOB_API_KEY` в `.env` приложения career-ops. Настройка доступа к HH описана в [docs/hh.md](docs/hh.md).

## Проверка

```sh
npm test
CAREER_OPS_ROOT=../career-ops npm run test:integration
```

## Роудмап

- [x] Добавить SuperJob и «Работу России» через публичные API.
- [x] Проверить поиск вакансий «Работы России» на живом API.
- [x] Выпустить версию 0.3.0 с новыми источниками.
- [ ] Проверить SuperJob на живом API с ключом приложения.
- [ ] Разобраться с ответом `403` от HH API и восстановить поиск вакансий.
- [ ] Добавить мониторинг доступности SuperJob и «Работы России».

Условия доступа к HH: [API](https://github.com/hhru/api), [условия сайта](https://hh.ru/article/33205). Порядок публикации и ручная установка по SHA описаны в [RELEASING.md](RELEASING.md).
