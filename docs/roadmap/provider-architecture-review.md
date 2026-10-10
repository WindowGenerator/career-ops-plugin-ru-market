# Ревизия адаптеров ru-market и план перехода на 0.7.0

Статус: ревизия выполнена по состоянию репозитория 0.6.0 и локального checkout core (`92f4e4d2`). Решения a–k согласованы с владельцем. Реализация выполнена в ветке `feature/provider-architecture-review` (0.7.0, не закоммичена); отклонения от документа перечислены в разделе «Итоги реализации» в конце. Ссылки вида `файл:строка` относятся к этим версиям. Живые запросы к источникам при подготовке документа не выполнялись.

## Задача

Сравнить семь адаптеров плагина (hh, habr-career, geekjob, superjob, trudvsem, getmatch, helloworld-rs) с соглашениями upstream career-ops, зафиксировать расхождения, дать технический вердикт по кандидатам (Армения, Яндекс) и описать согласованные изменения: удаление API-адаптера HH, гибридные фильтры, новые поля Job, фильтры getmatch и защиту от prompt injection.

Соглашения upstream, с которыми сравнивалось:

- Контракт провайдера: `id`, `fetch(entry, ctx)` возвращает массив; опционально `detect`, `dedupKey` (`../career-ops/providers/_types.js:5-7`, `Provider` в конце файла). Плагин возвращает массив с невидимыми `sourceStatuses` и `queryStatuses` (`index.mjs:47-48`); core читает их в `scan.mjs:3601`.
- Job: обязательны `title` и `url`, остальное необязательно (`_types.js`, `Job`). `makeJob` возвращает `null` без заголовка или допустимого URL (`lib/normalize.mjs:86`).
- local-parser: запуск внешней команды из репозитория, JSON на stdout, лимит 20 с и 2 МБ по умолчанию (`providers/local-parser.mjs:13-14`), передаются только перечисленные поля (`local-parser.mjs:196-223`).
- Фильтры core (`title_filter`, `skip_tiers`, `salary_filter`, `content_filter`, возраст публикации) применяются только после `provider.fetch` в `scan.mjs` (вызов `scan.mjs:3585`, фильтры `3643-3669`). Серверных фильтров в core-провайдерах нет.
- Plugin-провайдер получает только `ctx` с `fetchText`, `fetchJson`, `fetchResponse` (`_types.js`, `Context`), то есть запустить Playwright из плагина нельзя; браузерный сбор вынесен в companion (`install.sh:17`, `companion/README.md:5`).

Поправка к исходной формулировке: «CI запрещает browser/process-модули в bundled-плагинах» подтверждено только частично. Найден пункт чек-листа статического аудита в шаблоне PR реестра core (`../career-ops/.github/PULL_REQUEST_TEMPLATE/plugin-registry.md:38`: без `child_process`, `playwright`, raw sockets, глобального `fetch`, `eval`). В `plugin-registry-validate.yml` таких проверок не найдено. Ограничение реально действует как правило ревью и как набор доступных плагину средств (`ctx`).

## Сравнение адаптеров

| Адаптер | Транспорт | Авторизация | Очередь запросов | Серверные параметры, которые передаёт плагин | Поля результата | Тесты |
| --- | --- | --- | --- | --- | --- | --- |
| hh | JSON API `api.hh.ru/vacancies` | необязательный Bearer `HH_ACCESS_TOKEN` (`lib/http.mjs:25-31`) | 2 параллельно, без паузы (`lib/queue.mjs:35`) | `text`, `area`, `schedule`, `period`, плюс `page`, `per_page`, `host`, `locale`, `order_by` (`lib/hh.mjs:38-40`) | описание из snippet, `postedAt`, `salary`, `compensation`, `workArrangement`, `locations` | `test/run.mjs`, `fixtures/hh` |
| habr-career | HTML | нет | 1 запрос, пауза 750 мс (`queue.mjs:36`, умолчание `queue.mjs:3`) | путь категории, `/remote`, `page` (`lib/habr-career.mjs:44-45`); текстового поиска нет | описание карточки, зарплата, дата | `test/run.mjs`, `fixtures/habr-career` |
| geekjob | HTML | нет | как выше (`queue.mjs:37`) | только страница (`lib/geekjob.mjs:42`) | описание карточки, зарплата, дата только при явной метке публикации (`geekjob.mjs:25-27`) | `test/run.mjs`, `fixtures/geekjob` |
| superjob | JSON API | обязателен `SUPERJOB_API_KEY` (`http.mjs:33-36`) | как выше (`queue.mjs:38`) | `keyword`, `page`, `count` (`lib/superjob.mjs:39-41`) | описание из `work`, `candidat`, `compensation` | заготовки в `test/run.mjs:269`; каталога fixtures нет |
| trudvsem | JSON API | нет | как выше (`queue.mjs:39`) | `text`, `limit`, `offset` (`lib/trudvsem.mjs:47-49`) | описание из `duty`, `requirements`, `qualification` | заготовки в `test/run.mjs:273`; каталога fixtures нет |
| getmatch | недокументированный JSON `/api/offers` | нет | 1 запрос, пауза 1000 мс (`queue.mjs:41`) | только `p`, `offset`, `limit` (`lib/getmatch.mjs:62`) | заголовок, компания, локации, зарплата; описание намеренно не копируется (`getmatch.mjs:48`) | `test/getmatch.mjs` (11), `fixtures/getmatch` |
| helloworld-rs | HTML | нет | 1 запрос, пауза 1000 мс (`queue.mjs:40`) | `q` (`lib/helloworld.mjs:98`) | `seniority`, `skills`, `compensation` (`helloworld.mjs:78-85`); описания нет | `test/helloworld.mjs` (9), `fixtures/helloworld-rs` |

