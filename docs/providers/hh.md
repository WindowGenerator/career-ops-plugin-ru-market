# HH: browser companion only

Status: Implemented
Date: 2026-10-10
Type: guide

## Status

Since 0.7.0 the `ru-market` plugin does not call the HH API: the adapter `lib/hh.mjs`, the variable `HH_ACCESS_TOKEN` and the host `api.hh.ru` are removed. The API answered `403` already on the first listing page. HH is collected by a separately installed browser companion through core `provider: local-parser`. The companion is not part of the plugin and runs outside plugin host restrictions.

## Transport and access

- Transport: Playwright (from career-ops) in an anonymous browser context on `https://hh.ru/search/vacancy`; no login, no cookie reuse; it stops on access challenges. About 1 s between pages.
- Installation: `install.sh` puts `scripts/ru-market/scan-hh.mjs` and the shared module `scripts/ru-market/lib/untrusted.mjs` into career-ops and applies the reviewed core patch (`companion/core-contract.patch`); it does not edit `portals.yml`. Details: [companion/README.md](../../companion/README.md).
- Authorization: none.
- Legal and technical risk: the [HH terms](https://hh.ru/article/33205) require programmatic access through the API; the companion uses an anonymous browser context and stops on access checks. The user accepts this risk.

### Migration from 0.6.x

1. Remove `hh` from `ru_market.primary_source_order` (allowed list lengths are now 2, 4, 5 or 6; `habr-career` and `geekjob` are mandatory) and the `sources.hh` block from `portals.yml`; otherwise the plugin throws a `config` error.
2. Remove `HH_ACCESS_TOKEN` from `.env`: it is no longer read.
3. Add a separate `HH browser` entry with an `hh_browser` block from the example; move queries from `sources.hh.queries` to `hh_browser.queries`, `area` and `max_pages` to `area` and `pages`, `title_only` to `search_field: [name]`. The fields `schedule`, `period`, `host`, `locale`, `per_page` are not supported.
4. Reinstall the plugin and the companion with the command from the README: it upgrades the core patch and installs the shared module `scripts/ru-market/lib/untrusted.mjs`.

## Configuration

A separate `portals.yml` entry with a `local-parser` parser that points back at itself; the `hh_browser` block is re-read on every run, so editing it needs no reinstall. Full example: [examples/hh-browser.yml](../../examples/hh-browser.yml); cache import example: [examples/hh-browser-cache.yml](../../examples/hh-browser-cache.yml).

```yaml
job_boards:
  - name: HH browser
    provider: local-parser
    careers_url: https://hh.ru/search/vacancy
    hh_browser:
      queries: [Senior Python, Python Backend]
      pages: 2
      channel: chrome
      search_field: [name]
      timeout_ms: 100000
    parser:
      command: node
      script: scripts/ru-market/scan-hh.mjs
      args: [--config, portals.yml, --entry, HH browser, --no-artifacts]
      timeout_ms: 180000
      max_buffer_bytes: 10000000
```

Keys of `hh_browser`: `queries`, `pages`, `area`, `channel`, `headed`, `retries`, `artifactDir`, `titleOnly`, `search_field`, `excluded_text`, `professional_role`, `only_with_salary`, `timeout_ms`. The key table with CLI flags is in [companion/README.md](../../companion/README.md). Set `parser.timeout_ms` above `hh_browser.timeout_ms` by about 60 s: core kills a parser at its timeout (default 20 s) and loses its output.

## Filters

Supported (sent to HH by the companion; unverified against live HH in 0.7.0):

- `area` (explicit HH area ID; no eligibility inference), `queries`, `pages`.
- `search_field` (`name`, `company_name`, `description`), `excluded_text`, `professional_role` (numeric role IDs), `only_with_salary`.

Not supported:

- `experience`, `employment` and salary limits are not sent to HH and are not extracted from the results page (unverified markup); those Job fields stay unknown and core filters what it can after collection.
- `schedule`, `period`, `host`, `locale`, `per_page` (old API options).

## Output fields

Jobs come as a JSON envelope with `jobs` and `sourceStatuses`. Fields: `title`, `url`, `company`, `location` (`locationText`/`locations`), `compensation` (`{min?, max?, currency?, period, taxBasis, rawText, diagnostic?}`; period is month, year, hour, shift or unknown; tax basis is gross, net or unknown) and `salary` (`{min, max, currency}`), `workArrangement` from a remote tag, `matchedQueries`, `provenance` (conflicts between merged observations), `injectionFlags`, `dataLevel: listing`, `hasDescription: false`, `eligibility: {status: unknown}`. Publication dates stay absent when not shown. `employment` and `professional_role` are not extracted by the companion. A remote tag does not establish permission to work from any particular country.

Artifacts (without `--no-artifacts`): `query-XX.json`, `merged.json`, `queries-summary.json`, `checkpoint.json`, `portals-hh.yml`; with `--scan` also `scan-receipt.json` and `scan.log`.

## Limits

- Up to 100 queries and 20 pages per query in one run, one anonymous context used sequentially.
- Core kills a `local-parser` process at `parser.timeout_ms` (default 20 s); a rough budget is queries x pages x 15 s.
- `hh_browser.timeout_ms` is a deadline checked between pages; on expiry the companion exits 0 with the jobs collected so far and `sourceStatuses` `partial` or `failed`, category `timeout`.
- `page-limit` means the configured budget ended, not full HH coverage.

## Known issues

- The anonymous browser collection remains a legal and technical risk (see above).
- Server-side parameters were not verified against live HH.
- Core processes `portals.yml` entries in parallel, so duplicates between the HH entry and the `ru-market` entry are won by the entry that finishes first. To make HH data win, run HH as a separate scan first (`node scan.mjs --company "HH browser"`); see the README.
- Core updates may require reinstalling the core patch; local edits of the companion files block updates.

## Verification

- Tests: `npm test` (offline, includes `test/core-patch.mjs`), `npm run test:integration` (`test/integration.sh`, `test/browser.sh`, `test/companion-install.sh`), `npm run test:dom` (real DOM fixtures in `fixtures/hh-browser`, isolated core).
- Health check (from career-ops): `node scripts/ru-market/scan-hh.mjs --preflight --channel chrome`; tool version: `--version`.
- Live smoke on 2026-10-07 (companion tool 0.5.0, before the 0.7.0 changes): two pages, 40 unique vacancies, 11 compensation fields, no access challenge; see [reports/hh-live-smoke-2026-10-07.json](../../reports/hh-live-smoke-2026-10-07.json).
