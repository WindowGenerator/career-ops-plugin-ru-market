# Архитектура: поток данных

Состояние на версию 0.7.0. Связи компонентов: [components.md](components.md).

Вакансии попадают в core двумя путями. Оба заканчиваются в общем конвейере `scan.mjs`, где применяются фильтры, проверка доверия и дедуп. Весь внешний текст проходит через `untrusted.mjs` до того, как покинет провайдер.

## Путь 1: провайдер ru-market (API и HTML)

```mermaid
flowchart TD
  A["scan.mjs<br/>запись provider: ru-market"] --> B["_engine: ctx.fetch*, settings, allowedHosts"]
  B --> C["index.mjs: parseConfig(entry.ru_market)"]
  C --> D{"параллельно<br/>Promise.allSettled"}
  D --> E1["habr-career"]
  D --> E2["geekjob"]
  D --> E3["superjob / trudvsem"]
  D --> E4["getmatch / helloworld-rs<br/>(opt-in)"]
  E1 & E2 & E3 & E4 --> F["paginate: страницы, retry, статусы запросов"]
  F --> G["разбор ответа<br/>JSON или HTML"]
  G --> H["makeJob"]
  H --> U["untrusted(): убрать невидимый Unicode,<br/>управляющие символы, HTML-комментарии,<br/>лимиты длины, детект паттернов"]
  U --> H2["Job: поля + compensation + injectionFlags"]
  H2 --> L["локальный дедуп source:id"]
  L --> M["lib/dedup: дедуп между площадками<br/>(union injectionFlags)"]
  M --> N["массив Job + sourceStatuses + queryStatuses<br/>(injection_flagged)"]
  D -.->|"все источники упали"| X["SourceError sources-failed"]
  N --> S["scan.mjs"]
  X --> S
```

## Путь 2: HH через companion и local-parser

```mermaid
flowchart TD
  A["scan.mjs<br/>запись HH browser (local-parser)"] --> B["local-parser: execFile<br/>node scripts/ru-market/scan-hh.mjs --config portals.yml --entry 'HH browser' --no-artifacts"]
  B --> C["loadBatchConfig: блок hh_browser<br/>queries, pages, area, search_field,<br/>excluded_text, professional_role,<br/>only_with_salary, timeout_ms"]
  C --> D["Playwright, анонимный контекст<br/>hh.ru/search/vacancy, 1 с между страницами"]
  D --> E{"результат страницы"}
  E -->|"челлендж или блокировка"| F["статус failed/partial,<br/>частичные вакансии сохраняются"]
  E -->|"ok"| G["разбор карточек"]
  G --> U["untrusted() из scripts/ru-market/lib/untrusted.mjs"]
  F --> H
  U --> H["envelope JSON: jobs + sourceStatuses<br/>exit 0 при сбое, ненулевой только для --scan и invalid-config"]
  H --> I["stdout"]
  I --> J["local-parser: parse JSON, белый список полей<br/>title, url, company, location, compensation,<br/>employment, professional_role, injectionFlags, provenance"]
  J --> K["sourceStatuses: не ok превращается в запись об ошибке<br/>и попадает в итог скана"]
  J --> S["scan.mjs"]
  K --> S

  D -.-> ART["артефакты (без --no-artifacts):<br/>query-XX.json, merged.json,<br/>checkpoint.json, portals-hh.yml"]
  ART -.->|"--import-cache: повторный разбор без сети"| B
```

## Общий конвейер scan.mjs

```mermaid
flowchart TD
  IN["Job из любого провайдера"] --> T["buildTrustValidator<br/>trustScore, trustFlags, trustLevel<br/>injectionFlags: флаг prompt-injection-suspected, штраф 30 один раз"]
  T --> F1["blacklist"]
  F1 --> F2["title_filter"]
  F2 --> F3["location_filter, возраст, дата"]
  F3 --> F4["salary_filter: читает compensation и salary min/max"]
  F4 --> F5["content_filter: по description"]
  F5 --> F6["country, visa и прочие фильтры"]
  F6 --> D1["дедуп: URL, затем company::role<br/>против истории, pipeline и этого запуска"]
  D1 --> OUT["data/pipeline.md<br/>url, company, title, location, comp"]
  OUT --> LLM["режимы pipeline и scan: LLM читает записи"]
  LLM --> RAW["режимы открывают URL вакансии<br/>Playwright или WebFetch: сырой текст JD"]
```

## Что где защищено

| Этап | Защита | Остаточный риск |
|---|---|---|
| Выход провайдера (`makeJob`, companion) | `untrusted()` на `title`, `company`, `location`, `note`, `description`. Помеченные вакансии остаются, счётчик `injection_flagged` в статусах. | Паттерны ловят только очевидные атаки. |
| Проверка доверия core | `injectionFlags` превращается в `prompt-injection-suspected` и штраф 30. Работает только при настроенном `trust_filter`. | При выключенном `trust_filter` поле остаётся на Job без последствий. |
| `pipeline.md` | Только форматная очистка (`sanitizeMarkdownField`). | Очищенные плагином поля всё равно попадают в контекст LLM. |
| Сырой JD в режимах core | Только маркер «untrusted» в промптах. | Плагин этот путь не закрывает. Закрывается отдельным upstream-предложением (приложение в roadmap). |

## Дубликаты между путями

Путь 1 и путь 2 это разные записи `portals.yml`, core обрабатывает их параллельно (`CONCURRENCY = 10`). Дубликат определяется по URL, затем по `company::role` с учётом `company_aliases`, победителем остаётся запись, завершившаяся первой. Чтобы данные HH побеждали гарантированно, запускайте HH отдельным сканированием раньше (`--company "HH browser"`).
