# Standalone HH browser tool

`companion/scan-hh.mjs.txt` is separately reviewed executable source, not a plugin module. Release installers put it at **`career-ops/scripts/ru-market/scan-hh.mjs`**, using career-ops's Playwright. The old root `scan-hh.mjs` is a prototype; use the canonical path. `--version` reports tool 0.5.0 and the output carries contract version 2.

API ru-market and the browser collector are separate routes. `hh.mode: auto` stays API-only. The companion runs outside `ctx.fetch` and plugin host restrictions, with an anonymous context, no login/cookie reuse, and stops on access challenges. Install/update refuse locally modified or unmanaged tool files and apply the reviewed `core-contract.patch` only when compatible. They do not edit `portals.yml`. The patch extends local-parser and core filtering/formatting; core updates may require reinstalling it. Removing the API plugin does not remove the companion.

From career-ops, check the browser without visiting HH:

```sh
node scripts/ru-market/scan-hh.mjs --version
node scripts/ru-market/scan-hh.mjs --preflight --channel chrome
```

Missing Playwright, missing browser, and environment launch restrictions have separate messages. No sandbox settings are changed. Use `--channel chromium` for Playwright Chromium; install it through career-ops if absent.

## One batch command

Select an existing `portals.yml` entry containing `ru_market.sources.hh.queries`, or a standalone config with `hh_browser` (see `examples/hh-browser.yml`). Relative config and artifact paths resolve against career-ops Data Root, including its marker/environment overrides. A selected entry supplies queries, page limit, area and title-only; CLI values override it.

```sh
node scripts/ru-market/scan-hh.mjs --config portals.yml --entry 'Russian-language job boards' --pages 2 --channel chrome --artifact-dir data/scan-output/hh-run --scan --dry-run
```

Use your actual entry name. Drop `--dry-run` to have core write the filtered results. Omit `--scan` to collect only. This handles up to 100 queries and 20 pages per query, reusing one anonymous context sequentially. Navigation/markup waits are bounded per page; collection happens outside local-parser's 20-second budget. No temporary JavaScript adapter is needed.

Artifacts include `query-XX.json`, `merged.json`, `queries-summary.json`, `checkpoint.json` and ready-to-use `portals-hh.yml`. With `--scan`, also `scan-receipt.json` and `scan.log`. The generated HH-only config preserves the selected file's scanner filters and excludes other providers. Import an existing cache without repeating network collection:

```sh
CAREER_OPS_PORTALS=/absolute/path/to/hh-run/portals-hh.yml node scan.mjs --json
```

The generated parser invokes the canonical executable with `--import-cache /absolute/path/to/merged.json`, a 20-second timeout and 10 MB buffer. Example: `examples/hh-browser-cache.yml`. Repeat imports use core deduplication. No installer overwrites user configuration.

Add `--resume` with the same collection parameters and artifact directory after interruption. Successful queries stay cached; partial queries resume after their last completed page. Changed parameters/contracts are rejected. SIGINT saves completed work; an access block stops further queries and records them as skipped. Resume is an explicit new attempt, never a challenge bypass.

## Data and diagnostics

Salary uses `compensation: {min?, max?, currency?, period, taxBasis, rawText, diagnostic?}`. Period is month/year/hour/shift/unknown; tax basis is gross/net/unknown. Lower/upper bounds come from the leading amount, never tax prose. Unsupported or ambiguous values retain raw text and diagnostic. No annualization, currency conversion or net/gross conversion occurs. Legacy `salary` remains for API compatibility; compensation takes precedence in the patched core.

For numeric filtering, specify comparable units and tax basis explicitly:

```yaml
salary_filter:
  min: 200000
  currency: RUB
  period: month
  taxBasis: gross
```

Unknown or incompatible currency/period/tax basis skips numeric comparison, preserving the listing. Core prints the original units and tax basis. An upper-only range cannot pass a higher comparable minimum; lower-only ranges have no invented upper limit.

Public query statuses contain `source`, `transport`, `query`, `queryId`, `status`, `completed_pages`, `count`, `stop_reason`, and diagnostic category/message/HTTP status where applicable. API arrays expose `queryStatuses`; browser/cache envelopes expose `sourceStatuses`; the explicit adapter preserves identities in core receipt `source_statuses`. First failures, partial results and valid empty searches remain distinct. `page-limit` means the configured budget ended, not full HH coverage. Cache import exits successfully even for partial caches so core can receive their jobs and diagnostics; collection exits nonzero for failed/partial/skipped queries.

Merged URLs retain every `matchedQueries` entry, fill missing fields and record conflicting observations in `provenance.conflicts`. `locationText`/`locations`, `workArrangement`, and unknown `eligibility` are separate facts. A remote tag does not establish permission to work from Armenia. `dataLevel: listing` and `hasDescription: false` make browser completeness explicit; absent publication dates stay absent. Detail enrichment is optional future work and is never triggered by this command.

Offline verification: `npm test`, `npm run test:integration`, and `HH_BROWSER_CHANNEL=chrome npm run test:dom` (or Chromium by default). DOM tests use local HTML and an isolated core/Data Root, never personal pipeline files. Live smoke remains a separate explicit command.
