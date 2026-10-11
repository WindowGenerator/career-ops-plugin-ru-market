# HH companion: alternatives to patching career-ops core

Status: Implemented
Date: 2026-10-11
Type: research

## Question

The plugin collects hh.ru vacancies through a browser companion (`companion/scan-hh.mjs.txt`) and three monkey-patches of the upstream career-ops core (`companion/core-contract.patch`, `core-contract-0.6.patch`, `local-parser.patch`). The owner dislikes patching core. What realistic alternatives remove or minimise the patch, and what do they cost in effort, maintenance and legal exposure? This is a technical and terms-of-use study, not legal advice. No live requests to hh.ru were made for vacancy data; only official documentation (the HH API OpenAPI spec, the `hhru/api` repository, two hh.ru documentation pages) and GitHub were read.

Reference points. "Local fork" is `../career-ops` at `92f4e4d2`: upstream `8c9aae34` plus three commits by the owner (`5ab6b06f`, `e04e21ee`, `92f4e4d2`) that are the patch committed into the checkout (`git log` of the checkout). "Upstream HEAD" is `career-ops-hq/career-ops` `9570926` (2026-10-11), shallow-cloned into a scratch directory and never written to the real checkout. Upstream file:line references below are to that HEAD.

## Findings

### 1. What the patch changes and why

Size per file of `core-contract.patch` (counted from the hunks; 354 lines, 20 hunks, 6 files): `providers/_compensation.mjs` new file +72; `providers/local-parser.mjs` +45/-3 in 3 hunks; `scan.mjs` +29/-6 in 11 hunks; `providers/_trust-validator.mjs` +10/-1 in 3 hunks; `providers/_types.js` +23 (JSDoc only); `tests/scan-json-receipt.test.mjs` +2. The 0.6 patch has the same shape (about 33 lines in local-parser) and `local-parser.patch` is the original two-hunk +20/-3 version, kept only so the installer can upgrade (`install.sh:88-103`).

| Hunk | What it does | Core limitation that forced it (at the 0.6 base) |
| --- | --- | --- |
| `local-parser.mjs` field list | Copies description, note, compensation, source, transport, sourceId, locationText, locations, workArrangement, dataLevel, matchedQueries, eligibility, hasDescription, provenance, employment, professional_role, injectionFlags; maps `{min,max}` salary | `normalizeParserJob` returned a closed object of title/url/company/location/postedAt; every other key was dropped (stated in `docs/roadmap/provider-architecture-review.md`, "New fields are lost in local-parser") |
| `local-parser.mjs` `sourceStatuses` | Validates `payload.sourceStatuses` and attaches it to the returned array as a non-enumerable property | Core local-parser ignored everything except the jobs array |
| `scan.mjs` status collection (hunks near old lines 3484, 3562, 3679, 4028) | Collects `jobs.sourceStatuses`, turns non-`ok` entries into error rows, adds `status` and `source_statuses` to the `--json` receipt | Core had no channel for a provider to say "partial" or "blocked" without failing the whole entry |
| `scan.mjs` `sourceProvider` (old 3658, 3679) | Keeps the provider-reported `source` | Core overwrites `job.source` with the entry name (`scan.mjs:4364` upstream HEAD) |
| `scan.mjs` + `_compensation.mjs` | Unit-aware salary filter and formatting (period, tax basis, no conversion) | `buildSalaryFilter` compares raw numbers and ignores period and tax basis (`scan.mjs:1043-1085`); `formatCompensation` prints only `min-max CUR` (`scan.mjs:2861`) |
| `_trust-validator.mjs` | One `prompt-injection-suspected` flag and -30 score when a job carries `injectionFlags` | The validator reads only `url` and `company` (`providers/_trust-validator.mjs:197-244`) and `scan.mjs:4221` overwrites trust fields, so a provider cannot set them |
| `_types.js`, tests | Documentation of the new fields; test expectation for the new receipt keys | Follow-on of the above, no runtime effect |

### 2. Upstream has moved: most hunks are now redundant

