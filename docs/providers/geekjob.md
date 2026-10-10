# GeekJob

Status: Implemented
Date: 2026-10-10
Type: guide

## Status

Implemented since 0.1.0 as a source of the `ru-market` provider. Enabled by default and a core source of `primary_source_order`. Live reachability was checked on 2026-09-27 (0.1.0).

## Transport and access

- Public HTML listing `https://geekjob.ru/vacancies/` (page `N` as `/vacancies/N`), parsed in `lib/geekjob.mjs`. No login, cookies or application submission.
- `mode` accepts `html` and `auto`; both use the same HTML route.
- Authorization: none.
- Host `geekjob.ru` is declared in `manifest.json`; `lib/http.mjs` allows only `/vacancies/` with an optional numeric page.
- A challenge, CAPTCHA or login wall gives an `access` error: do not bypass it.

## Configuration

```yaml
job_boards:
  - name: Russian-language job boards
    provider: ru-market
    ru_market:
      source: all
      sources:
        geekjob:
          enabled: true
          mode: html
          max_pages: 5
```

Options: `enabled` (default true), `mode`, `max_pages` (1-20, defaults to the shared `max_pages`). See also [examples/portals.yml](../../examples/portals.yml).

## Filters

Supported (request level): pagination only.

Not supported: text search, category, location or remote filters. Core filters apply after collection.

## Output fields

Common fields of [all adapters](README.md#common-behaviour), plus:

- `company`, `location` (the unique info lines of the card, excluding salary), `description` (card description).
- `salary` and `compensation` from the card salary text.
- `postedAt`: only when the card carries an explicit publication marker (a `datePosted` attribute or an explicit published label); unlabelled listing dates are omitted.

## Limits

- Request spacing 750 ms, one request at a time; timeout 10 s; up to two retries for network, server and rate-limit errors.
- `max_pages` at most 20.

## Known issues

- Unlabelled GeekJob dates are omitted (listing timestamps are not explicitly publication dates).
- Cards without descriptions produce possible cross-listings rather than automatic merges.

## Verification

- Tests: `npm test` (`test/run.mjs` with `fixtures/geekjob`: normal, page 2, empty, broken, challenge).
- Health check: `node scripts/health.mjs --career-ops ../career-ops` (default `all` includes GeekJob); also run by the scheduled workflow `.github/workflows/health.yml`.
