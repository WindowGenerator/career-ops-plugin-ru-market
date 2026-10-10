# Архитектура: компоненты и связи

Состояние на версию 0.7.0. Поток данных описан отдельно: [data-flow.md](data-flow.md). Решения и их обоснование: [../roadmap/provider-architecture-review.md](../roadmap/provider-architecture-review.md).

Плагин состоит из двух независимых частей. Провайдер `ru-market` работает внутри хоста плагинов core и ходит только на разрешённые хосты через `ctx.fetch*`. Companion для HH работает вне хоста, потому что запускает браузер, и подключается к core через `local-parser`. Общий код (`untrusted.mjs`) ставится в обе части из одного файла.

## Компоненты и зависимости

```mermaid
flowchart LR
  subgraph User["Конфигурация пользователя"]
    PY["portals.yml<br/>запись provider: ru-market<br/>запись HH browser (local-parser + hh_browser)"]
    PLY["config/plugins.yml<br/>включение плагина"]
  end

  subgraph Core["career-ops core (только чтение, патч ставится установщиком)"]
    SCAN["scan.mjs<br/>фильтры, дедуп, pipeline"]
    ENG["plugins/_engine.mjs<br/>хост плагинов, ctx, allowedHosts"]
    LP["providers/local-parser.mjs<br/>запуск внешнего скрипта, белый список полей"]
    TV["providers/_trust-validator.mjs<br/>trustScore / trustFlags"]
    TYPES["providers/_types.js<br/>схема Job"]
  end

  subgraph Plugin["Плагин ru-market (песочница хоста)"]
    MAN["manifest.json<br/>hook provider, allowedHosts"]
    IDX["index.mjs<br/>провайдер, Promise.allSettled, статусы"]
    CFG["lib/config.mjs<br/>валидация ru_market"]
    AD["Адаптеры<br/>habr-career, geekjob, superjob,<br/>trudvsem, getmatch, helloworld-rs"]
    INF["Инфраструктура<br/>http, queue, retry, paginate, html"]
    NORM["lib/normalize.mjs + compensation.mjs<br/>makeJob"]
    UNT["lib/untrusted.mjs<br/>нормализация, флаги инъекций"]
    DD["lib/dedup.mjs<br/>дедуп между площадками"]
  end

  subgraph Comp["Companion HH (вне песочницы)"]
    SH["scripts/ru-market/scan-hh.mjs<br/>Playwright-сборщик"]
    SUNT["scripts/ru-market/lib/untrusted.mjs<br/>копия того же файла"]
    ART["артефакты: merged.json,<br/>checkpoint.json, portals-hh.yml"]
  end

  subgraph Inst["Установка"]
    INSH["install.sh<br/>файлы + core-contract.patch + sha256-состояние"]
    PATCH["companion/core-contract.patch<br/>(+ 0.6 для обновления)"]
  end

  subgraph Ext["Внешние источники"]
    API["JSON API<br/>superjob, trudvsem, getmatch"]
    HTML["HTML<br/>habr, geekjob, helloworld.rs"]
    HH["hh.ru (браузер)"]
  end

  PY --> SCAN
  PLY --> ENG
  SCAN -->|"provider: ru-market"| ENG
  ENG -->|"загрузка hook"| MAN
  MAN --> IDX
  IDX --> CFG
  IDX --> AD
  AD --> INF
  AD --> NORM
  NORM --> UNT
  IDX --> DD
  INF -->|"ctx.fetch"| API
  INF -->|"ctx.fetch"| HTML

  SCAN -->|"parser.command: node"| LP
  LP -->|"execFile"| SH
  SH --> SUNT
  SH -->|"Playwright"| HH
  SH --> ART
  PY -.->|"hh_browser читается при каждом запуске"| SH

  SCAN --> TV
  LP --> TYPES
  TV --> TYPES

  INSH -->|"копирует"| SH
  INSH -->|"копирует"| SUNT
  INSH -->|"git apply"| PATCH
  PATCH -.->|"расширяет"| LP
  PATCH -.->|"расширяет"| TV
  PATCH -.->|"расширяет"| TYPES
  PATCH -.->|"расширяет"| SCAN
```

## Границы и правила

| Граница | Правило |
|---|---|
| Плагин и сеть | Только HTTPS на хосты из `allowedHosts`, запросы идут через `ctx.fetch*` (SSRF-защита, 10 с по умолчанию). Плагин не импортирует Playwright и не запускает процессы. |
| Companion и core | Companion запускается как внешний парсер: `local-parser` вызывает `node scripts/ru-market/scan-hh.mjs ...` и читает JSON из stdout. Конфиг companion живёт в `portals.yml` (блок `hh_browser`) и перечитывается при каждом запуске. |
| Патч core | `core-contract.patch` расширяет `local-parser` (поля `employment`, `professional_role`, `injectionFlags`, `compensation`, `sourceStatuses`), `_trust-validator` (флаг `prompt-injection-suspected`), `_types.js`, `scan.mjs`. Ставится `install.sh`, при обновлении core может потребоваться переустановка. |
| Общий код | `lib/untrusted.mjs` одна исходная копия. `install.sh` кладёт её в `scripts/ru-market/lib/` и записывает sha256 в `scan-hh.install.json`, локально изменённые файлы установщик не перезаписывает. |
| Разделение источников | `hh` в `ru_market.primary_source_order` отвергается ошибкой миграции. Порядок источников допускает длины 2, 4, 5 и 6. |

## Расширение: новый провайдер

- Через API или HTML без браузера: новый адаптер в `lib/`, регистрация в `index.mjs`, хост в `manifest.json`. Результат обязан идти через `makeJob`, тогда `untrusted.mjs` применяется автоматически.
- Через браузер: скрипт в `scripts/ru-market/`, импорт `./lib/untrusted.mjs`, отдельная запись `local-parser` в `portals.yml` со своим блоком конфигурации по образцу `hh_browser`.
