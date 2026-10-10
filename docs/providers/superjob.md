# SuperJob

Status: Implemented
Date: 2026-10-10
Type: guide

## Status

Implemented in 0.3.0 as an opt-in source of the `ru-market` provider. Disabled by default. Verified with local tests only: live access with an application key has not been verified.

## Transport and access

- JSON API `https://api.superjob.ru/2.0/vacancies/` through `ctx.fetchJson`, adapter `lib/superjob.mjs`. `mode` accepts `api` and `auto`.
- Authorization: `SUPERJOB_API_KEY` (the application's Secret key, not a user OAuth2 token) must be set in the career-ops `.env`. The plugin sends it only to `api.superjob.ru` as the `X-Api-App-Id` header; without it the request fails with a `config` error. The variable is listed in `optionalEnv` in `manifest.json`.
- Host `api.superjob.ru` is declared in `manifest.json`; `lib/http.mjs` allows only `/2.0/vacancies/`.

## Configuration

```yaml
job_boards:
  - name: Russian-language job boards
    provider: ru-market
    ru_market:
      source: all
      sources:
        superjob:
          enabled: true # requires SUPERJOB_API_KEY in career-ops .env
          queries: [Python backend]
```

Options: `enabled` (default false), `mode`, `max_pages` (1-20), `queries` (1-20 strings; without it a single empty query is sent), `per_page` (1-100, default 20). To include it under `source: all`, set `sources.superjob.enabled: true`.

## Filters

Supported (request level): `keyword` (from `queries`), `page`, `count` (from `per_page`).

Not supported: any other SuperJob API filter. Core filters apply after collection.

## Output fields

Common fields of [all adapters](README.md#common-behaviour), plus:

- `title` from `profession`, `company` from `firm_name`, `location` from the town and place of work.
- `description` from `work`, `candidat` and `compensation` joined.
- `postedAt` from `date_published` (epoch seconds), when valid.
- `salary` and `compensation` from `payment_from`/`payment_to` for the currencies RUB, USD, EUR, KZT, BYN, unless the salary is by agreement.
- `employment` from `type_of_work` and `professional_role` from `catalogues` (explicit source labels only; the API field names have not been verified against live responses; unknown otherwise).

## Limits

- Request spacing 750 ms, one request at a time; timeout 10 s; up to two retries for network, server and rate-limit errors.
- Pagination: the `page` parameter is zero-based; `hasNext` follows the `more` flag of the response.

## Known issues

- On 30 September 2026 the developer console handled the OAuth2 flow incorrectly, so registering an application and obtaining a Secret key for a live check was not yet possible. For public vacancy search the plugin needs the application Secret key (see the [API documentation](https://api.superjob.ru/)).
- Live verification with a key is an open roadmap item in the README.
- A missing key is detected only at request time (status `failed`, category `config`), not at configuration parsing.

## Verification

- Tests: `npm test` (`test/run.mjs`, inline response objects; there is no `fixtures/superjob` directory).
- Health check: none yet; `scripts/health.mjs` does not select SuperJob (monitoring of SuperJob and Trudvsem availability is an open roadmap item in the README).
