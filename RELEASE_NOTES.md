## 0.7.0 - HH via browser companion only, prompt-injection guard (BREAKING)

Breaking change: the HH API adapter is removed.

- Removed `lib/hh.mjs`, `fixtures/hh`, `HH_ACCESS_TOKEN`, the `api.hh.ru` host and the `hh` source.
  `hh` in `primary_source_order`, `source: hh` or `sources.hh` now fails with a `config` error that
  points to `local-parser`. Default sources are `habr-career` and `geekjob`; allowed
  `primary_source_order` lengths are 2, 4, 5 or 6 (previously 3, 5, 6 or 7).
- Migration: (1) remove `hh` from `primary_source_order` and `sources.hh` from `portals.yml`;
  (2) drop `HH_ACCESS_TOKEN` from `.env`; (3) add a separate `HH browser` entry with an
  `hh_browser` block and a `local-parser` parser (see `examples/hh-browser.yml`, `docs/providers/hh.md`);
  (4) rerun `install.sh`: it installs the companion, the shared module
  `scripts/ru-market/lib/untrusted.mjs` (refused if locally modified) and upgrades the core patch.
  Core updates may require reinstalling the patch.
- Companion: `hh_browser` config in its own entry, server-side `search_field`, `excluded_text`,
  `professional_role`, `only_with_salary` (unverified against live HH), `timeout_ms` deadline,
  `--no-artifacts`. Blocks, timeouts and partial runs exit 0 with partial jobs and `sourceStatuses`
  (`partial`/`failed`, reason, completed pages), which core reports as source errors.
- New `lib/untrusted.mjs`: invisible Unicode, bidi and control characters, HTML comments removed,
  length caps, English/Russian instruction patterns give `injectionFlags` (jobs kept). Counts appear
  as `injection_flagged` in `sourceStatuses`. With the core patch and `trust_filter` enabled, one
  `prompt-injection-suspected` trust flag and trustScore -30 per job.
- `salary` is now `{min, max, currency}` (was `{from, to}`); `compensation` stays the source of truth.
- New optional Job fields `employment` and `professional_role` (filled only from explicit
  source labels: SuperJob and Trudvsem, unverified field names; unknown otherwise).
- Combined core patch: local-parser passes `employment`, `professional_role`, `injectionFlags`,
  accepts `{min,max}` salary so `salary_filter` uses it; trust validator rule for injection flags.
- Experimental, unverified, opt-in getmatch filters `sa`, `pa`, `se`, `l`.
- Note: core processes `portals.yml` entries in parallel, so duplicates between entries are won by
  the entry that finishes first, not the first in the file (see README).

## 0.6.0 — optional HelloWorld.rs

- Added opt-in `helloworld-rs` HTML keyword search with bounded pagination,
  numeric-ID deduplication, query diagnostics and partial-results recovery.
- Preserves explicit location/work arrangement, Serbian-format compensation,
  multiple seniority labels and technology tags. Unknown values stay unknown;
  listing expiry dates are not publication dates. Empty searches exclude the
  site's unrelated newest-job recommendations.
- New optional Job fields: `seniority: { levels, rawLabels }` and `skills`.
  Core filtering and local-parser passthrough remain a separate roadmap task.
- Health supports `--source helloworld-rs` with one Python listing request.
  No browser fallback or detail requests. Source terms/access limitations are
  documented in [docs/providers/helloworld-rs.md](docs/providers/helloworld-rs.md).

## 0.5.0 — Reproducible HH browser batches

- Added config-driven HH batch collection, cache import, HH-only scan config,
  query diagnostics/provenance, anonymous context reuse, checkpoint/resume,
  browser preflight and version reporting. API/browser routes remain separate.
- Fixed lower-bound salary parsing when tax prose contains `до` ("up to"). Explicit
  compensation preserves month/year/hour/shift units and gross/net/unknown;
  the reviewed core patch adds filtering and formatting without annualization.
- Install/update protect local tool edits, upgrade the previous parser patch
  and restore it when core changes are incompatible. User config stays intact.
- Added real DOM fixtures, isolated pipeline/repeat-import tests and CI Chromium
  checks. Offline provider, integration, DOM and core regressions passed.
- Live HH smoke on 2026-10-07: two pages, 40 unique vacancies, 11 compensation
  fields; no access challenge, budget stopped at page-limit. No pipeline import.
- Browser results remain listing metadata; geographic eligibility is unknown.
  Optional detail enrichment remains deferred. getmatch remains opt-in.

## 0.4.1

