# career-ops-plugin-ru-market

Один opt-in provider `ru-market` для публичных вакансий HH, Habr Career и
GeekJob на рынке России и СНГ. Node.js ESM, без сторонних runtime-зависимостей.
Использует существующий API плагинов career-ops, без изменений core.

## Установка и запуск

Для локальной разработки скопируйте этот репозиторий (без `.git`) в
`career-ops/plugins.local/ru-market`. Имя каталога установки должно быть
`ru-market`, а имя отдельного GitHub-репозитория — `career-ops-plugin-ru-market`.
В каталоге career-ops:

```sh
node plugins.mjs enable ru-market
node plugins.mjs enable ru-market --confirm
node scan.mjs --dry-run
```

Между enable и scan добавьте в свой `portals.yml` блок из
[`examples/portals.yml`](examples/portals.yml), заменив условия поиска своими.
Пример содержит Python/remote только для демонстрации: в исходниках плагина
нет пользовательских поисковых запросов или географических ограничений.
Отсутствующий список запросов/категорий означает общую публичную выдачу.
Язык вакансии не определяется автоматически; уточняйте целевую выдачу в
`portals.yml` и стандартных фильтрах career-ops.

После публикации устанавливайте закреплённый commit, а не плавающую ветку:

```sh
node plugins.mjs add WindowGenerator/career-ops-plugin-ru-market --sha <40-hex-commit> --confirm
```

До принятия в официальный реестр статус — `community-unverified`.
Повторная установка через ту же команду с новым SHA обновляет код плагина;
`portals.yml` и `config/plugins.yml` находятся вне него. Автоматического
`plugins.mjs update` в проверенной версии core нет.

## Конфигурация

В каждой записи обязателен `provider: ru-market`; автоматического detect нет.
Параметры находятся в `ru_market`, а конфигурации площадок — в `sources`.

| Поле | Значение / default |
| --- | --- |
| `source` | `all` (default), `hh`, `habr-career`, `geekjob` |
| `max_pages` | целое 1–20, default 1; на каждый запрос/категорию |
| `primary_source_order` | перестановка `[hh, habr-career, geekjob]` |
| `sources.hh` | настройки HH |
| `sources.habr_career` | настройки Habr Career (ключ с `_`) |
| `sources.geekjob` | настройки GeekJob |
| `enabled` внутри источника | boolean, default true |
| `mode` внутри источника | HH: `api`/`auto`; остальные: `html`/`auto` |
| `max_pages` внутри источника | переопределяет общий лимит |

HH: `queries` — непустой массив строк (до 20), `per_page` — 1–100 (50),
`host` — только `hh.ru`, `locale` — `RU`/`EN` (RU), `area` — ID региона или
пустая строка, `schedule` — `remote`/`fullDay`/`shift`/`flexible`/`flyInFlyOut`,
`period` — 1–30 дней, по умолчанию не отправляется. Сеть всегда идёт на
`api.hh.ru`, параметр `host` не меняет HTTP-host.

Habr: `categories` — непустой массив slug из латинских букв, цифр и `_`
(до 20), `remote` — boolean (false). GeekJob: публичная общая выдача,
страницы `/vacancies/`, `/vacancies/2` и далее.

Неизвестные поля игнорируются; неизвестные имена источников, неподдерживаемые
режимы и некорректные известные параметры отклоняются до HTTP-запросов.
Все отключённые источники — ошибка конфигурации. `ctx.maxPages` и `ctx.sinceMs`
не используются: scanner не передаёт их plugin context.

## Результаты и дедупликация

Плагин возвращает только стандартные поля Job. `postedAt` — конечное число
миллисекунд Unix, только для уверенно распознанной даты публикации. Локальные
даты интерпретируются в UTC+03:00, с учётом перехода года. Неизвестные даты
опускаются. У GeekJob немаркированная дата карточки не считается публикацией:
это может быть обновление. Сегодняшняя дата вместо неизвестной не подставляется.

Оригинальные компания и условия локации сохраняются. При сравнении компаний
нормализуются пробелы, регистр, кавычки и распространённые юридические суффиксы;
транслитерации нет. Суммы зарплат идут в `{from, to, currency}`; исходная
формулировка, gross/net и период сохраняются в `note`. Прогнозы Habr для похожих
специалистов не становятся зарплатой вакансии.

`source: all` выполняет дедупликацию до core. Сначала убираются повторы ID/URL
внутри площадки. Для разных площадок нужны совпадающие компания, должность
и локация; high-confidence merge дополнительно требует сходства описаний
≥0.85 по Jaccard уникальных слов (минимум 12 слов с каждой стороны). Сильно
различающиеся описания, несовместимые зарплаты/локации и даты с разницей более
14 дней не объединяются. Группы проверяются попарно, чтобы избежать
транзитивного слияния разных вакансий одной площадки.

Без достаточного описания совпадение остаётся medium-confidence: обе вакансии
возвращаются с reciprocal `possible cross-listing` в `note`. Обычные публичные
карточки Habr/GeekJob часто не содержат описания, поэтому такое поведение
ожидаемо. Детальные страницы дополнительно не загружаются.

Primary по умолчанию HH; все альтернативные ссылки и зарплатные примечания
остаются в `note`. Пример:

```text
source: hh; cross-listed: Habr Career https://career.habr.com/vacancies/123
```

Core записывает системный источник `ru-market-api`. Его собственная дальнейшая
дедупликация может убрать medium-confidence пары; это ограничение core, а не
гарантия сохранения двух строк в pipeline. Не делите production-поиск на три
отдельных provider-вызова, если нужны альтернативные ссылки.

