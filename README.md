# ru-market для career-ops

Плагин собирает вакансии из SuperJob, «Работы России» (API), Habr Career и GeekJob (публичные HTML-выдачи), а также из опциональных getmatch и HelloWorld.rs. HH собирается отдельным браузерным companion (см. ниже).

**Версия 0.7.0, ломающее изменение: API-адаптер HH удалён.** API HH отвечал `403` уже на первой странице. `hh` в `primary_source_order`, `source: hh` и `sources.hh` теперь отклоняются ошибкой `config` с подсказкой про `local-parser`; переменная `HH_ACCESS_TOKEN` и хост `api.hh.ru` больше не используются. Источники по умолчанию: `habr-career` и `geekjob`. Порядок миграции описан в [RELEASE_NOTES.md](RELEASE_NOTES.md), план и решения в [roadmap](docs/roadmap/provider-architecture-review.md).

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

Добавьте запись из [примера](examples/portals.yml) в свой `portals.yml` и замените поисковые запросы. Источник выбирается через `ru_market.source`: `all`, `habr-career`, `geekjob`, `superjob`, `trudvsem`, `getmatch` или `helloworld-rs`. Новые источники выключены по умолчанию; для `source: all` включите `sources.superjob.enabled` или `sources.trudvsem.enabled`. getmatch подключается отдельно через `sources.getmatch.enabled: true`; ограничения экспериментального адаптера описаны в [docs/getmatch.md](docs/getmatch.md). HelloWorld.rs подключается через `sources.helloworld_rs.enabled: true` и явный список `queries`; [настройка и ограничения](docs/helloworld.md). Для SuperJob задайте `SUPERJOB_API_KEY` в `.env` приложения career-ops. Доступ к HH: [docs/hh.md](docs/hh.md).

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
- [x] Заменить API-адаптер HH браузерным companion (0.7.0) — [план](docs/roadmap/provider-architecture-review.md).
- [ ] Добавить мониторинг доступности SuperJob и «Работы России».

Условия доступа к HH: [API](https://github.com/hhru/api), [условия сайта](https://hh.ru/article/33205). Порядок публикации и ручная установка по SHA описаны в [RELEASING.md](RELEASING.md).

Браузерный поиск HH устанавливается отдельно в career-ops и запускается через `provider: local-parser`, используя Playwright из career-ops. Конфигурация и ограничения: [companion/README.md](companion/README.md). Это единственный транспорт HH и отдельный инструмент вне разрешений плагина.

### Подключение HH через companion вручную

Установщик `install.sh` ставит companion (`scripts/ru-market/scan-hh.mjs` и общий модуль `scripts/ru-market/lib/untrusted.mjs`) и патч core, но не правит `portals.yml` ([companion/README.md](companion/README.md)). Запись добавляется вручную:

1. Установите плагин и companion командой из раздела «Установка». Проверьте браузер из каталога `career-ops`: `node scripts/ru-market/scan-hh.mjs --preflight --channel chrome`.
2. Скопируйте запись `HH browser` из [examples/hh-browser.yml](examples/hh-browser.yml) в свой `portals.yml` (в примере она стоит первой в `job_boards`). Блок `hh_browser` (`queries`, `pages`, `area`, `search_field`, `excluded_text`, `professional_role`, `only_with_salary`, `timeout_ms`) отделён от `ru_market`; `ru_market.sources.hh` не читается. Блок перечитывается при каждом запуске, переустановка не нужна. `parser.args` записи указывают на неё саму (`--config portals.yml --entry "HH browser" --no-artifacts`).
3. Задайте `parser.timeout_ms`: по умолчанию core прерывает parser через 20 с, этого хватает максимум на одну страницу. `hh_browser.timeout_ms` (дедлайн companion между страницами) держите ниже `parser.timeout_ms` примерно на 60 с. При блокировке или дедлайне companion завершается с кодом 0, отдаёт найденные вакансии и `sourceStatuses` со статусом `partial` или `failed`; сводка и `--json` receipt core показывают это как ошибку источника `hh`, сканирование не падает.
4. Сначала используйте `node scan.mjs --dry-run`; запись в pipeline выполняет core.

**Дубликаты между записями.** Core дедуплицирует по нормализованному URL, затем по ключу «компания + роль» (с учётом `company_aliases`), в том числе против вакансий, уже принятых в этом запуске и записанных в pipeline и историю. Записи при этом обрабатываются **параллельно** (`CONCURRENCY = 10` в `scan.mjs`), поэтому при дубликате остаётся вакансия той записи, которая завершилась первой, а не той, что стоит первой в файле. Браузерный сбор обычно медленнее, поэтому в одном запуске чаще побеждает запись `ru-market`. Чтобы данные HH гарантированно остались, запустите HH отдельным сканированием раньше (`node scan.mjs --company "HH browser"`, затем `node scan.mjs --company "Russian-language job boards"`): второе сканирование отбросит дубликат (проверено интеграционным тестом). Альтернативные ссылки у объединённых дубликатов теряются. Разное написание компании сводится через `company_aliases` в `portals.yml`, например `company_aliases: {Яндекс: [Yandex, ООО Яндекс]}`.

Анонимный браузерный сбор HH остаётся отдельным юридическим и техническим риском: условия HH требуют работы через API ([hh.ru/article/33205](https://hh.ru/article/33205)).

### Защита от prompt injection

Весь текст источника (`title`, `company`, `location`, `note`, `description`, метки) проходит через `lib/untrusted.mjs`: удаляются невидимый Unicode, bidi-символы, управляющие символы и HTML-комментарии, длина ограничена, шаблоны инструкций на английском и русском дают `injectionFlags`. Помеченные вакансии не отбрасываются; число помеченных попадает в `sourceStatuses` (`injection_flagged`). С патчем core и включённым `trust_filter` вакансия получает один флаг `prompt-injection-suspected` и `trustScore` ниже на 30. Детектор эвристический (возможны пропуски и ложные срабатывания); полный текст вакансии, который читают режимы core, он не защищает.

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
query diagnostics, listing completeness, `employment`/`professional_role`/`injectionFlags`
passthrough and the `{min,max,currency}` salary shape. DOM and isolated pipeline checks: `npm run test:dom`.
