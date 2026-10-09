# ru-market для career-ops

Плагин собирает вакансии из HH, SuperJob, «Работы России» (API), Habr Career и GeekJob (публичные HTML-выдачи).

**HH провайдер пока не работает:** API HH отвечает `403` уже на первой странице выдачи. Причину этого поведения API я разбираю; HTML-режима для HH нет. При `source: all` остальные источники продолжают сканирование.

## Установка

Из каталога `career-ops` установите плагин из последнего релиза:

```sh
curl -LsSf https://github.com/WindowGenerator/career-ops-plugin-ru-market/releases/latest/download/install.sh | sh
```

Для обновления повторите ту же команду: `install.sh` сам определит, установлен ли плагин. Старый адрес обновления также работает:

```sh
curl -LsSf https://github.com/WindowGenerator/career-ops-plugin-ru-market/releases/latest/download/update.sh | sh
```

CI подставляет SHA релизного коммита в `install.sh` и публикует его копию как `update.sh`. Оба адреса устанавливают или обновляют плагин и включают его после установки. При ошибке замены восстанавливаются прежний каталог плагина, `plugins.lock` и `config/plugins.yml`. Уже применённый патч ядра и обновлённый companion при этом остаются; локальные правки companion по-прежнему блокируют обновление. Не запускайте установку одновременно с другими командами, меняющими плагины.

Добавьте запись из [примера](examples/portals.yml) в свой `portals.yml` и замените поисковые запросы. Источник выбирается через `ru_market.source`: `all`, `hh`, `habr-career`, `geekjob`, `superjob`, `trudvsem`, `getmatch` или `helloworld-rs`. Новые источники выключены по умолчанию; для `source: all` включите `sources.superjob.enabled` или `sources.trudvsem.enabled`. getmatch подключается отдельно через `sources.getmatch.enabled: true`; ограничения экспериментального адаптера описаны в [docs/getmatch.md](docs/getmatch.md). HelloWorld.rs подключается через `sources.helloworld_rs.enabled: true` и явный список `queries`; [настройка и ограничения](docs/helloworld.md). Для SuperJob задайте `SUPERJOB_API_KEY` в `.env` приложения career-ops. Настройка доступа к HH описана в [docs/hh.md](docs/hh.md).

**SuperJob:** на 30 сентября 2026 года консоль разработчика некорректно проводит OAuth2-сценарий, из-за чего нам пока не удалось нормально зарегистрировать приложение и получить Secret key для живой проверки. Для публичного поиска вакансий плагину нужен именно Secret key приложения, а не пользовательский OAuth2-токен ([документация API](https://api.superjob.ru/)).

## Проверка

```sh
npm test
CAREER_OPS_ROOT=../career-ops npm run test:integration
```

## Роудмап

- [ ] Добавить сербские площадки: Poslovi Infostud, HelloWorld.rs и Poslovi.rs — [план](docs/serbia-providers-plan.md).
- [ ] Добавить общие фильтры уровня и технологий в career-ops отдельным этапом — [roadmap](docs/roadmap/core-job-filters.md).

- [x] Добавить SuperJob и «Работу России» через публичные API.
- [x] Проверить поиск вакансий «Работы России» на живом API.
- [x] Выпустить версию 0.3.0 с новыми источниками.
- [ ] Проверить SuperJob на живом API с ключом приложения.
- [ ] Разобраться с ответом `403` от HH API и восстановить поиск вакансий.
- [ ] Добавить мониторинг доступности SuperJob и «Работы России».

Условия доступа к HH: [API](https://github.com/hhru/api), [условия сайта](https://hh.ru/article/33205). Порядок публикации и ручная установка по SHA описаны в [RELEASING.md](RELEASING.md).

Браузерный поиск HH устанавливается отдельно в career-ops и запускается через `provider: local-parser`, используя Playwright из career-ops. Конфигурация и ограничения: [companion/README.md](companion/README.md). Это отдельный инструмент вне разрешений API-плагина; `hh.mode: auto` по-прежнему использует только API.

### Reproducible HH browser batches

The separate companion now collects configured queries, merges provenance, checkpoints
progress, and generates an HH-only cache import config. From career-ops:

```sh
node scripts/ru-market/scan-hh.mjs --config portals.yml --entry NAME --artifact-dir data/scan-output/hh-run --scan --dry-run
```

See [the batch workflow and compensation contract](companion/README.md),
[standalone configuration](examples/hh-browser.yml) and
[cache provider example](examples/hh-browser-cache.yml). Browser health is
`node scripts/ru-market/scan-hh.mjs --preflight`; version is `--version`.
The core contract patch preserves monthly/hourly/shift units and gross/net basis,
query diagnostics and listing completeness. DOM and isolated pipeline checks: `npm run test:dom`.
