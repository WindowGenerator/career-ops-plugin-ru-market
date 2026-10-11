# Standalone HH browser tool

`companion/scan-hh.mjs.txt` is separately reviewed executable source, not a plugin module. Release installers put it at **`career-ops/scripts/ru-market/scan-hh.mjs`**, using career-ops's Playwright, together with the shared module **`scripts/ru-market/lib/untrusted.mjs`** (the same `lib/untrusted.mjs` the plugin uses; the companion imports it, there is no embedded copy; the small compensation parser is inlined and a test checks it against `lib/compensation.mjs`). `scripts/ru-market/lib/` is shared and not HH-specific, so future browser providers can reuse it. The old root `scan-hh.mjs` is a prototype; use the canonical path. `--version` reports tool 0.8.0 and the output carries contract version 3 (a cache of contract 2 is rejected: regenerate it).

Since 0.7.0 this companion is the only HH transport: the plugin no longer has an HH API adapter, and `hh` in `ru_market` configuration is rejected with a migration error. The companion runs outside `ctx.fetch` and plugin host restrictions, with an anonymous context, no login/cookie reuse, and stops on access challenges. HH's terms require programmatic access through the API (<https://hh.ru/article/33205>), so anonymous browser collection remains a legal and technical risk you accept. Install/update refuse locally modified or unmanaged files (the tool and the shared module, checked by `sha256` in `scan-hh.install.json`). They do not edit `portals.yml` and never touch career-ops core: since 0.8.0 there are no core patches, the companion works with stock upstream career-ops that contains upstream PR #4697 (`local-parser` passes a parser's extra job fields through). Removing the plugin does not remove the companion.

From career-ops, check the browser without visiting HH:

```sh
node scripts/ru-market/scan-hh.mjs --version
node scripts/ru-market/scan-hh.mjs --preflight --channel chrome
```

Missing Playwright, missing browser, and environment launch restrictions have separate messages. No sandbox settings are changed. Use `--channel chromium` for Playwright Chromium; install it through career-ops if absent.

## One batch command

Add a **separate `portals.yml` entry** with an `hh_browser` block and a `local-parser` parser that points back at it (see `examples/hh-browser.yml`). `ru_market.sources.hh` is no longer read. A standalone file with a top-level `hh_browser` block is also accepted. The block is re-read on every run, so editing it needs no reinstall. Relative config and artifact paths resolve against career-ops Data Root, including its marker/environment overrides. The selected block supplies queries and options; CLI values override it. Unknown keys are rejected.

| `hh_browser` key | CLI flag | Meaning |
| --- | --- | --- |
| `queries`, `pages`, `area`, `channel`, `headed`, `retries`, `artifactDir`, `titleOnly` | `--query`, `--pages`, `--area`, `--channel`, `--headed`, `--retries`, `--artifact-dir`, `--title-only` | as before |
| `search_field` (list of `name`, `company_name`, `description`) | `--search-field a,b` | server-side `search_field` |
| `excluded_text` | `--excluded-text` | server-side `excluded_text` |
| `professional_role` (numeric IDs) | `--professional-role 96,10` | server-side `professional_role` |
| `only_with_salary` | `--only-with-salary` | server-side `only_with_salary=true` |
| `timeout_ms` | `--timeout-ms` | companion deadline, see below |

These four server-side parameters are the only ones the companion sends beyond `text`, `page` and `area`. `experience`, `employment` and salary limits are not sent: the companion does not extract them from the results page (unverified markup), so those Job fields stay unknown and core filters what it can after collection. Server-side parameters were not verified against live HH in this change.

`--no-artifacts` (config route, no `--scan`) collects into a temporary folder and prints only the JSON envelope; this is what a `local-parser` entry uses.

```sh
node scripts/ru-market/scan-hh.mjs --config portals.yml --entry 'Russian-language job boards' --pages 2 --channel chrome --artifact-dir data/scan-output/hh-run --scan --dry-run
```

Use your actual entry name. Drop `--dry-run` to have core write the filtered results. For routine scans put the same command into the entry's `parser.args` (`[--config, portals.yml, --entry, HH browser, --no-artifacts]`) and run plain `node scan.mjs`. Omit `--scan` to collect only. This handles up to 100 queries and 20 pages per query, reusing one anonymous context sequentially. Navigation/markup waits are bounded per page; collection happens outside local-parser's 20-second budget. No temporary JavaScript adapter is needed.

Artifacts include `query-XX.json`, `merged.json`, `queries-summary.json` (with a `queries` list: per-query state, completeness and failure reason), `checkpoint.json` and ready-to-use `portals-hh.yml`. With `--scan`, also `scan-receipt.json` and `scan.log`. The generated HH-only config preserves the selected file's scanner filters and excludes other providers. Import an existing cache without repeating network collection:

