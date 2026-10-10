# Habr Career

Status: Implemented
Date: 2026-10-10
Type: guide

## Status

Implemented since 0.1.0 as a source of the `ru-market` provider. Enabled by default and a core source of `primary_source_order` (the default primary board for deduplication). Live reachability was checked on 2026-09-27 (0.1.0) and the public listing again after the 0.3.1 fixes.

## Transport and access

- Public HTML listing `https://career.habr.com/vacancies[/<category>][/remote]`, parsed in `lib/habr-career.mjs`. No login, cookies or application submission.
- `mode` accepts `html` and `auto`; both use the same HTML route.
- Authorization: none.
- Host `career.habr.com` is declared in `manifest.json`; `lib/http.mjs` allows only `/vacancies`, an optional category and `/remote`.
- A challenge, CAPTCHA or login wall gives an `access` error: do not bypass it, do not use account access and do not request employer sites.

## Configuration

```yaml
job_boards:
  - name: Russian-language job boards
    provider: ru-market
    ru_market:
      source: all
      sources:
        habr_career:
          enabled: true
          mode: html
          max_pages: 3
          categories:
            - programmist_python
            - backend_razrabotchik
          remote: true
```

Options: `enabled` (default true), `mode`, `max_pages` (1-20, defaults to the shared `max_pages`), `categories` (1-20 category slugs matching `[a-z0-9_]+`; default: the whole listing), `remote` (boolean, default false). See also [examples/portals.yml](../../examples/portals.yml).

## Filters

Supported (request level): category path, `/remote`, pagination.

Not supported: text search; there is no server-side query parameter. Core filters (`title_filter`, `content_filter`, `salary_filter`, age) apply after collection.

## Output fields

Common fields of [all adapters](README.md#common-behaviour), plus:

- `company`: the company name only; the company rating is not appended.
- `location`: the unique card chips, joined with ` / `, excluding seniority chips (Intern, Junior, Middle, Senior, Lead, Principal).
- `description`: the card description.
- `postedAt`: only when the card date is not an "updated" date.
- `salary` and `compensation`: the card salary; a market-estimate salary (predicted) is not recorded as the vacancy salary.

## Limits

- Request spacing 750 ms, one request at a time; timeout 10 s; up to two retries for network, server and rate-limit errors.
- `max_pages` at most 20. Cards without descriptions produce possible cross-listings rather than automatic merges.

## Known issues

- Before 0.3.1 the company rating was appended to the company name and the forecast text for similar specialists (shown on the page as `Похожие специалисты получают…`) was recorded as the vacancy salary; fixed in 0.3.1.
- Cross-board deduplication needs `source: all`; separate source calls cannot preserve alternative links across calls.

## Verification

- Tests: `npm test` (`test/run.mjs` with `fixtures/habr-career`: normal, page 2, empty, broken, challenge).
- Health check: `node scripts/health.mjs --career-ops ../career-ops` (default `all` includes Habr Career); also run by the scheduled workflow `.github/workflows/health.yml`.