Общее: тайм-аут запроса 10 с, до двух повторов для `network`, `server`, `rate-limited` (`http.mjs:38-40`, `lib/retry.mjs:13-20`). Допустимые URL проверяются `assertRequestUrl` (`http.mjs:7-20`) и `jobUrl` (`normalize.mjs:37-52`). Идентичность вакансии: `sourceId` из URL (`normalize.mjs:97`).

Расхождения со схемой upstream, не относящиеся к списку находок: поля `skills`, `seniority`, `note` не описаны в `_types.js`; `job.salary` плагина имеет форму `{from, to}` (`normalize.mjs:59`), а `salary_filter` core читает `min`/`max` (`scan.mjs:1006`). Пока присутствует `compensation`, core использует его (`scan.mjs:1001`), поэтому на практике вред ограничен; новые адаптеры должны полагаться на `compensation`.

## Кандидаты: технический вердикт

Вопрос один: отображается ли ответ источника на единую схему Job. Правовая сторона в вердикт не входит. Справка: условия Яндекса ограничивают использование контента функциями самого сайта (`docs/yandex-jobs-research.md:37`, п. 2.3 соглашения).

| Кандидат | Что подтверждено материалами репозитория | Вердикт |
| --- | --- | --- |
| Greenhouse, Lever, Workable (Армения) | Уже есть провайдеры core: `providers/greenhouse.mjs`, `lever.mjs`, `workable.mjs` (`docs/armenia-ats-research.md:5`). Они возвращают Job по штатной схеме | Отображаются; адаптер в плагине не нужен, нужны только проверенные доски |
| workx.am | Публичный MCP с `search-jobs` и `get-job-details` (`armenia-ats-research.md:11`); схема ответа в репозитории не зафиксирована, пример ответа не сохранён (`armenia-ats-research.md:30` требует её проверить) | Не определён. Дополнительно транспорт не покрыт: `request()` плагина делает только GET (`http.mjs:24-40`), для MCP нужен POST (`FetchOptions` допускает `method` и `body`, `_types.js`, но плагин их не передаёт) |
| staff.am, job.am | Публичные HTML и sitemap; поля карточек и стабильность URL не проверены (`armenia-ats-research.md:13-14,31-32`) | Не определён. По аналогии с HTML-адаптерами `title`, `url`, `company`, `location` вероятно извлекаемы, но без образцов разметки это предположение |
| Яндекс Jobs | API не найден; DOM и XHR не исследованы, браузера не было (`yandex-jobs-research.md:15,31`). Наблюдались названия, команды, краткие описания, города, форматы работы, навыки (`:25`) | Частично. Возможное соответствие: `title`, `url`, `location`, `workArrangement`, `skills`, уровень через `pro_levels` (`:26`, значения не проверены). Компания всегда одна (`:9`). Зарплата и дата публикации не подтверждены (`:29`), пагинация «Показать ещё» не установлена (`:28`). Полный контракт ответа не определён |

## Матрица фильтров

Колонка «Источник предлагает» для hh заполнена по списку, переданному в задаче; в репозитории полный перечень параметров HH API не зафиксирован, поэтому для остальных источников колонка помечена как непроверенная.