```sh
CAREER_OPS_PORTALS=/absolute/path/to/hh-run/portals-hh.yml node scan.mjs --json
```

The generated parser invokes the canonical executable with `--import-cache /absolute/path/to/merged.json`, a 20-second timeout and 10 MB buffer. Example: `examples/hh-browser-cache.yml`. Repeat imports use core deduplication. No installer overwrites user configuration.

Add `--resume` with the same collection parameters and artifact directory after interruption. Successful queries stay cached; partial queries resume after their last completed page. Changed parameters/contracts are rejected. SIGINT saves completed work; an access block stops further queries and records them as skipped. Resume is an explicit new attempt, never a challenge bypass.

## Data and diagnostics

Salary uses `compensation: {min?, max?, currency?, period, taxBasis, rawText, diagnostic?}`. Period is month/year/hour/shift/unknown; tax basis is gross/net/unknown. Lower/upper bounds come from the leading amount, never tax prose. Unsupported or ambiguous values retain raw text and diagnostic. No annualization, currency conversion or net/gross conversion occurs. `salary` is the midpoint of a complete RUB monthly range; everything else is only in `compensation`. Precisely: `salary` is `{min, max, currency: 'RUB'}` with `min = max = (low + high) / 2`, and only when the source shows both bounds, the currency is RUB and the period is month (a single exact amount counts as both bounds). A one-sided range, another currency, another period or an unknown period leaves `salary` out; the exact range, raw text, period and tax basis remain in `compensation`. Core's `salary_filter` compares only `salary` numbers and ignores period, tax basis and `compensation`, so with the midpoint a range such as 200 000-350 000 is compared as 275 000, and a vacancy without `salary` always passes the filter. The companion does not filter by salary itself.

**Failures and timeouts.** In `--query`, `--config` (without `--scan`) and cache modes the companion exits 0 even when a query was blocked, timed out or only partly collected: it prints the jobs it has and nothing else on stdout (no status field), and writes one line per affected query to stderr (`HH <queryId>: partial (access) after 1 page(s): ...`). In batch mode the same state (`status`, `category`, `message`, `completed_pages`, `failed_page`, `stop_reason`) is stored in `checkpoint.json`, `query-XX.json` and the `queries` list of `queries-summary.json`. Core receives no status, so a partial or blocked run looks like a smaller result in the scan summary; check stderr or the summary file. Exit 1 remains for configuration errors and for incomplete collection with `--scan`. Core kills a local-parser process at `parser.timeout_ms` (default 20 s) and loses its output, so set `hh_browser.timeout_ms` (checked between pages, category `timeout`) below `parser.timeout_ms`, which must also cover one slow page (about 60 s); a rough budget is queries x pages x 15 s.

The per-query state in the artifact files contains `source`, `transport`, `query`, `queryId`, `status`, `completed_pages`, `count`, `stop_reason`, and diagnostic category/message/HTTP status where applicable. First failures, partial results and valid empty searches remain distinct. `page-limit` means the configured budget ended, not full HH coverage. `injection_flagged` counts jobs whose text matched an instruction-like pattern. Cache import re-sanitises jobs and rejects caches of another contract version (`--import-cache` of a contract 2 file fails with "regenerate the cache").

**Untrusted text.** Title, company, location and note pass through `scripts/ru-market/lib/untrusted.mjs`: invisible Unicode, bidi and control characters and HTML comments are removed, lengths capped, and English/Russian instruction-like patterns produce `injectionFlags` (kept, never dropped). The flags stay on the job as information only: core does not read `injectionFlags` and has no trust rule for it, and the agent instructions in `skill.md` tell the model to treat vacancy text as untrusted data. `employment` and `professional_role` are not extracted by the companion and stay unknown.

Merged URLs retain every `matchedQueries` entry, fill missing fields and record conflicting observations in `provenance.conflicts`. `locationText`/`locations`, `workArrangement`, and unknown `eligibility` are separate facts. A remote tag does not establish permission to work from Armenia. `dataLevel: listing` and `hasDescription: false` make browser completeness explicit; absent publication dates stay absent. Detail enrichment is optional future work and is never triggered by this command.

Offline verification: `npm test`, `npm run test:integration`, and `HH_BROWSER_CHANNEL=chrome npm run test:dom` (or Chromium by default). The integration and browser tests need `CAREER_OPS_ROOT` to point to a stock, unpatched career-ops checkout (CI pins the upstream commit). DOM tests use local HTML and an isolated copy of it as core/Data Root, never personal pipeline files. Live smoke remains a separate explicit command.
