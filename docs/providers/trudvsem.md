# Trudvsem (Work in Russia)

Status: Implemented
Date: 2026-10-10
Type: guide

## Status

Implemented in 0.3.0 as an opt-in source of the `ru-market` provider (the portal is named `Работа России` in Russian). Disabled by default. A live request with a Python search was checked in 0.3.0, and after the 0.3.1 pagination fix a live search returned 200 unique vacancies over two pages.

## Transport and access

- Public JSON API `https://opendata.trudvsem.ru/api/v1/vacancies` through `ctx.fetchJson`, adapter `lib/trudvsem.mjs`. `mode` accepts `api` and `auto`.
- Authorization: none.
- Host `opendata.trudvsem.ru` is declared in `manifest.json`; `lib/http.mjs` allows only `/api/v1/vacancies`.

## Configuration

```yaml
job_boards:
  - name: Russian-language job boards
    provider: ru-market
    ru_market:
      source: all
      sources:
        trudvsem:
          enabled: true
          queries: [Python backend]
```

Options: `enabled` (default false), `mode`, `max_pages` (1-20), `queries` (1-20 strings; without it a single empty query is sent), `per_page` (1-100, default 100). To include it under `source: all`, set `sources.trudvsem.enabled: true`.

## Filters

Supported (request level): `text` (from `queries`), `limit` (from `per_page`), `offset`.

Not supported: any other API filter. Core filters apply after collection.

## Output fields

Common fields of [all adapters](README.md#common-behaviour), plus:

- `title` from `job-name`, `company` from `company.name`, `location` from the first address or the region name.
- `description` from `duty`, `requirements` and `qualification` joined.
- `postedAt` from `creation-date`.
- `salary` and `compensation` from `salary_min`/`salary_max`, only for rouble amounts.
- `employment` from `employment` and `professional_role` from `category.specialisation` (explicit source labels only; the API field names have not been verified against live responses; unknown otherwise).

## Limits

- Request spacing 750 ms, one request at a time; timeout 10 s; up to two retries for network, server and rate-limit errors.
- Pagination: the `offset` parameter is a page number (zero-based), not an item offset; `hasNext` follows `meta.total`.
- Error diagnostics contain only the endpoint, `limit` and `offset`, never the search text (it may contain personal data).

## Known issues

- Before 0.3.1 a second page with `limit=100` sent `offset=100` and received HTTP 500; fixed by treating `offset` as a page number.
- The API field names for `employment` and `professional_role` are unverified.

## Verification

- Tests: `npm test` (`test/run.mjs`, inline response objects including a partial server error; there is no `fixtures/trudvsem` directory).
- Health check: none yet; `scripts/health.mjs` does not select Trudvsem (see the README roadmap).