| Источник | Источник предлагает | Плагин передаёт | Core фильтрует после выборки |
| --- | --- | --- | --- |
| hh (API, до 0.7.0) | `experience`, `employment`, `salary`, `only_with_salary`, `professional_role`, `search_field`, `excluded_text` и др. | только `text`, `area`, `schedule`, `period` (`hh.mjs:38-40`) | название, описание, зарплата, возраст |
| hh (браузер, companion) | параметры поиска на странице hh.ru | `text`, `page`, `area`, `search_field=name` через `titleOnly` (`companion/scan-hh.mjs.txt:120-122`) | то же |
| habr-career | не проверялось | категория, `remote` | то же |
| geekjob | не проверялось | страница | то же |
| superjob | не проверялось | `keyword` | то же |
| trudvsem | не проверялось | `text` | то же |
| getmatch | параметры `sa`, `pa`, `se`, `l`, `s`, `from_date`, `to_date`, `sp`, `pl`, `c`, `exclude_applied` выведены из клиентского кода (`docs/getmatch-research.md:27,31`). НЕПРОВЕРЕНЫ: значения и поведение не наблюдались (`getmatch-research.md:33`) | ничего (`docs/getmatch.md:22-24`) | то же, только на загруженных страницах |
| helloworld-rs | не проверялось | `q` | то же; `seniority` и `skills` отдаются, но не фильтруются (`docs/roadmap/core-job-filters.md`) |

## Находки

Критично для пользователя:

- **hh включён по умолчанию, хотя API отвечает 403.** `DEFAULT_SOURCES` содержит `hh` (`lib/config.mjs:3`), `enabled` по умолчанию истинно для него (`config.mjs:46`); недоступность признана в `README.md:5`. Каждый `source: all` делает бесполезный запрос и даёт `failed` по hh. Закрывается решением a.
- **Промпт-защита заявлена, но не реализована.** `skill.md:4-5` называет текст вакансий недоверенным, а код только убирает теги и `script`/`style`, декодирует сущности и схлопывает пробелы (`normalize.mjs:3,11`); лимитов длины и детекции нет. Через `makeJob` проходят `title`, `company`, `location`, `description`, `note` (`normalize.mjs:84-110`). Закрывается решением e. Нюанс: регулярное выражение `<[^>]*>` не удаляет HTML-комментарий, внутри которого есть `>`.

Предупреждения:

- **getmatch без фильтров.** Только `p`, `offset`, `limit` (`getmatch.mjs:62`); принимаются `enabled`, `mode`, `max_pages`, `per_page` (`config.mjs:53`). Закрывается решением d.
- **CI закреплён на разных core.** `test.yml:28-29`: `career-ops-hq/career-ops` @ `8c9aae34`; `health.yml:18-19`: `santifer/career-ops` @ `92dea48b`; `release.yml:9` использует `test.yml`. Локальный checkout core при ревизии — `92f4e4d2`, третий вариант. Проверить, существуют ли эти коммиты в указанных репозиториях, из локального окружения нельзя. Нужно привести к одному репозиторию и ссылке или явно объяснить различие.
- **`requiredEnv` пуст, а SuperJob падает без ключа.** `manifest.json:8`; ошибка `config` на запросе (`http.mjs:35`). Нюанс: SuperJob выключен по умолчанию (`config.mjs:46`), ключ значится в `optionalEnv` (`manifest.json:9`), поэтому это не дефект манифеста, а позднее обнаружение: ошибка проявляется при запросе и попадает в `sourceStatuses` как `failed/config`. Предложение: проверять ключ в `parseConfig` при `enabled: true` или документировать в `skill.md`.

Найдено при ревизии:

- **Companion не может импортировать модули плагина.** Установщик копирует один файл `scan-hh.mjs` в `scripts/ru-market/` (`install.sh`, блок установки; `scan-hh.mjs.txt:9-11` импортирует только модули core), плагин лежит в `plugins.local/ru-market`. Решение e «общий модуль для makeJob и companion» требует либо второго устанавливаемого файла, либо встроенной копии с тестом на идентичность.
- **Новые поля теряются в local-parser.** Список ключей фиксирован (`local-parser.mjs:216-223`); `skills`, `seniority`, будущие `employment`, `professional_role`, `injectionFlags` не пройдут без расширения `companion/core-contract.patch` (сейчас он добавляет `dataLevel` и др., `core-contract.patch:22`).
- **Сбой companion теряет `sourceStatuses`.** В режиме `--query` при статусе не `ok` процесс завершается с кодом 1 (`scan-hh.mjs.txt:292,296`); `execFile` отклоняется, stdout игнорируется (`local-parser.mjs:242`), и в итоге остаётся только текст ошибки (`scan.mjs:3737-3748`), сканирование при этом не падает.
- **Конфигурация companion привязана к `ru_market.sources.hh`.** `loadBatchConfig` ищет запросы там (`scan-hh.mjs.txt:178`); после удаления адаптера такой ключ плагин отвергнет (`config.mjs:29` проверяет имена источников).
- **Дедупликация.** HH был основной площадкой кросс-дедупликации (`skill.md:15-18`); результаты companion идут отдельной записью `local-parser`, ссылки между площадками перестанут объединяться (core дедуплицирует по URL).

## Принятые решения