- **Field whitelist is gone upstream.** PR #4697 "feat(local-parser): pass a parser's extra job fields through (#3438)" was merged on 2026-10-03 (GitHub issue API: `closed_at`/`merged_at` 2026-10-03). `normalizeParserJob` now spreads every unlisted key into the job (`providers/local-parser.mjs:195-229`, exported). I ran upstream's `normalizeParserJob` on a companion-shaped job in the scratch clone: `salary {min,max,currency}`, `compensation`, `injectionFlags`, `employment` object, `note`, `source`, `dataLevel` all survive unchanged. So the local-parser field hunk, the salary-shape hunk and the `employment`/`professional_role` hunk are unnecessary on current upstream, for an out-of-tree producer that only needs the data to reach `scan.mjs` as plain properties.
- **Core filtering by a declared field exists.** #3438 added `field_filters` and per-target `filter_on` (`scan.mjs:191-250`). It reads own scalar properties only (`declaredFieldValue`, `scan.mjs:236-239`), so `employment` and `professional_role` can be filtered by core if the companion also emits them as scalar strings (for example `employment_kind: "full"`); the current `{values, rawLabels}` object shape is not readable by that gate. Whether `filter_on` fits HH data semantically is unverified.
- **Plugin providers were never whitelisted.** The plugin host passes plugin `Job[]` through unchanged (`plugins/_engine.mjs:785`, `scan.mjs:64`); only the `local-parser` route had the closed object.
- **Still missing upstream:** (a) no `sourceStatuses`/`queryStatuses` consumption anywhere in `scan.mjs` (grep returns nothing; this is the owner's own commit `5ab6b06f` in the local fork); (b) no unit-aware salary logic (`scan.mjs:1043`, `scan.mjs:4291` take `job.salary` only); (c) no way for a provider to influence trust flags.

### 3. Does the patch apply today?

`git apply --check` on a scratch clone, never on the real checkout:

| Target | Result |
| --- | --- |
| Base `8c9aae34` | all three patches apply cleanly |
| Upstream HEAD `9570926` | `core-contract.patch` and `core-contract-0.6.patch` fail on `providers/_types.js` (JSDoc context moved: upstream inserted `externalId`, `requisitionId`, `language` fields) and on one `scan.mjs` hunk (the `errors`/`emptyTargets` declaration block). `local-parser.patch` checks clean but is now redundant (the spread already carries `description`/`note`, and `salary` is passed raw) |
| Upstream HEAD with `git apply --3way` | applies with one conflict, only in `_types.js` (documentation comment). `scan.mjs`, `local-parser.mjs`, `_trust-validator.mjs` merge cleanly |

So the installer's plain `git apply --check` (`install.sh:82-85`) would refuse on current upstream, although the functional merge is trivial. `scan.mjs` grew from 4070 lines (base) to 4838 (HEAD) and upstream is roughly 350 commits ahead of the fork base, so every release is a fresh conflict lottery. `test/core-patch.mjs` and `test/companion-install.sh` default to `../career-ops` (the already-patched fork) and do not test against upstream HEAD.

### 4. Extension points in core

- **Plugin hooks:** `provider`, `ingest`, `search`, `notify`, `export` only (`plugins/_engine.mjs:36`; `plugins/README.md`, hook table). No filter, validator, or Job-schema hook exists. Provider plugins reach the network only through `ctx.fetch` (HTTPS, host allowlist, SSRF guard); `plugins/README.md` says CI checks that bundled plugins import no browser-automation or process-spawning module, while `plugins.local/` runs on user trust.
- **Localhost is allowed:** manifest `allowsLocalhost: true` with a loopback host in `allowedHosts` permits plain-HTTP calls to `localhost` (`plugins/_engine.mjs:214-222`, `418-429`). Registry review wants "localhost only with a stated reason" (`docs/PLUGIN_REVIEW.md`).
- **local-parser contract:** whitelisted interpreter plus in-repo script, 20 s default timeout, JSON on stdout (`providers/local-parser.mjs:13-20`; `docs/local-parser-cookbook.md`). Jobs carry no status channel upstream.
- **Policy:** `CONTRIBUTING.md:163` says PRs that scrape platforms prohibiting automated access are actively rejected; `docs/PLUGIN_REVIEW.md` ("ToS-grey") says such integrations are neither bundled nor registry-listed but may live in `plugins.local/`. So an HH-specific upstream PR will not merge; only generic, source-neutral changes can. The maintainer reply on #3690 (2026-09-05) shows `plugins.local/` is "not the ceiling" for read-only user-account ingest, but that is a different class.
- **Open issues/PRs:** searches of the upstream issue tracker for hh.ru, sourceStatuses, partial status, and browser providers found no proposal for source statuses or provider trust flags (issue-search API; absence is not proof).

### 5. What the official HH API allows today

Read from the public OpenAPI spec (`https://api.hh.ru/openapi/specification/public`, fetched 2026-10-11), the `hhru/api` repository (last commit 2025-12-19) and two hh.ru pages:

- `GET /vacancies` and `GET /vacancies/{id}` declare no security requirement in the spec. The operation text says that if no authorization token is passed, a captcha will be offered after the first request (translated from Russian). Search depth is capped at 2000 results. Server-side parameters cover what the companion cannot extract from HTML: `experience`, `employment`, `schedule`, `work_format`, `professional_role`, `salary`, `currency`, `only_with_salary`, `excluded_text`, `search_field`, `period`, `area`, `per_page`.
- A `User-Agent` (or `HH-User-Agent`) header is mandatory; missing gives `400 bad_user_agent unset`, a blacklisted value gives `blacklisted` (spec "request requirements"; `hhru/api` `docs/errors.md:87-95`). Recommended format: `MyApp/1.0 (contact@example.com)`.
- Application tokens come from `POST https://api.hh.ru/token` after registering an app at dev.hh.ru (`hhru/api` `docs/authorization_for_application.md`); `hhru/api` `docs/FAQ.md` says app review can take up to 15 working days and support cannot influence the outcome. The dev.hh.ru page does not say who is eligible (individuals vs companies): unverified.
- Site terms (`https://hh.ru/article/33205`, read through a page summary, first 100000 of 125490 characters): clause 6.1.38 forbids automated collection and structuring of site information by parsers or scrapers; 6.1.34 forbids software that imitates user activity; 6.2.2 allows plugins/apps only if they use the site's API; 10.6.3-10.6.4 require software to be registered at dev.hh.ru; 10.6.5-10.6.6 let HH refuse registration; 9.12 allows use of vacancy data for job search, hiring, labour-market information; 10.1.16.11 (in the Talantix API section) forbids commercial use of API data, and its applicability to the general API is unverified. Clause numbers come from a summarising fetch and must be re-read in full before relying on them.
- Plugin history: version 0.6.0 had an API adapter that received `403` on the first page and was removed in 0.7.0 (`docs/providers/hh.md`, "Status"; commit `34712da`). The cause of that 403 is not recorded (captcha policy, User-Agent, or token): unverified. That adapter used an optional `HH_ACCESS_TOKEN` and no registered app.

Consequence: the browser companion is the part that conflicts with 6.1.38, 6.1.34 and 6.2.2; the API route is the only one the terms describe as legitimate.

### 6. Candidate solutions

**(a) Upstream PRs so no local patch remains.** Minimal source-neutral set, in order of likelihood (maintainer appetite unverified):
1. Provider/local-parser status channel: accept `sourceStatuses` from local-parser and plugin providers, surface non-`ok` as scan errors and in the `--json` receipt (about 12 lines in `local-parser.mjs` plus 20 in `scan.mjs`; this is the `5ab6b06f` change). Generic, useful to any partial-failure source.
2. Keep the provider's own `source` as `sourceProvider` (2 lines at `scan.mjs:4364`); or the producer emits a different key and needs nothing.
3. Optional: provider-supplied `trustFlags` merge in the validator, replacing `injectionFlags`-specific logic (about 8 lines).
4. Unit-aware salary (`_compensation.mjs`, 72 lines plus 10 in scan) is the largest and hardest to land; avoid it by moving the logic out (see recommendation).
No HH-specific code can go upstream (`CONTRIBUTING.md:163`). Items 1-3 would be separate small PRs; merge time unknown.

**(b) Keep the companion, drop the patch by fitting core's existing schema.** After #4697 this is mostly done for free: `salary {min,max,currency}`, `note`, `description` and arbitrary extra keys pass. What the companion must do itself:
- Salary: emit core-readable `salary` only when period is month and the currency and tax basis match the user's declared filter; otherwise omit `salary` (core passes unknown salary) and put the raw text into `note`. Apply the unit-aware filter inside the companion (it already reads the config via `--config`). This removes `_compensation.mjs` and the two `scan.mjs` salary hunks.
- Injection: put `prompt-injection-suspected: <patterns>` into `note` (core renders it as a `note:` segment of the pipeline row, `scan.mjs:2928`). This loses the trust score, the `trust: ...` segment (`scan.mjs:2873-2891`) and the -30 penalty, but keeps the human-visible warning. Alternatively blank `description`/`note` for flagged jobs.
- `source`: emit the original as `sourceProvider` directly.
- `employment`/`professional_role`: emit as scalar fields to use `filter_on`.
- Statuses: stay lossy (see (c)).
Remaining patch: none required; one optional status hunk.

**(c) Post-processing outside core.** The companion already has this shape: `--scan` runs core `scan.mjs` as a child with a generated HH-only config and writes `scan-receipt.json`/`scan.log` (`companion/scan-hh.mjs.txt:289-296`), and `--import-cache` replays `merged.json` through local-parser. Because the companion owns the run, it knows every `sourceStatuses` entry and can exit non-zero or print the summary itself, with no core change. Cost: users must run the companion command (not plain `node scan.mjs`) to see partial or blocked status; the plain path silently shows fewer jobs. A separate enrichment script between collect and scan is possible but adds nothing beyond (b).

**(d) Fork or vendor core.** Already de facto true locally (3 owner commits on `8c9aae34`). Upstream is about 350 commits ahead and `scan.mjs` grew by 768 lines; the owner would carry rebases forever and users could not use stock career-ops. Rejected; the patch is strictly smaller than a fork.

**(e) Plugin-side provider.**
- With the browser: not possible in the plugin sandbox. The plugin gets only `ctx.fetch*` (HTTPS, allowlist) and the bundled-plugin audit rejects process-spawning and browser imports; this also contradicts the plugin's own architecture (`docs/architecture/components.md:9`).
- With the official API: fully in-sandbox. `allowedHosts: ["api.hh.ru"]`, token in `ctx.env`, `User-Agent` per the spec; Jobs returned through the plugin hook are not whitelisted; `employment`, `experience`, `salary`, `professional_role` become server-side filters. The 0.6.0 adapter (`lib/hh.mjs` at tag `v0.6.0`; removed in commit `34712da`) can be restored. This removes the companion, the Playwright dependency, the installer patch step and the `scripts/ru-market` install, and it is the only variant the HH terms describe as allowed (6.2.2, 10.6.3). Blockers: app approval (up to 15 working days, may be refused, eligibility unknown), the unexplained 403 in 0.6.0, captcha for tokenless use, and a possible commercial-use limit (10.1.16.11, applicability unknown). The unit-aware salary and trust logic can then live in the plugin (it creates the Jobs); the status channel still needs (a)1 or the lossy fallback in (c).

**(f) MCP server / external process boundary.**
- Local HTTP daemon: the companion runs as a long-lived `localhost` service; a thin `provider` plugin with `allowsLocalhost: true` calls it via `ctx.fetch`. This bypasses the local-parser 20 s kill (a real gain for multi-page runs) and the whitelist, and needs no core patch beyond statuses. Costs: a second process to start and supervise, a new hardening surface on localhost, registry reviewers want a stated reason for localhost, and the ToS exposure is unchanged. The plugin stays `plugins.local` class.
- MCP: no MCP provider hook exists in core (hook list at `plugins/_engine.mjs:36`; roadmap unverified). It would be the same daemon with an extra protocol.
- Net: solves timeouts and fields, not the legal problem and not the status channel.

**(g) Other.**
- Hybrid: API provider as the default HH source plus the browser companion as an opt-in fallback for users without a token; the companion then carries no core patch ((b) plus (c)) and is clearly outside the supported path.
- Ask HH for a data partnership: unverified, no public programme found in the read documentation.
- Narrow the patch only: keep `core-contract.patch` but shrink it to statuses (about 45 lines instead of 354) and switch the installer to `git apply --3way` with a post-apply self-test. This is the fallback if upstream rejects (a)1.

### 7. Comparison

| Option | What stays patched | Effort | Risk | Maintenance when core updates | Legal / ToS |
| --- | --- | --- | --- | --- | --- |
| Status quo (3 patches) | 6 files, about 190 added lines, 20 hunks | none | patch already fails `git apply --check` on HEAD | high: each release can break it | browser collection conflicts with 6.1.38, 6.1.34, 6.2.2 |
| (a) upstream PRs only | falls to zero if all merge | medium plus unknown review time | maintainers may decline; each PR needs source-neutral framing | none after merge | HH code stays out of tree |
| (b) fit existing schema | none required; optional status patch of about 45 lines | low-medium (companion edits, delete `_compensation.mjs`, simpler installer) | loses trust score and unit-aware core display | low (depends only on the #4697 passthrough) | unchanged (browser) |
| (c) companion-owned run | none | low (largely exists) | plain `node scan.mjs` hides partial failures | none | unchanged |
| (d) fork/vendor | everything | high | users cannot run stock core | highest | unchanged |
| (e1) plugin + browser | n/a | n/a | not possible in the plugin sandbox | n/a | n/a |
| (e2) plugin + official API | none (statuses via (a)1 or lossy) | medium (restore `lib/hh.mjs`, token env, UA) | app approval uncertain; unexplained 403; captcha without token | lowest (in-tree plugin, stable provider contract) | the only variant consistent with the terms; commercial-use clause unverified |
| (f) localhost daemon | statuses only | medium-high | extra process and surface | low-medium | unchanged (browser) |
| (g) hybrid API + opt-in companion | none | medium | two code paths | low | API path compliant; companion is opt-in user risk |

## Conclusion

### Recommendation

Do (b) and (c) now, pursue (e2) in parallel as the strategic replacement, send (a)1 upstream as a small generic PR, and drop the patch from the default install.

Reason: since upstream merged #4697 (2026-10-03) the core already carries the extra fields, so only three behaviours still need core: status reporting, a trust hook and unit-aware salary. The last two can live in the companion; the first can be delivered through the companion-owned `--scan` run and later upstream. That takes the install from 6 patched files to zero while staying on stock core, and it fixes the already-broken `git apply --check` on HEAD. The API route is the only path that removes both the patch and the terms conflict, but it depends on an approval outside our control.

### Ordered steps

1. Pin a minimum core version (any commit containing #4697, merged 2026-10-03) in `install.sh` and docs; verify by running upstream's `normalizeParserJob` on companion output (the scratch check passes today).
2. Companion edits (bump the contract version): emit `sourceProvider` instead of relying on patched `source`; emit `salary {min,max,currency}` only for month-based comparable data; keep `compensation` for the companion's own filter and for `note`; apply the declared `salary_filter` (period, tax basis) inside the companion; put injection flags into `note` text (and optionally scalar `employment_kind` / `professional_role_ids` for `filter_on`).
3. Make `node scripts/ru-market/scan-hh.mjs --config ... --scan` the documented routine command so the companion reports `sourceStatuses` itself (exit 1 on failure already exists, `companion/scan-hh.mjs.txt:358-360`); document that plain `scan.mjs` shows partial results without a status.
4. Rewrite `test/core-patch.mjs` as a stock-core compatibility test run against upstream HEAD (a pinned SHA plus a weekly "latest" job); keep the three old patches only for uninstalling (`git apply --reverse`) for one release, then remove them. Update `install.sh`, `RELEASING.md:47-49`, `companion/README.md`, `docs/architecture/components.md:96`, `docs/providers/hh.md`.
5. Open one upstream PR "local-parser/provider: report per-source statuses" (generic, with tests, based on `5ab6b06f`); optionally a second PR for provider-supplied trust flags. If merged, delete the status caveat; if declined, keep the lossy path.
6. Start dev.hh.ru app registration as the owner (15 working days of review) and prototype the API provider on a restored `lib/hh.mjs` with an explicit User-Agent; record the exact response for tokenless and token calls (the 0.6.0 403 cause). If approved, make the API the default HH transport and demote the companion to opt-in.
7. Keep the legal risk note in `docs/providers/hh.md`; update it with the clause numbers once the full terms are read.

### Open questions

- Is the owner prepared to register an HH application, and does HH approve apps for personal job-search use? (not stated in the read documentation)
- What caused the `403` on the first API page in 0.6.0: missing token plus captcha, User-Agent, or IP-level blocking?
- Does the commercial-use clause 10.1.16.11 apply beyond the Talantix API section? Re-read the unread 25490 characters of the terms page.
- Will upstream maintainers accept a provider status channel? Unknown; no existing issue found.
- Do `filter_on` semantics (positive whitelist on a scalar field) match how employment and role filtering should behave for HH data? Unverified.
- Is a trust score worth patching core for, or is a `note` warning enough?
- The working tree of `../career-ops` has uncommitted changes (`scan.mjs`, `rank-pipeline.mjs`, `scan-ats-full.mjs`, `docs/SCRIPTS.md`) and an untracked `scan-hh.mjs`; they were not inspected and are outside this study.

## Outcome

Implemented in 0.8.0 (branch `feature/drop-core-patch`, not pushed). The owner settled these decisions, which narrow the recommendation above:

- The three patches (`core-contract.patch`, `core-contract-0.6.patch`, `local-parser.patch`) and all installer patch logic were deleted. `install.sh` installs only `scan-hh.mjs` and `lib/untrusted.mjs`; nothing changes career-ops core. Option (b) was followed for the schema, option (c) was reduced to stderr and artifact files.
- Salary: the companion emits `salary {min,max,currency}` only for a complete RUB monthly range, as the midpoint (`min` = `max`). Every other case omits `salary`; `compensation` stays as an extra field. The research suggested emitting `salary` for any month-based comparable data and filtering inside the companion; the companion does not filter at all, and core's own `salary_filter` compares the midpoint numbers.
- The status feature was removed on both sides (plugin `sourceStatuses`/`queryStatuses`, companion envelope field and exit-code channel). Kept: artifact and resume files, now with a `queries` list in `queries-summary.json`, stderr lines, exit 1 for configuration errors and for incomplete `--scan` runs. The research suggested making `--scan` the documented routine command to report statuses; this was not done because core receives no status by decision.
- Injection flags: `injectionFlags` stays informational; the `prompt-injection-suspected` trust rule is gone. The research suggested also putting the warning into `note`; this was not done.
- Contract version 3, version 0.8.0 everywhere; `--import-cache` rejects contract 2 caches.
- CI: one upstream repository and one pinned commit. `santifer/career-ops` (used by `health.yml`) is a redirect to `career-ops-hq/career-ops` (same repository id), so `career-ops-hq/career-ops` is used everywhere. The pin is `95709261abfd3679b7cbc91f53f6e486d41cffa7`, verified through the GitHub API to exist and to be 192 commits after the PR #4697 merge commit `034ca77`; `health.yml` tracks HEAD. Integration, installer and browser tests were run against a scratch clone of that commit.
- Not done, by decision: the HH API plan (step 6), the upstream status-channel PR (step 5), `filter_on` scalar fields for `employment` and `professional_role`.

## Sources

Local:
- `companion/core-contract.patch`, `companion/core-contract-0.6.patch`, `companion/local-parser.patch`, `companion/README.md`, `companion/scan-hh.mjs.txt:289-296,358-360`, `install.sh:78-110`, `test/core-patch.mjs`, `RELEASING.md:47-49`
- `docs/roadmap/provider-architecture-review.md` (findings, decisions g, h, k), `docs/providers/hh.md`, `docs/architecture/components.md:9,96`
- Local fork `../career-ops` at `92f4e4d2` (`git log`, `git status`)

Upstream (`https://github.com/career-ops-hq/career-ops`, HEAD `9570926`, scratch clone):
- `providers/local-parser.mjs:13-20,185-229`, `providers/_trust-validator.mjs:197-244`, `providers/_types.js`, `providers/_registry.mjs`
- `scan.mjs:191-250,1043-1085,2861-2931,4221,4291,4364,4796`
- `plugins/README.md`, `plugins/_engine.mjs:36,214-222,418-429,785`, `docs/PLUGINS.md`, `docs/PLUGIN_REVIEW.md`, `docs/local-parser-cookbook.md`, `CONTRIBUTING.md:163`
- PR #4697 (merged 2026-10-03): `https://github.com/career-ops-hq/career-ops/pull/4697`; issue #3690: `https://github.com/career-ops-hq/career-ops/issues/3690`
- Issue search API: `https://api.github.com/search/issues?q=repo:career-ops-hq/career-ops+local-parser+fields`

HH:
- OpenAPI spec: `https://api.hh.ru/openapi/specification/public` (`/vacancies`, request requirements, authorization)
- `https://github.com/hhru/api` (`docs/errors.md:87-95`, `docs/authorization_for_application.md`, `docs/FAQ.md`, `docs/cache.md`), commit `906d7b6` (2025-12-19)
- Site terms: `https://hh.ru/article/33205` (summary fetch of the first 100000 characters; clause numbers unverified against the full text)
- Developer portal: `https://dev.hh.ru/`
