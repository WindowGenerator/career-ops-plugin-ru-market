## 0.3.0 (готовится)

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