Согласованы с владельцем; пункты f–k приняты после ревизии и закрывают прежние открытые вопросы. Пометка «уточнение» отмечает деталь, добавленную при ревизии.

**a) HH: только браузерный транспорт.**

- Удалить API-адаптер `lib/hh.mjs`, его fixtures (`fixtures/hh/`), необязательную переменную `HH_ACCESS_TOKEN` (`manifest.json:9`, `http.mjs:25-31`), API-части `docs/hh.md`, регистрацию в `index.mjs:2,12`, очередь и разрешённый хост `api.hh.ru`.
- Единственный транспорт HH — Playwright companion через core local-parser. Плагин запускать Playwright не может.
- `hh` в `primary_source_order` отклоняется ошибкой `config` с подсказкой про `local-parser`. Допустимые длины выведены и проверены по `lib/config.mjs`: сейчас 3/5/6/7 (`config.mjs:31`, где 5 и 6 заданы жёстко и сверяются со срезами `SOURCES.slice(0, n)` на `config.mjs:34-36`). После удаления `SOURCES` = habr-career, geekjob, superjob, trudvsem, getmatch, helloworld-rs, обязательное ядро (`DEFAULT_SOURCES`) — habr-career и geekjob, допустимы длины 2/4/5/6 (ядро; +superjob, trudvsem; +getmatch; все шесть). Жёсткие 5 и 6 в `config.mjs:31,34-36` заменяются на 4 и 5. Миграционный тест (старые длины 3 и 7 отклоняются, 2/4/5/6 принимаются, `hh` даёт ошибку миграции) входит в объём. Тест `test/helloworld.mjs:67` жёстко задаёт `[3, 5, 6, 7]` и должен быть обновлён.
- Ломающее изменение: версия 0.7.0, запись в `RELEASE_NOTES.md`.
- Сбой companion (блокировка, тайм-аут) должен давать `sourceStatuses` со статусом `failed` и понятным текстом, сканирование не падает. Конкретный порядок — решение h.
- Анонимный сбор HH остаётся зафиксированным правовым и техническим риском (одна строка): условия HH требуют работы через API (`docs/hh.md:48`), companion использует анонимный браузерный контекст (`companion/README.md:5`).

**b) Фильтры: гибрид.** Серверные параметры для браузерного HH задаются через `parser.args`: `search_field`, `excluded_text`, `professional_role`, `only_with_salary`. `experience`, `employment`, `salary` передаются полями Job, фильтрует core (см. [core-job-filters.md](core-job-filters.md)). Образец — convention core: серверных фильтров в core-провайдерах нет. Уточнения: из этих параметров companion сейчас знает только `area` и `search_field=name` (через `--title-only`, `scan-hh.mjs.txt:122,270`); остальные флаги нужно добавить. Извлечение `experience` и `employment` из карточки выдачи не реализовано (`scan-hh.mjs.txt:21-39` читает только заголовок, компанию, место, зарплату, удалёнку) и не проверено на разметке; без этого поля останутся неизвестными. Режим `--query` через local-parser ограничен 20 с по умолчанию (`local-parser.mjs:13`), для нескольких страниц нужен `timeout_ms`.

**c) Новые поля Job `employment` и `professional_role`** добавляются в плагине сразу как дополнительные поля (как `dataLevel`, `eligibility`). Контракт и фильтры core описываются в [core-job-filters.md](core-job-filters.md). Для маршрута local-parser требуется расширить список полей патчем core (см. находки).

**d) getmatch: экспериментальные фильтры `sa`, `pa`, `se`, `l`** реализуются без предварительной живой проверки, строго как явное opt-in. В документации помечаются «непроверены»; проверка идёт через health и новые релизы, исправления в следующих версиях. Это отступает от запрета «не выдумывать фильтры». Поправка к исходной формулировке: в `docs/getmatch.md:25` такого текста нет; там на строках 22-24 сказано, что серверных фильтров в этой версии нет, а запрет «Do not invent query, remote or specialization filters» находится в `skill.md:38-39`. Поэтому `docs/getmatch.md` (строки 22-27) и `skill.md` обновляются в том же пакете работ. Остальные параметры (`s`, `from_date`, `to_date`, `sp`, `pl`, `c`, `exclude_applied`) не реализуются.

**e) Защита от prompt injection.**

