## 0.4.1

- Removed the ripgrep dependency from installer verification so integration
  runs on standard GitHub Ubuntu runners. The stable 0.4.0 tag did not publish
  a release because the new integration gate caught this missing tool.
- Includes the HH companion, optional getmatch source and release checks
  described below.

## 0.4.0 — HH browser companion and optional getmatch

- Added an optional sixth source `getmatch` through the existing ru-market provider.
  Disabled by default; reads listing metadata only, excludes promotions/archive,
  preserves territorial remote restrictions and omits ambiguous timestamps.
- Pagination follows metadata and can continue through filtered pages. Repeated
  IDs/offsets produce explicit failures or partial results. Dedup uses numeric ID.
- Added `getmatch.ru` to declared hosts; upgrading the plugin may require renewed
  host consent through career-ops. Requests are restricted to `/api/offers`.
- Health only checks getmatch with explicit `--source getmatch`. Fixtures and
  integration are synthetic/offline; live pagination and usage conditions remain
  unverified. getmatch remains opt-in with an experimental API contract.

- Added a separately installed HH browser companion using career-ops Playwright.
  Release installers protect local companion edits and apply the reviewed
  local-parser metadata extension only when its patch applies cleanly.
- HH live check: two pages, 40 unique vacancies, 11 salaries. Core extension
  committed locally as `e04e21ee`; the release carries the provider patch.

- Fixed installer tests for clean and already-patched career-ops checkouts.
  CI now pins career-ops 1.34.0 at `8c9aae34244ec2f79d1d21c05a34c5de608e7747`.
- Release publication requires the Node 18/22/24 matrix and integration checks
  to pass through the same reusable workflow as normal pushes.

## 0.3.1

Исправлена пагинация «Работы России»: параметр `offset` означает номер
страницы. Раньше запрос второй страницы с `limit=100` отправлял `offset=100`
и получал HTTP 500. Диагностика теперь указывает номер поискового запроса,
страницу и HTTP-статус без текста вакансий и поисковой строки.

Habr Career больше не добавляет рейтинг к названию компании и не записывает
прогноз «Похожие специалисты получают…» как зарплату вакансии. Живой поиск
«Работы России» после исправления вернул 200 уникальных вакансий за две
страницы; публичная выдача Habr проверена отдельно. HH по-прежнему отвечает
`403`; SuperJob без ключа приложения не проверен.

## 0.3.0

Добавлены SuperJob и «Работа России» через публичные API. Оба источника
выключены по умолчанию; для SuperJob требуется `SUPERJOB_API_KEY` приложения.
Проверен живой запрос к «Работе России» с поиском Python. SuperJob проверен
локальными тестами без пользовательского ключа; живой доступ пока не проверен.

## 0.2.1

Сокращён README. В релиз добавлены `install.sh` и `update.sh` с закреплённым
SHA релизного коммита. Скрипты используют штатный CLI career-ops и включают
плагин после установки.

## 0.2.0

Проверенный коммит реализации: `8f2435b7d7cf018e3cc169b996181e2c0f0030a9`.
Точный SHA релизного коммита указан в опубликованных заметках GitHub и
приложенном `ru-market.json`.

HH API принимает `HH_ACCESS_TOKEN` зарегистрированного приложения из окружения.
HTML-поиск HH не добавлен: условия сайта запрещают автоматизированный парсинг.
После первого отказа доступа HH остальные его запросы прекращаются. Provider
возвращает статус каждого источника для отчёта о частичном результате. Причина
наблюдавшегося 403 остаётся неизвестной; токен не гарантирует доступ.

Совместный скан продолжает Habr Career и GeekJob после отказа HH. При
обновлённом scanner core итоговый JSON содержит `status: partial`,
`source_statuses` по площадкам и ошибку HH. Локальная правка core сохранена
отдельным коммитом `5ab6b06f4ea46ade51a7c7fc3a0456cba6f9aa75`;
она не входит в этот плагин.

## 0.1.0

Initial ru-market provider for career-ops: HH public API, Habr Career and
GeekJob public HTML, aggregate deduplication with alternative URLs, independent
host queues, bounded retries and partial results. No runtime dependencies,
OAuth, browser automation or application submission.

Validated with synthetic fixtures and the existing career-ops scanner in an
isolated checkout. Live Habr/GeekJob checks passed on 2026-09-27; HH returned
HTTP 403 forbidden from the development environment. HH live availability
is not confirmed; use source-level enabled flags where necessary.

Known limitations: current core drops Retry-After error headers; unlabelled
GeekJob dates are omitted; listing cards without descriptions produce possible
cross-listings rather than automatic merges. Platform terms are linked in README;
robots policy does not authorize redistribution of vacancy content.

Install using the exact commit SHA shown in the attached ru-market.json.
The plugin is community-unverified until the official registry accepts it.