- Removed the ripgrep dependency from installer verification so integration
  runs on standard GitHub Ubuntu runners. The stable 0.4.0 tag did not publish
  a release because the new integration gate caught this missing tool.
- Includes the HH companion, optional getmatch source and release checks
  described below.

## 0.4.0 — HH browser companion and optional getmatch

- Added an optional sixth source `getmatch` through the existing ru-market provider.
  Disabled by default; reads listing metadata only, excludes promotions/archive,
  preserves territorial remote restrictions and omits ambiguous timestamps.
- Pagination follows metadata and can continue through filtered pages. Repeated
  IDs/offsets produce explicit failures or partial results. Dedup uses numeric ID.
- Added `getmatch.ru` to declared hosts; upgrading the plugin may require renewed
  host consent through career-ops. Requests are restricted to `/api/offers`.
- Health only checks getmatch with explicit `--source getmatch`. Fixtures and
  integration are synthetic/offline; live pagination and usage conditions remain
  unverified. getmatch remains opt-in with an experimental API contract.

- Added a separately installed HH browser companion using career-ops Playwright.
  Release installers protect local companion edits and apply the reviewed
  local-parser metadata extension only when its patch applies cleanly.
- HH live check: two pages, 40 unique vacancies, 11 salaries. Core extension
  committed locally as `e04e21ee`; the release carries the provider patch.

- Fixed installer tests for clean and already-patched career-ops checkouts.
  CI now pins career-ops 1.34.0 at `8c9aae34244ec2f79d1d21c05a34c5de608e7747`.
- Release publication requires the Node 18/22/24 matrix and integration checks
  to pass through the same reusable workflow as normal pushes.

## 0.3.1

Fixed Trudvsem (Work in Russia) pagination: the `offset` parameter means the page
number. Previously a request for the second page with `limit=100` sent `offset=100`
and received HTTP 500. Diagnostics now give the search query number, the page and
the HTTP status without vacancy text or the search string.

Habr Career no longer appends the rating to the company name and no longer records
the forecast `Похожие специалисты получают…` ("similar specialists receive...") as the
vacancy salary. The live Trudvsem search after the fix returned 200 unique vacancies
over two pages; the public Habr listing was checked separately. HH still answers
`403`; SuperJob without an application key was not verified.

## 0.3.0

Added SuperJob and Trudvsem (Work in Russia) through public APIs. Both sources are
disabled by default; SuperJob needs the application's `SUPERJOB_API_KEY`.
A live Trudvsem request with a Python search was checked. SuperJob was checked with
local tests without a user key; live access has not been verified yet.

## 0.2.1

Shortened the README. The release now includes `install.sh` and `update.sh` with the
pinned SHA of the release commit. The scripts use the standard career-ops CLI and
enable the plugin after installation.

## 0.2.0

Verified implementation commit: `8f2435b7d7cf018e3cc169b996181e2c0f0030a9`.
The exact SHA of the release commit is given in the published GitHub notes and the
attached `ru-market.json`.

The HH API accepts the registered application's `HH_ACCESS_TOKEN` from the
environment. HH HTML search was not added: the site terms forbid automated parsing.
After the first HH access refusal its remaining requests are stopped. The provider
returns the status of each source for the partial-result report. The cause of the
observed 403 remains unknown; a token does not guarantee access.

A combined scan continues with Habr Career and GeekJob after an HH refusal. With an
updated core scanner the final JSON contains `status: partial`, `source_statuses`
per board and the HH error. The local core change was saved as a separate commit
`5ab6b06f4ea46ade51a7c7fc3a0456cba6f9aa75`; it is not part of this plugin.

## 0.1.0

Initial ru-market provider for career-ops: HH public API, Habr Career and
GeekJob public HTML, aggregate deduplication with alternative URLs, independent
host queues, bounded retries and partial results. No runtime dependencies,
OAuth, browser automation or application submission.

Validated with synthetic fixtures and the existing career-ops scanner in an
isolated checkout. Live Habr/GeekJob checks passed on 2026-09-27; HH returned
HTTP 403 forbidden from the development environment. HH live availability
is not confirmed; use source-level enabled flags where necessary.

Known limitations: current core drops Retry-After error headers; unlabelled
GeekJob dates are omitted; listing cards without descriptions produce possible
cross-listings rather than automatic merges. Platform terms are linked in README;
robots policy does not authorize redistribution of vacancy content.

Install using the exact commit SHA shown in the attached ru-market.json.
The plugin is community-unverified until the official registry accepts it.