- Новый модуль `lib/untrusted.mjs`, который используют `makeJob` (`lib/normalize.mjs`) и скрипт companion; способ поставки companion — решение f.
- Нормализация: невидимый Unicode (нулевой ширины, bidi), управляющие символы, HTML-комментарии, лимиты длины. Конкретные лимиты задаются при реализации и фиксируются в тестах.
- Детекция шаблонов на английском и русском: ignore previous instructions, `system:`, маркеры ролей, ссылки на инструменты, «игнорируй предыдущие» и аналоги. Результат — массив `injectionFlags` в Job; маршрут до core — решение g.
- Помеченные вакансии сохраняются, а не отбрасываются. Счётчики помеченных попадают в `sourceStatuses` (формируются в `paginate.mjs:54-57` и `index.mjs:30`).
- Область: любой текст внешнего источника, проходящий через провайдер (`title`, `company`, `location`, `note`, `description`). LLM-классификатора нет.
- Остаточный риск: полный текст вакансии читают режимы core через Playwright или WebFetch (`modes/pipeline.md:33`, `modes/scan.md:23`); защита там — маркер «данные, не инструкции» и правило в `AGENTS.md:63-71`, кодового детектора в core нет (поиск по `*.mjs` не нашёл ни одного). Закрывается отдельным предложением в upstream; черновик — в приложении.

**f) Общий модуль в companion: управляемый второй файл.** `lib/untrusted.mjs` устанавливается вторым управляемым файлом `scripts/ru-market/lib/untrusted.mjs` рядом с companion; companion импортирует его, единственный источник правды остаётся в плагине, встроенной копии нет. `install.sh` применяет к нему то же правило, что к `scan-hh.mjs`: отказ при локальных правках или неуправляемом файле (проверка `sha256` по `scan-hh.install.json`). Это шаблон для будущих браузерных и local-parser провайдеров: каталог `scripts/ru-market/lib/` общий, не привязан к HH. Файл публикуется в релизе так же, как `companion/scan-hh.mjs.txt`.

**g) Один объединённый патч core** (расширение `companion/core-contract.patch`, применяется установщиком локально; для работы изменение upstream не требуется). Он пропускает `employment`, `professional_role` (позже `seniority`, `skills` по `core-job-filters.md`) через список ключей local-parser (`local-parser.mjs:216-223`), пропускает флаги инъекций и исправляет форму зарплаты (решение k). Проверка кода для флагов: `buildTrustValidator` считает флаги только по `url` и `company` (`_trust-validator.mjs:203-244`: `missing_apply_url`, `invalid_url`, `suspicious_domain`, `company_domain_mismatch`), а `scan.mjs:3617-3621` перезаписывает `trustScore`, `trustFlags`, `trustLevel` результатом валидатора; local-parser эти ключи не пропускает. Поэтому внешне заданные trust-флаги провайдер передать не может. Выбранный маршрут: провайдер передаёт `injectionFlags` (массив строк) как входное поле, патч пропускает его через local-parser и добавляет в валидатор правило, которое по этому полю добавляет флаг в `trustFlags` и снижает `trustScore`. Флаги попадают в существующий вывод (`scan.mjs:2518-2539`, `4034-4036`) без отдельного механизма. Новое поле Job нужно в любом случае, обойтись одним trust-механизмом нельзя. Согласовано: `injectionFlags` — массив идентификаторов сработавших шаблонов; правило валидатора добавляет ОДИН флаг `prompt-injection-suspected` на вакансию и снижает `trustScore` на 30 один раз независимо от числа шаблонов (нижняя граница 0). Помеченные вакансии сохраняются. При `trust_filter.enabled: false` валидатор вырождается в no-op (`_trust-validator.mjs:184-186`), поле остаётся в Job. Вместе с патчем идёт одно предложение upstream (поля, флаги, зарплата; приложение). Обновления core могут потребовать переустановки патча (`companion/README.md:5`).

**h) Сбой companion.** При сбое, закодированном в `sourceStatuses`, companion завершается с кодом 0 и выдаёт частичные вакансии плюс `sourceStatuses` (причина, число завершённых страниц). Это работает с текущим core: local-parser сохраняет `sourceStatuses` (`local-parser.mjs:262-268`), а `scan.mjs:3601-3607` превращает каждый статус не `ok` в запись об ошибке, поэтому сбой виден в итоге сканирования, а не только в коде выхода. Ненулевой код остаётся для ошибок конфигурации и сбора с `--scan`; условие `process.exitCode = 1` (`scan-hh.mjs.txt:292`) для режима `--query` меняется. Критерий 4 и тест обязательны.

**i) Конфигурация HH.** Отдельная запись в `portals.yml` с блоком `hh_browser` (образец `examples/hh-browser.yml`); `parser.args` указывают на неё; companion перестаёт читать `ru_market.sources.hh` (`scan-hh.mjs.txt:178`). Это шаблон для любого будущего Playwright-провайдера. Конфигурация читается при каждом запуске, поэтому меняется без переустановки.

