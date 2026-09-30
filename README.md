# ru-market для career-ops

Плагин собирает вакансии из HH (API), Habr Career и GeekJob (публичные HTML-выдачи). HH может отвечать `403`; HTML-режима для HH нет.

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

Добавьте запись из [примера](examples/portals.yml) в свой `portals.yml` и замените поисковые запросы. Источник выбирается через `ru_market.source`: `all`, `hh`, `habr-career` или `geekjob`. Для HH можно задать `HH_ACCESS_TOKEN` в `.env` каталога `career-ops`; токен не гарантирует устранение `403`.

## Проверка

```sh
npm test
CAREER_OPS_ROOT=../career-ops npm run test:integration
```

Условия доступа к HH: [API](https://github.com/hhru/api), [условия сайта](https://hh.ru/article/33205). Порядок публикации и ручная установка по SHA описаны в [RELEASING.md](RELEASING.md).
