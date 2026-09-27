## 0.2.0

HH API принимает `HH_ACCESS_TOKEN` зарегистрированного приложения из окружения.
HTML-поиск HH не добавлен: условия сайта запрещают автоматизированный парсинг.
После первого отказа доступа HH остальные его запросы прекращаются. Provider
возвращает статус каждого источника для отчёта о частичном результате. Причина
наблюдавшегося 403 остаётся неизвестной; токен не гарантирует доступ.

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
cross-listings rather than automatic merges. Platform terms review is recorded
in README; robots policy does not authorize redistribution of vacancy content.

Install using the exact commit SHA shown in the attached ru-market.json.
The plugin is community-unverified until the official registry accepts it.