**j) Кросс-площадочная дедупликация.** Планируется отдельной работой (объём и риски). Как дедуплицирует core: нормализованный URL проверяется против истории, pipeline и вакансий этого же запуска (`scan.mjs:3685-3689`, `normalizeUrlForDedup` `:1486`), затем ключ `компания::роль` (`companyRoleDedupKey` `:2116`, роль через `normalizeRoleForDedup` `:2031`, компания через `canonicalizeCompany` и `company_aliases`), в том числе против вакансий, уже принятых из других записей этого запуска (`:3695-3722`). Для записи с `aggregator: true` ключ компания+роль не применяется, остаётся только URL (`:3695-3697`). Вывод: одна вакансия из записи ru-market (habr) и записи HH (local-parser) с разными URL объединится по ключу компания+роль, если компания и должность совпадают после нормализации; записи обрабатываются параллельно (`CONCURRENCY = 10`, `parallelFetch`), побеждает запись, завершившаяся первой; порядок в `portals.yml` и `primary_source_order` победителя не определяют; альтернативные ссылки теряются (плагин сейчас сохраняет их в `note`, `lib/dedup.mjs`). Согласовано: core не менять. Чтобы данные HH гарантированно побеждали, HH запускается отдельным сканированием раньше остальных (`--company "HH browser"`), последующее сканирование отбрасывает дубликат. Companion отдаёт `company` и `title` как на странице. Различия в написании компании решаются через `company_aliases` в `portals.yml` (формат `Каноническое имя: [алиас, ...]`, регистр не важен, `templates/portals.example.yml:1575-1591`, `scan.mjs:1819`), например:

```yaml
company_aliases:
  Яндекс: [Yandex, ООО Яндекс]
```

Потеря альтернативных ссылок у объединённых дубликатов принимается, новое поле не вводится.

**k) Зарплата.** Источник правды — `compensation {min, max, currency, period, taxBasis, rawText}`. `salary` отдаётся как `{min, max, currency}`; устаревшая форма `{from, to}` убирается (`normalize.mjs:59,91`). Расхождение на стороне core: `local-parser.mjs:225-229` принимает `from`/`to`, а `scan.mjs:1006` читает `min`/`max`, поэтому `salary` из local-parser не участвует в `salary_filter` без `compensation`. Исправление входит в объединённый патч и в предложение upstream.

## Объём работ

- [x] Удалить `lib/hh.mjs`, `fixtures/hh/`, `HH_ACCESS_TOKEN` из `manifest.json` и `http.mjs`, `api.hh.ru` из `allowedHosts`, `assertRequestUrl` и очереди, регистрацию в `index.mjs`, API-разделы `docs/hh.md`, `skill.md`, `README.md`, `examples/portals.yml`.
- [x] Перестроить `lib/config.mjs`: убрать `hh` из `SOURCES` и `DEFAULT_SOURCES`, отклонять `hh` в `primary_source_order` и `sources.hh` с подсказкой про `local-parser`, пересчитать допустимые длины.
- [x] Конфигурация HH: отдельная запись `portals.yml` с `hh_browser`, `parser.args` на неё, companion не читает `ru_market.sources.hh`; обновить `examples/hh-browser.yml`, `companion/README.md`, `README.md`.
- [x] Companion: флаги `search_field`, `excluded_text`, `professional_role`, `only_with_salary`; при сбое в режиме `--query` код выхода 0, частичные вакансии и `sourceStatuses` (причина, завершённые страницы).
- [x] Добавить поля `employment`, `professional_role`, `injectionFlags` в `makeJob`; расширить `companion/core-contract.patch` одним патчем: список ключей local-parser, правило trust-валидатора по `injectionFlags`, форма `salary` `{min,max,currency}` (решения g, k); указать в сообщениях установщика, что обновление core может потребовать переустановки.
- [x] Исправить `salary` в плагине: `{min,max,currency}`, без `{from,to}`; `compensation` остаётся источником правды.
- [x] `install.sh` и релиз: второй управляемый файл `scripts/ru-market/lib/untrusted.mjs` с тем же правилом отказа при локальных правках; общий каталог `scripts/ru-market/lib/` для будущих провайдеров.
- [x] Дедупликация между записями: README описывает порядок запуска (HH отдельным сканированием раньше остальных) и `company_aliases` с примером; интеграционный тест подтверждает, что при раннем отдельном сканировании HH остаётся. Порядок записей в файле победителя не определяет.
- [x] getmatch: опции `sa`, `pa`, `se`, `l` в `config.mjs` и `getmatch.mjs`, по умолчанию выключены, пометка «непроверены»; обновить `docs/getmatch.md` (строки 22-27), `skill.md` (строки 38-39), `examples/portals.yml`.
- [x] Модуль `lib/untrusted.mjs`: нормализация и детекция, `injectionFlags`, счётчики в `sourceStatuses`; подключить к `makeJob` и companion через общий файл (решение f).
- [x] Тесты: unit-тесты `untrusted.mjs` (русские и английские шаблоны, невидимый Unicode, bidi, управляющие символы, HTML-комментарии, лимиты, ложные срабатывания); тест миграции конфигурации (`hh` даёт ошибку миграции, старые длины 3 и 7 отклоняются, 2/4/5/6 принимаются; обновить `test/helloworld.mjs:67`, где задано `[3, 5, 6, 7]`); обновление fixtures и `test/run.mjs` (все ссылки на hh, строки 4, 20-23, 98-111, 146-161); тесты фильтров getmatch.
- [x] Выровнять закрепление core в `.github/workflows/test.yml` и `health.yml` либо задокументировать различие. Различие задокументировано комментариями в `test.yml` и `health.yml`; существование коммитов офлайн не проверено.
- [x] `RELEASE_NOTES.md` (раздел 0.7.0 с описанием ломающего изменения), `README.md`, поднять версию в `manifest.json`, `package.json`, `http.mjs:5`.

