# Providers

Status: Reference
Date: 2026-10-10
Type: guide

One page per provider, plus the provider matrix below. The matrix describes the plugin as of 0.7.0 and is the single place where transport, authorization, filters and status of all providers are compared; other documents link here instead of repeating it.

## Provider matrix

| Provider | Transport | Authorization | Status | Enabled by default | Page |
| --- | --- | --- | --- | --- | --- |
| HH (hh.ru) | Browser companion (Playwright) through core `local-parser`; not part of the `ru-market` provider | None (anonymous browser context) | Implemented in 0.7.0 as the only HH transport; the API adapter was removed. Server-side parameters unverified against live HH | Not applicable (separate `portals.yml` entry) | [hh](hh.md) |
| Habr Career | Public HTML listing | None | Implemented | Yes | [habr-career](habr-career.md) |
| GeekJob | Public HTML listing | None | Implemented | Yes | [geekjob](geekjob.md) |
| SuperJob | JSON API `api.superjob.ru` | Required `SUPERJOB_API_KEY` (application Secret key) | Implemented; live access with a key not verified | No | [superjob](superjob.md) |
| Trudvsem (Work in Russia) | JSON API `opendata.trudvsem.ru` | None | Implemented; live checked (see page) | No | [trudvsem](trudvsem.md) |
| getmatch | Undocumented JSON `getmatch.ru/api/offers` | None | Experimental (0.4.0); usage terms and live pagination unverified | No | [getmatch](getmatch.md) |
| HelloWorld.rs | Public HTML listing (Serbia) | None | Implemented (0.6.0); source terms restrict automated use | No | [helloworld-rs](helloworld-rs.md) |

Source selection and order are validated in `lib/config.mjs`: `ru_market.source` is `all` or one source id; `primary_source_order` must contain the two core sources (`habr-career`, `geekjob`), the four, five or all six sources, exactly once (lengths 2, 4, 5, 6 since 0.7.0). Missing optional sources are appended in stable order. `hh` in `primary_source_order`, `source: hh` or `sources.hh` fails with a `config` error pointing to `local-parser`.

## Common behaviour

- Request guard: `lib/http.mjs` allows only HTTPS listing endpoints per host (no credentials, no ports). Timeout 10 s per request, up to two retries for `network`, `server` and `rate-limited` errors (`lib/retry.mjs`); access errors are not retried.
- Request queue: one request at a time per host. Spacing is 750 ms for Habr Career, GeekJob, SuperJob and Trudvsem, and 1000 ms for HelloWorld.rs and getmatch (`lib/queue.mjs`). These are internal conservative settings, not published limits of the sources.
- Output fields shared by all `ru-market` adapters (built by `makeJob` in `lib/normalize.mjs`): `title`, `url` (canonical, tracking parameters removed), `company`, `location`, `note` (`source: <id>`, plus salary text), `source`, `transport`, `sourceId`, `locationText`, `locations`, `workArrangement`, `eligibility: {status: unknown}`, `dataLevel: listing`, `hasDescription`, `matchedQueries`, and when present `description`, `postedAt`, `salary` (`{min, max, currency}`), `compensation`, `skills`, `seniority`, `employment`, `professional_role`, `injectionFlags`. A job without a title or a valid canonical URL is dropped.
- Untrusted text: all source text passes through `lib/untrusted.mjs`; instruction-like patterns produce `injectionFlags`, flagged jobs are kept.
- Statuses: each source reports `sourceStatuses` (`ok`, `partial`, `failed`) and per-query `queryStatuses`; a failure of one source does not stop the others, and failure of all sources is an error.
- Health: `node scripts/health.mjs --career-ops ../career-ops [--source all|getmatch|helloworld-rs]` makes one listing request per source without retries; `all` covers only the enabled default sources (Habr Career, GeekJob). SuperJob and Trudvsem have no health check yet. Browser health for HH is separate (see [hh](hh.md)).

## Adapter details

| Provider | Server-side request parameters sent by the plugin | Options accepted in `ru_market.sources.<key>` | Tests |
| --- | --- | --- | --- |
| habr-career | Category path, `/remote`, `page`; no text search | `enabled`, `mode` (`html`, `auto`), `max_pages`, `categories`, `remote` | `test/run.mjs`, `fixtures/habr-career` |
| geekjob | Page only | `enabled`, `mode` (`html`, `auto`), `max_pages` | `test/run.mjs`, `fixtures/geekjob` |
| superjob | `keyword`, `page`, `count` | `enabled`, `mode` (`api`, `auto`), `max_pages`, `queries`, `per_page` | Inline objects in `test/run.mjs`; no fixtures directory |
| trudvsem | `text`, `limit`, `offset` | `enabled`, `mode` (`api`, `auto`), `max_pages`, `queries`, `per_page` | Inline objects in `test/run.mjs`; no fixtures directory |
| getmatch | `p`, `offset`, `limit`; optional unverified `sa`, `pa`, `se`, `l` | `enabled`, `mode` (`api`, `auto`), `max_pages`, `per_page`, `sa`, `pa`, `se`, `l` | `test/getmatch.mjs`, `fixtures/getmatch` |
| helloworld-rs | `q` | `enabled`, `mode` (`html`, `auto`), `max_pages`, `queries` | `test/helloworld.mjs`, `fixtures/helloworld-rs` |

Defaults and limits: `max_pages` 1 to 20 (shared default 1); `per_page` 1 to 100 (SuperJob 20, Trudvsem 100, getmatch 20); lists such as `queries` take 1 to 20 non-empty strings of at most 500 characters. Unsupported options are rejected for getmatch and HelloWorld.rs.

## Filter matrix

The column "Source offers" for HH was filled from the list given in the revision task; the repository does not record the full set of HH API parameters, so for the other sources the column is marked as not checked. Core filters (`title_filter`, `skip_tiers`, `salary_filter`, `content_filter`, posting age) run only after the provider returns jobs; core providers have no server-side filters.

| Source | Source offers | Plugin sends | Core filters after fetch |
| --- | --- | --- | --- |
| hh (API, removed in 0.7.0) | `experience`, `employment`, `salary`, `only_with_salary`, `professional_role`, `search_field`, `excluded_text` and others | Only `text`, `area`, `schedule`, `period` | Title, description, salary, age |
| hh (browser, companion) | Search parameters on the hh.ru page | `text`, `page`, `area`, plus `search_field`, `excluded_text`, `professional_role`, `only_with_salary` (unverified against live HH) | Same |
| habr-career | Not checked | Category, `remote` | Same |
| geekjob | Not checked | Page | Same |
| superjob | Not checked | `keyword` | Same |
| trudvsem | Not checked | `text` | Same |
| getmatch | Parameters `sa`, `pa`, `se`, `l`, `s`, `from_date`, `to_date`, `sp`, `pl`, `c`, `exclude_applied` inferred from client code ([research](../research/getmatch.md)). UNVERIFIED: values and behaviour were not observed | Nothing by default; opt-in `sa`, `pa`, `se`, `l` | Same, only on the loaded pages |
| helloworld-rs | Not checked | `q` | Same; `seniority` and `skills` are returned but not filtered ([core-job-filters](../roadmap/core-job-filters.md)) |

## Related

- Architecture: [components](../architecture/components.md), [data flow](../architecture/data-flow.md).
- Revision that produced the 0.7.0 provider decisions: [provider-architecture-review](../roadmap/provider-architecture-review.md).
- Candidates without adapters: [Armenia ATS research](../research/armenia-ats.md), [Yandex Jobs research](../research/yandex-jobs.md), [Serbian providers plan](../roadmap/serbia-providers.md).
