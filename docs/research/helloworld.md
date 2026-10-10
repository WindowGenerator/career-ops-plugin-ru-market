# HelloWorld.rs: представление вакансий и общий контракт

Проверено 2026-10-09. Это исследование и предложения для плана, не реализованный адаптер. Принятый продуктовый объём: настраиваемые поисковые фразы, поля выдачи без загрузки полных описаний, вакансии Сербии и доступная из Сербии удалёнка; неопределённая география сохраняется как неизвестная.

## Проверенные первичные источники

| Источник | Наблюдение |
| --- | --- |
| [Python-выдача](https://www.helloworld.rs/oglasi-za-posao/python/stranica/0) | Прямой HTTP 200, полноценный HTML, 56 результатов, 30 карточек на первой странице. Это технологический фильтр `tag=69`, не произвольный keyword query. |
| [Вторая страница](https://www.helloworld.rs/oglasi-za-posao/stranica/30?tag=69&disable_saved_search=0) | HTTP 200, 26 карточек. Следующая страница задаётся смещением 30; ссылка присутствует в `rel=next`. |
| [Поиск Data Engineer](https://www.helloworld.rs/oglasi-za-posao?q=Data%20Engineer) | HTTP 200, 96 результатов; следующий URL сохраняет `q`. Название вакансии не обязано содержать точную фразу. |
| [Выдача с зарплатой](https://www.helloworld.rs/oglasi-za-posao?salary=on) | HTTP 200, реальные суммы EUR/USD с разделителями `2.600,00`, пометками `(net)` / `(gross)`, без периода оплаты в карточке. |
| [Data Engineer, Bel-Dev, 760224](https://www.helloworld.rs/posao/Data-Engineer/Bel-Dev-d.o.o/760224) | HTTP 200; проверена только для установления семантики даты. В выдаче `25.10.2026.`, JSON-LD карточки содержит `datePosted=2026-10-07`, `validThrough=2026-10-26T00:00:00`. |
| [robots.txt](https://www.helloworld.rs/robots.txt) | HTTP 200; `/oglasi-za-posao` и `/posao` не запрещены, `/auth/` и `/konkurs/` запрещены. |

Числа результатов — снимок проверки, не гарантия будущего объёма. Сначала web-инструмент возвращал Python-выдачу из старого индекса; приведённые выше числа получены прямым HTTP-запросом. Первоначальная ошибка DNS возникла в ограниченной сетевой среде; после разрешённого сетевого доступа запросы прошли. JavaScript/browser для проверенных страниц выдачи не требуется.

## Что действительно лежит в карточке выдачи

Проверены разные записи первой и второй Python-страницы и keyword-выдачи:

| Пример | Видимое место / режим | Уровень и технологии |
| --- | --- | --- |
| Data Engineer — Bel-Dev | `Beograd | Hibrid` | `Senior`; SQL, Python, Batch, Kubernetes |
| Data Platform Engineer (DataOps) — Keba | `Novi Sad` | `Intermediate`; SQL, Git, Python, Docker |
| Associate Development Operations Engineer — Clarivate | `Beograd | Hibrid` | `Junior`; Linux, Git, Python и другие теги |
| Application Security Engineer — CCBill | `Rad od kuće` | `Intermediate`; .NET, C#, JavaScript и другие теги |
| Founding GPU Engineer — Fuse Energy | `Remote` | `Senior`; Node, C++, Python, C, CUDA |
| Data Scientist GenAI — Madiff | `Inostranstvo, Inostranstvo | Rad od kuće` | `Intermediate`; Python, R |

Источники таблицы: [первая страница](https://www.helloworld.rs/oglasi-za-posao/python/stranica/0), [вторая страница](https://www.helloworld.rs/oglasi-za-posao/stranica/30?tag=69&disable_saved_search=0). `Inostranstvo` означает заграницу, а не перечень разрешённых стран. Повторение слова — наблюдаемая особенность данных. Достоверного примера двух разных именованных городов в проверенной выборке не найдено: разделять произвольную строку по каждой запятой пока нельзя.

В HTML ссылки заголовков отмечены `__ga4_job_title` и `data-job-id`; работодатель — `h4`, иногда без ссылки. Место находится рядом с `la-map-marker`, дата — с `la-clock`, зарплата — с `la-coins`; технологии имеют класс `jobtag`. Рейтинги компаний, льготы и рекламные элементы расположены рядом, но не являются полями зарплаты или описанием работы. Эти селекторы — наблюдение текущей [выдачи](https://www.helloworld.rs/oglasi-za-posao/python/stranica/0), не публичный API-контракт.

В форме существуют фильтры `workplace[]=office|remote|hybrid`, `senioritet[]=1|2|3`, `city`, `vreme_postavljanja=today|2|3|7`. Их наличие проверено в HTML; поведение всех комбинаций не проверено. Город без явной метки режима сам по себе не доказывает офис: пример Keba следует нормализовать с `workArrangement=unknown`, пока отдельное наблюдаемое поле не подтверждает `onsite`. [Источник](https://www.helloworld.rs/oglasi-za-posao/python/stranica/0).

## Предлагаемое отображение в существующий Job

Общий конструктор уже предоставляет большую часть нужных полей: [lib/normalize.mjs](../../lib/normalize.mjs). Предлагается использовать его, добавив только правила HelloWorld; переписывать остальные адаптеры не требуется.

| Данные источника | Поле Job | Правило / ограничение |
| --- | --- | --- |
| Заголовок и работодатель | `title`, `company` | Текст конкретной карточки; не добавлять рейтинг к имени. |
| `/posao/<title>/<company>/<id>` | `url`, `sourceId` | HTTPS, проверенные host/path, убрать query/fragment; числовой ID из пути сверить с `data-job-id`. |
| Источник | `source`, `transport`, `note` | Предложение: `helloworld-rs`, `html`, начало note `source: helloworld-rs`. YAML-ключ может быть `helloworld_rs`. |
| Оригинальная строка места | `locationText` | Сохранить исходный текст, включая обозначение режима. |
| Место для существующего интерфейса | `location` | Понятная строка с явным `Hybrid` / `Remote`, поскольку старые фильтры читают именно строку. |
| Отдельные известные места | `locations` | Только подтверждённые подписи; `Remote` не превращать в город или страну. Для строки только про режим допустим пустой массив. |
| `Hibrid`, `Rad od kuće`, `Remote` | `workArrangement` | Соответственно `hybrid`, `remote`, `remote`; `onsite` только при явном подтверждении, иначе `unknown`. |
| Дата у часов | Не `postedAt` | Проверенный пример показывает срок объявления, не публикацию. В listing-only v1 `postedAt` отсутствует. |
| Отсутствующее описание | `hasDescription=false`, `dataLevel=listing` | `description` отсутствует; не подставлять технологии вместо описания. |
| Зарплата объявления | `compensation` | Явные сумма, валюта, net/gross, исходный текст; неизвестный период не угадывать. |
| Найденная поисковая фраза | `matchedQueries` | Уже формируется общим [paginate](../../lib/paginate.mjs), совпадения запросов объединяет [dedup](../../lib/dedup.mjs). |
| Доступность из Сербии | `eligibility.status=unknown` | Текущий контракт поддерживает только unknown; Remote и сербский сайт сами по себе не подтверждают право работать из Сербии. |
| Seniority и технологии | Общие необязательные списки | Шкала уровня `intern / entry / mid / senior`, все явные уровни/технологии и исходные метки сохраняются. Фильтрация — отдельный этап core. |

`helloworld-rs` согласован с текущим извлечением source через `[a-z-]+`: underscore в source ID был бы обрезан. [lib/dedup.mjs](../../lib/dedup.mjs).

Географический отбор и юридическая/договорная eligibility — разные вещи. Для v1 можно сохранять объявления с сербскими местами, с явным разрешением Сербии и с неизвестной remote-географией; исключать только явно несовместимые ограничения. В проверенной выдаче нет достаточной информации для подтверждения разрешённой Сербии у generic Remote. Сохранение неизвестных записей — принятое продуктовое решение, а не подтверждение доступности. Не выполнять скрытые запросы карточек ради его изменения.

## Зарплата: единицы важнее наличия числа

Наблюдения одной [salary-выдачи](https://www.helloworld.rs/oglasi-za-posao?salary=on):

| Видимый текст | Корректные числа | Налоговая база | Период |
| --- | --- | --- | --- |
| `2.600,00 - 2.700,00 EUR (net)` | 2600–2700 EUR | net | unknown |
| `14,00 - 18,00 EUR (net)` | 14–18 EUR | net | unknown |
| `48.000,00 - 90.000,00 USD (gross)` | 48000–90000 USD | gross | unknown |
| `120,00 - 200,00 USD (gross)` | 120–200 USD | gross | unknown |

Масштаб суммы не доказывает месяц/час/год. В этих карточках период не отображается; в первой дополнительно проверен окружающий HTML. Встречающееся в аналитическом JavaScript `price:1, currency:RSD` описывает commerce-событие и не является зарплатой. RSD-зарплата вакансии в проверенной выборке не найдена.

Текущие [parseSalary](../../lib/normalize.mjs) и [parseCompensation](../../lib/compensation.mjs) не рассчитаны на `2.600,00` и RSD. Минимальное изменение — небольшой парсер формата источника с выходом в существующий `normalizeCompensation`, без смены общих единиц и валютных конвертаций. Неподдерживаемый/неоднозначный формат сохранять как `rawText`, без выдуманных чисел. Legacy `salary` при необходимости формировать из тех же чисел, но downstream должен получать `compensation` с `period=unknown`.

## Что сохраняется в core, а что ещё не поддержано

Проверен текущий соседний checkout core и поставляемый [companion/core-contract.patch](../../companion/core-contract.patch), а не обещание совместимости с любой upstream-версией.

- Прямой plugin-provider передаёт результат `hook.fetch` без проекции полей: [core plugins/_engine.mjs](../../career-ops/plugins/_engine.mjs). Неизвестные поля могут дойти до scan, но это не создаёт фильтрацию или сохранение в интерфейсе.
- Patched [core local-parser](../../career-ops/providers/local-parser.mjs) явно пропускает `locationText`, `locations`, `workArrangement`, `sourceId`, `compensation`, `matchedQueries`, `hasDescription`, `dataLevel`; `eligibility` пропускается только со статусом `unknown`. Top-level `seniority`, `skills` или `tags` в allowlist отсутствуют и будут потеряны на этом пути. Это же видно в [поставляемом patch](../../companion/core-contract.patch).
- В [core scan.mjs](../../career-ops/scan.mjs) location-фильтр читает `job.location`, country-eligibility — `job.description`, salary — `job.salary` вместе с `job.compensation`. Одного нового структурного поля недостаточно для изменения отбора. Нет основания утверждать, что технологии из карточки уже участвуют в content-фильтрах.
- Общий `makeJob` пока не копирует seniority/skills из входа. Простого добавления их в вызов недостаточно. [lib/normalize.mjs](../../lib/normalize.mjs).

Уточнение существующей фильтрации core: настройки уже есть, но они работают с текстом, а не с отдельными тегами источника.

| Настройка `portals.yml` | Что читает сейчас | Значение для HelloWorld |
| --- | --- | --- |
| `skip_tiers: [intern, entry]` | `classifyTier(job.title)`; категории `intern`, `entry`, `mid`, `senior` | Отсеет Junior в заголовке, но не отдельный Junior badge у обычного заголовка. Неизвестный уровень заголовка классификатор относит к `mid`. |
| `title_filter.positive` / `.negative` | `job.title` | Может искать Python в названии, но не в технологии карточки. |
| `content_filter.positive` / `.negative`, необязательный `by_title_keyword` | `job.description`, с выбором правила по совпадению заголовка | Без описания запись проходит этот фильтр, даже если positive задан. В listing-only v1 не фильтрует technology badges. |

Проверено в [scan: чтение config и создание фильтров](../../career-ops/scan.mjs) (`3396–3417`), там же применение `classifyTier(job.title)` (`3647`) и `contentFilter(job.description, …)` (`3669`), [buildContentFilter](../../career-ops/scan.mjs) (`753`, пропуск пустого описания `769`), [title-keywords](../../career-ops/title-keywords.mjs) (`218`) и [classify-tier](../../career-ops/classify-tier.mjs) (`28`). Название настройки — `skip_tiers`; `tiers_classifier` в проверенном коде/конфигурации не найдено. Поведение обычного `Software Engineer → mid` закреплено в [classify-tier-position.test.mjs](../../career-ops/tests/classify-tier-position.test.mjs); текстовые positive/negative и пропуск отсутствующего описания — в [content-filter-word-prefix.test.mjs](../../career-ops/tests/content-filter-word-prefix.test.mjs).

Следовательно, согласованная фильтрация общих структурных полей на границе core — планируемое **расширение**, не существующая настройка. Приоритет явного уровня источника над эвристикой заголовка определяется в отдельной задаче roadmap; неизвестные данные согласовано пропускать. Изменение нельзя выдавать за простое включение YAML-флага.

Решение пользователя после исследования: включить общие структурированные поля уровня/технологий и отдельный этап их фильтрации в career-ops в [план интеграции](../roadmap/helloworld-provider.md). Согласована шкала `intern / entry / mid / senior`: `Junior → entry`, `Intermediate → mid`, `Senior → senior`, с сохранением исходных меток. Это нормализованные значения, а не буквальные значения источника. Отсутствующие/нераспознанные метки остаются неизвестными и сами по себе не исключают вакансию. Все явно указанные уровни и технологии сохраняются списками; техническая форма предложена в плане. Не стоит маскировать эти сведения внутри `description` или `provenance` только ради обхода allowlist.

## Примеры целевого результата, не вывод работающего адаптера

На основе проверенного [Bel-Dev](https://www.helloworld.rs/posao/Data-Engineer/Bel-Dev-d.o.o/760224); без tracking-параметров, HTML и полных текстов:

```json
{
  "title": "Data Engineer",
  "company": "Bel-Dev d.o.o.",
  "url": "https://www.helloworld.rs/posao/Data-Engineer/Bel-Dev-d.o.o/760224",
  "source": "helloworld-rs",
  "sourceId": "760224",
  "transport": "html",
  "location": "Beograd | Hybrid",
  "locationText": "Beograd | Hibrid",
  "locations": ["Beograd"],
  "workArrangement": "hybrid",
  "eligibility": { "status": "unknown" },
  "dataLevel": "listing",
  "hasDescription": false,
  "note": "source: helloworld-rs"
}
```

Фрагмент зарплаты Finductive из [выдачи](https://www.helloworld.rs/oglasi-za-posao?salary=on):

```json
{
  "compensation": {
    "min": 2600,
    "max": 2700,
    "currency": "EUR",
    "period": "unknown",
    "taxBasis": "net",
    "rawText": "2.600,00 - 2.700,00 EUR (net)"
  }
}
```

Для `Rad od kuće` предлагается `location="Remote"`, исходный `locationText`, `locations=[]`, `workArrangement="remote"`, `eligibility={"status":"unknown"}`. Пример новых списков уровня и технологий приведён в плане; `postedAt` отсутствует во всех listing-only примерах.

## Ограничения и следующие проверки

Текущий [URL условий](https://www.helloworld.rs/uslovi-koriscenja) отдаёт загрузочную JS-оболочку; индексированный старый [текст условий](https://helloworld.rs/uslovi-koriscenja) содержит ограничения автоматического использования и передачи контента. Их актуальную полную редакцию прямым HTTP не подтвердили. Свежий footer выдачи всё ещё запрещает скачивание содержимого без разрешения. Разрешение путей robots не снимает этот вопрос. Рекламируемый `/rss/` вернул HTTP 403 и не является проверенным запасным транспортом.

Перед реализацией нужны фикстуры пустой/повреждённой выдачи, отказа доступа, страницы без следующей ссылки, подтверждённого multi-location и нескольких уровней seniority. Для RSD и явного периода оплаты пока нет наблюдаемого примера. HTML-парсер должен различать отсутствие результатов и изменившуюся разметку. Все эти проверки — ограниченная валидация адаптера, не основание добавлять browser fallback, извлечение полных описаний или менять остальные источники.

## Дополнение при реализации, 2026-10-09

В сохранённой keyword-выдаче найден реальный пример нескольких уровней:
`Data Engineering Tech Lead` (Madiff, ID 706747) имеет обе видимые метки
Intermediate и Senior. Они сохранены в сокращённой фикстуре `normal.html`.

Один прямой запрос с заведомо отсутствующей фразой подтвердил: сайт показывает
`(0 oglasa)` и `Trenutno nema oglasa po traženim kriterijumima pretrage.`, но ниже
в том же `__search-results` размещает 30 новых рекомендованных вакансий
(`icampaign=alternate-criteria-results-newest`). Реализованный адаптер возвращает
пустой результат по подтверждённой паре heading/message и не приписывает этим
рекомендациям совпадение с исходным запросом.

Живой запрос реализованного адаптера `q=Python`, одна страница: 30 вакансий,
29 с технологиями и 30 с уровнем, `page-limit`, без полных описаний/`postedAt`.
Это проверка 2026-10-09, не гарантия дальнейшей доступности или объёма.