## Критерии готовности

1. В `lib/`, `index.mjs`, `manifest.json` и тестах нет ссылок на `api.hh.ru`, `HH_ACCESS_TOKEN` и `lib/hh.mjs`; `npm test` проходит.
2. `parseConfig` с `hh` в `primary_source_order` или `sources.hh` выбрасывает ошибку категории `config` с текстом про `local-parser`; тест миграции проверяет новые допустимые длины.
3. `source: all` не обращается к HH и не выдаёт `failed` по hh.
4. Блокировка или тайм-аут companion в режиме `--query` завершается кодом 0, отдаёт частичные вакансии и `sourceStatuses` со статусом `failed` или `partial`, причиной и числом завершённых страниц; в сводке и receipt `scan.mjs` сбой виден как ошибка источника, а не только в коде выхода; сканирование не падает (интеграционный тест).
5. `employment` и `professional_role` присутствуют в Job и после применения объединённого патча доходят до core через local-parser; их фильтрация описана в `core-job-filters.md`.
6. getmatch без новых опций отправляет те же запросы, что и в 0.6.0; с опциями — добавляет только `sa`, `pa`, `se`, `l`; в документации они помечены «непроверены».
7. `untrusted.mjs` покрыт тестами: невидимые символы и HTML-комментарии удалены, длины ограничены, шаблоны RU и EN дают `injectionFlags`, обычные вакансии флагов не получают.
8. Вакансия с флагами остаётся в результате; число помеченных видно в `sourceStatuses`, а флаг виден в `trustFlags` вывода scan (с патчем).
9. Companion импортирует `scripts/ru-market/lib/untrusted.mjs`, а не копию; установщик отказывает при локально изменённом файле; результаты companion и `makeJob` совпадают на общих тестовых строках.
10. `RELEASE_NOTES.md` содержит запись 0.7.0 с описанием ломающего изменения и миграции.
11. `salary` у вакансий плагина и companion имеет форму `{min,max,currency}`, `{from,to}` нигде не выдаётся; с патчем `salary_filter` учитывает `salary` из local-parser.
12. Запись HH в `portals.yml` с `hh_browser` работает без `ru_market.sources.hh`; смена `hh_browser` действует без переустановки.
13. README описывает порядок запуска (HH отдельным сканированием раньше остальных) и `company_aliases` с примером; интеграционный тест подтверждает, что при дубликате остаётся вакансия HH.
14. Правило валидатора даёт один флаг `prompt-injection-suspected` и снижает `trustScore` на 30 один раз (не ниже 0) для любого числа шаблонов; при `trust_filter.enabled: false` `injectionFlags` остаётся в Job.

## Что не делаем

- Серверные фильтры шире перечисленных в b) и d).
- Автоматическое редактирование `portals.yml`.
- Живые запросы к getmatch в фазе подготовки документов.
- Изменения upstream core: правки идут только локальным патчем установщика; детектор для сырого текста вакансии и поля Job выносятся в одно предложение upstream (приложение).
- LLM-классификатор инъекций.
- Адаптеры для Армении и Яндекса.

## Риски

- Удаление hh ломает существующие конфигурации (минимизируется ошибкой с подсказкой и записью в changelog).
- Фильтры getmatch без проверки могут быть неверными или нестабильными; opt-in и пометка ограничивают влияние.
- Эвристики детекции дают ложные срабатывания и пропуски; флаг информационный, вакансии не отбрасываются.
- Фильтры по `experience`, `employment` невозможны, пока companion не извлекает эти данные.
- Потеря объединения HH с habr и geekjob внутри плагина: победитель определяется тем, какое сканирование завершилось раньше (HH запускается отдельно и раньше), альтернативные ссылки у объединённых дубликатов теряются (принято), разное написание компании требует `company_aliases` (решение j).
- Объединённый патч core может не примениться после обновления core; нужна переустановка, установщик при несовместимости отказывает (`install.sh`, ветка «Cannot apply core contract cleanly»).
- Второй управляемый файл расширяет поверхность установщика: локальная правка общего модуля блокирует обновление companion.
- Сбой companion с кодом 0 нельзя путать с успехом: он обязан попадать в сводку через `sourceStatuses`, иначе данные теряются молча.