## Сеть и ошибки

HTTP выполняется только через `ctx.fetchJson`/`ctx.fetchText`. `allowedHosts`:
`api.hh.ru`, `career.habr.com`, `geekjob.ru`. Нет OAuth, cookies, browser automation,
откликов, запросов к работодателям, HH HTML fallback, GeekJob `/json/` или `/rest/`.
Никакие URL из карточек не используются для сетевых запросов.

Очереди общие для процесса, независимые по host: HH concurrency 2, Habr и GeekJob
concurrency 1 с интервалом между стартами 750 мс. На transient-сбой не более двух
повторов: network/timeout, HTTP 429 или 5xx. Остальные 4xx не повторяются.
Backoff с jitter ограничен; доступный `Retry-After` ограничен 10 секундами.

**Ограничение core 1.26.0:** guarded fetch сохраняет `error.status`, но удаляет
HTTP-заголовки ошибки. Поэтому `Retry-After` в этой версии недоступен плагину;
используется backoff. Если контекст передаёт `error.headers`, `response.headers`
или `retryAfter`, заголовок учитывается. Core ради этого не изменялся.
Политика редиректов также принадлежит guarded context: он проверяет host каждого
перехода; плагин ограничивает исходные URL публичными listing-endpoint.

Известная пустая структура — `[]`. Неизвестная/сломанная структура, challenge
или login wall — ошибка. После удачных страниц возвращается частичный результат;
`ctx.log` получает JSON с source, completed_pages, failed_page и category.
Остальные запросы/категории и исправные площадки продолжают работать. Если ни
одна площадка не завершилась успешно, provider выбрасывает ошибку.

## Проверки

```sh
npm test
CAREER_OPS_ROOT=../career-ops npm run test:integration
node scripts/health.mjs --career-ops ../career-ops
```

`npm test` работает без сети и сторонних пакетов. Фикстуры синтетические,
воспроизводят проверенную структуру страниц, не содержат live-вакансий/PII.
Интеграция создаёт временный checkout через `git archive`, запускает штатные
scaffold/enable/scan, проверяет pipeline и history, затем удаляет временный
каталог. Нужен установленный `node_modules` core; данные исходного checkout
не меняются. Проверено с core `92dea48b209a9791b884e2a19ee111d0e2f098f0`.

Health использует настоящий guarded context career-ops, поэтому ему нужен
путь к checkout core. Выполняет ровно один listing-запрос на источник, без
retries, детализации и сохранения вакансий. stdout — один JSON. Статусы:
`reachable`, `empty`, `broken-markup`, `access`, `rate-limited`, `network`,
`server`, `http`, `unknown`. Exit 0 для reachable/empty, 1 при деградации,
2 при ошибке запуска/пути к core. Это локальная проверка плагина;
`verify-portals.mjs` его пока не загружает.

На 2026-09-27: Habr reachable (25 карточек), GeekJob reachable (20),
HH `access` — HTTP 403 `forbidden` из текущего окружения. Это не подтверждение
работоспособности HH live: его преобразование и интеграция проверены фикстурами.

`.github/workflows/test.yml` проверяет offline-тесты на Node 18/22/24 и интеграцию.
Отдельный `health.yml` запускается раз в неделю/вручную, не на PR. Ненулевой exit
делает workflow красным и создаёт error annotation; уведомления доступны через
обычные GitHub Actions notifications. JSON artifact содержит только статусы
и счётчики. Внешние сообщения и issue автоматически не создаются.

## Проверка правил доступа — 2026-09-27

Это запись инженерной проверки, не утверждение о разрешении любого сбора данных.

| Источник | Проверенные документы и результат |
| --- | --- |
| HH | [API](https://github.com/hhru/api), [условия API](https://dev.hh.ru/admin/developer_agreement), [robots](https://hh.ru/robots.txt). Реализация использует только публичный поиск API. Условия API отдельно предусматривают регистрацию приложения; доступность анонимного endpoint не отменяет условий. Live из текущего окружения: 403. |
| Habr Career | [robots](https://career.habr.com/robots.txt), [соглашение](https://career.habr.com/info/legal). Robots не запрещает публичные listing pages, запрещает private/action routes. Соглашение ограничивает воспроизведение и распространение контента; robots сам по себе не даёт разрешения на это. |
| GeekJob | [robots](https://geekjob.ru/robots.txt), [условия](https://geekjob.ru/terms). `/json/` и `/rest/` запрещены robots; плагин использует только HTML listings. |

Перед распространением сервиса или перепубликацией данных отдельно уточните
соответствие конкретного использования условиям площадок. Репозиторий
распространяет код и синтетические тесты, а не базу живых вакансий.

## Релиз

SemVer: patch — исправления парсеров без изменения конфигурации; minor —
совместимые новые возможности; major — несовместимый контракт.
Порядок публикации, установка по SHA и подготовка registry PR описаны в
[`RELEASING.md`](RELEASING.md). Публикация кода не означает одобрение в реестре.

## Происхождение

Архитектурный образец —
[startup-boards](https://github.com/giacomoguidotto/career-ops-plugin-startup-boards/tree/66f61a66beb01eaa63dd01095f745be93fa694a5):
один provider dispatch и несколько внутренних адаптеров.
Селекторы HTML и mapping HH основаны на локальных прототипах
`career-ops/scripts/parsers/{hh,habr-career,geekjobs}-jobs.mjs` и сверены с
публичной разметкой. Прототипы сохранены. Код распространяется по MIT;
уведомление об авторских правах career-ops сохранено в LICENSE.