Открытые решения: как в будущем добавлять запись hh в `portals.yml` (команда или управляемый блок; до тех пор вручную, см. `README.md`); конкретные лимиты длины и список шаблонов; детали повышения версии (0.7.0, синхронизация `manifest.json`, `package.json`, `USER_AGENT` в `http.mjs:5`). Проверить при реализации: поведение объединённого патча на других версиях core; дедупликацию на живых данных; возможность повторного использования правила `sha256` из `install.sh` для второго управляемого файла.

## Приложение: черновик issue для upstream

Заголовок: Detector and marker for untrusted raw job descriptions read by pipeline and scan modes.

Текст:

> Summary. `AGENTS.md` ("Untrusted External Content") requires that job postings are treated as data, never instructions. In `modes/pipeline.md` (step 2a) and `modes/scan.md` the raw posting text is fetched with Playwright or WebFetch and passed to the model as-is. Enforcement relies on prompt wording only. A grep of the repository finds no code-level detector for instruction-like text.
>
> Problem. A posting from any source (listing, ATS API, scraped page) can contain text aimed at the model: "ignore previous instructions", fake `system:` or role lines, tool-call syntax, invisible Unicode (zero-width, bidi) or HTML comments. Provider-level sanitising does not cover the raw page text fetched later by the modes.
>
> Proposal. (1) A small shared module, for example `lib/untrusted-text.mjs`, that normalises text (invisible Unicode, control characters, HTML comments, length cap) and returns `flags` for known instruction-like patterns in English and other major languages. No LLM classifier. (2) The modes wrap fetched posting text in an explicit marker block and, when flags are present, quote them as an anomaly (Block G signal) instead of acting on them. (3) Flagged postings are kept, never silently dropped. (4) Providers may attach the same `flags` to Job as an optional `injectionFlags: string[]` field; `buildTrustValidator` adds one `prompt-injection-suspected` entry to `trustFlags` and lowers `trustScore` by 30 once per job (floor 0), because `scan.mjs` overwrites `trustFlags` on every job and local-parser does not pass externally supplied trust fields. (5) local-parser passes `employment`, `professional_role` (and later `seniority`, `skills`) and `injectionFlags`. (6) Salary shape: local-parser accepts `{from,to}` while `salary_filter` reads `{min,max}`; accept `{min,max}` so provider salary is not silently ignored.
>
> Out of scope. Blocking or deleting postings; semantic detection; changes to scoring.
>
> Acceptance. Unit tests with English and Russian patterns, invisible-Unicode and HTML-comment cases; a fixture posting with an embedded instruction is reported as an anomaly and does not alter the mode's output files.

## Итоги реализации

Выполнено в 0.7.0 (ветка `feature/provider-architecture-review`, без коммитов). Отклонения и уточнения:

- **Решение j и критерий 13 исправлены (изначально предполагали порядок записей, для core это неверно).** `scan.mjs` обрабатывает записи параллельно (`CONCURRENCY = 10`, `parallelFetch`), дубликат остаётся у записи, завершившейся первой, а не стоящей первой в `portals.yml`. Запись HH (браузер) обычно медленнее. Детерминированный вариант, проверенный интеграционным тестом: сначала отдельное сканирование HH (`--company "HH browser"`), затем остальные. README описывает фактическое поведение.
- Правило trust-валидатора работает только при настроенном `trust_filter` (без него валидатор no-op, как и в решении g). Нижняя граница 0 реализована, но с текущими штрафами core недостижима (минимальный балл до правила 40).
- `employment` и `professional_role` заполняют только SuperJob (`type_of_work`, `catalogues`) и Работа России (`employment`, `category.specialisation`); имена полей API не проверены живыми запросами. Companion их не извлекает.
- Форма `employment`/`professional_role`: `{values, rawLabels}`; `values` для `employment` выводятся из пяти русских меток, для `professional_role` пусты.
- Значения getmatch `sa`, `pa`, `se`, `l`: строки или числа (`sa`, `pa` одно значение; `se`, `l` до 10), формат непроверен.
- Для апгрейда с 0.6.0 добавлен `companion/core-contract-0.6.patch` (прежний патч для обратного применения) и ветка в `install.sh`.
- Флаг companion `--no-artifacts` добавлен, чтобы запись `local-parser` могла запускать `--config` без каталога артефактов; `timeout_ms` реализован как дедлайн между страницами.
- Серверные параметры HH companion не проверялись на живом HH.
