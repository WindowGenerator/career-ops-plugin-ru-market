# Review of ru-market adapters and the 0.7.0 transition plan

Status: Implemented
Date: 2026-10-10
Type: roadmap

The review was done against the state of the 0.6.0 repository and the local core checkout (`92f4e4d2`). Decisions a-k were agreed with the owner. The implementation was done on the branch `feature/provider-architecture-review` (0.7.0); deviations from this document are listed in the section "Implementation results" at the end. References of the form `file:line` refer to those versions. No live requests to the sources were made while preparing the document.

## Problem

Compare the seven plugin adapters (hh, habr-career, geekjob, superjob, trudvsem, getmatch, helloworld-rs) with the upstream career-ops conventions, record the discrepancies, give a technical verdict on the candidates (Armenia, Yandex) and describe the agreed changes: removal of the HH API adapter, hybrid filters, new Job fields, getmatch filters and prompt-injection protection.

Upstream conventions compared against:

- Provider contract: `id`, `fetch(entry, ctx)` returns an array; optionally `detect`, `dedupKey` (`../career-ops/providers/_types.js:5-7`, `Provider` at the end of the file). The plugin returns an array with non-enumerable `sourceStatuses` and `queryStatuses` (`index.mjs:47-48`); core reads them in `scan.mjs:3601`.
- Job: `title` and `url` are mandatory, the rest optional (`_types.js`, `Job`). `makeJob` returns `null` without a title or a valid URL (`lib/normalize.mjs:86`).
- local-parser: runs an external command from the repository, JSON on stdout, a limit of 20 s and 2 MB by default (`providers/local-parser.mjs:13-14`), only the listed fields are passed (`local-parser.mjs:196-223`).
- Core filters (`title_filter`, `skip_tiers`, `salary_filter`, `content_filter`, posting age) are applied only after `provider.fetch` in `scan.mjs` (call at `scan.mjs:3585`, filters at `3643-3669`). Core providers have no server-side filters.
- A plugin provider receives only a `ctx` with `fetchText`, `fetchJson`, `fetchResponse` (`_types.js`, `Context`), so Playwright cannot be launched from a plugin; browser collection is moved to the companion (`install.sh:17`, `companion/README.md:5`).

Correction to the original wording: "CI forbids browser/process modules in bundled plugins" is confirmed only partially. A static-audit checklist item was found in the core registry PR template (`../career-ops/.github/PULL_REQUEST_TEMPLATE/plugin-registry.md:38`: no `child_process`, `playwright`, raw sockets, global `fetch`, `eval`). No such checks were found in `plugin-registry-validate.yml`. The restriction really works as a review rule and as the set of tools available to a plugin (`ctx`).

### Adapter comparison

The adapter comparison table (transport, authorization, request queue, server-side parameters, result fields, tests) was moved to the provider matrix: [../providers/README.md](../providers/README.md), which describes the current (0.7.0) state; the removed HH API is kept there as a historical row of the filter matrix. Facts specific to the 0.6.0 state that the review relied on:

- At 0.6.0 the hh adapter used the JSON API `api.hh.ru/vacancies` with an optional Bearer `HH_ACCESS_TOKEN` (`lib/http.mjs:25-31`), 2 parallel requests without pause (`lib/queue.mjs:35`), and sent `text`, `area`, `schedule`, `period` plus `page`, `per_page`, `host`, `locale`, `order_by` (`lib/hh.mjs:38-40`).
- SuperJob and Trudvsem were covered only by stubs in `test/run.mjs` (lines 269 and 273) without a fixtures directory.
- getmatch had 11 tests and helloworld-rs 9 tests at 0.6.0.

Common: request timeout 10 s, up to two retries for `network`, `server`, `rate-limited` (`http.mjs:38-40`, `lib/retry.mjs:13-20`). Allowed URLs are checked by `assertRequestUrl` (`http.mjs:7-20`) and `jobUrl` (`normalize.mjs:37-52`). Vacancy identity: `sourceId` from the URL (`normalize.mjs:97`).

Discrepancies with the upstream schema that are not on the findings list: the fields `skills`, `seniority`, `note` are not described in `_types.js`; the plugin's `job.salary` has the shape `{from, to}` (`normalize.mjs:59`), while core's `salary_filter` reads `min`/`max` (`scan.mjs:1006`). While `compensation` is present core uses it (`scan.mjs:1001`), so in practice the harm is limited; new adapters should rely on `compensation`.

### Candidates: technical verdict

There is one question: does the source response map to the unified Job schema. The legal side is not part of the verdict. For reference: the Yandex terms restrict the use of content to the functions of the site itself ([Yandex Jobs research](../research/yandex-jobs.md), "Terms of use", clause 2.3 of the agreement).

| Candidate | What the repository materials confirm | Verdict |
| --- | --- | --- |
| Greenhouse, Lever, Workable (Armenia) | Core providers already exist: `providers/greenhouse.mjs`, `lever.mjs`, `workable.mjs` ([Armenia ATS research](../research/armenia-ats.md), "Findings"). They return Job in the standard schema | Map; no adapter is needed in the plugin, only verified boards |
| workx.am | Public MCP with `search-jobs` and `get-job-details` ([Armenia ATS research](../research/armenia-ats.md)); the response schema is not recorded in the repository, no sample response is saved (the research plan requires checking it) | Not determined. In addition the transport is not covered: the plugin's `request()` makes only GET (`http.mjs:24-40`), MCP needs POST (`FetchOptions` allows `method` and `body`, `_types.js`, but the plugin does not pass them) |
| staff.am, job.am | Public HTML and sitemap; card fields and URL stability are not checked ([Armenia ATS research](../research/armenia-ats.md)) | Not determined. By analogy with the HTML adapters `title`, `url`, `company`, `location` are probably extractable, but without markup samples this is an assumption |
| Yandex Jobs | No API found; DOM and XHR not studied, there was no browser ([Yandex Jobs research](../research/yandex-jobs.md)). Titles, teams, short descriptions, cities, work formats, skills were observed | Partial. Possible mapping: `title`, `url`, `location`, `workArrangement`, `skills`, seniority through `pro_levels` (values not checked). The company is always the same. Salary and publication date are not confirmed, `Показать ещё` ("Show more") pagination is not established. The full response contract is not defined |

### Filter matrix

The filter matrix (what the source offers, what the plugin sends, what core filters after fetch) was moved to [../providers/README.md](../providers/README.md#filter-matrix). Key points the decisions below rely on: at 0.6.0 the hh adapter sent only `text`, `area`, `schedule`, `period`; the browser companion sent `text`, `page`, `area` and `search_field=name` via `titleOnly` (`companion/scan-hh.mjs.txt:120-122`); getmatch sent nothing beyond `p`, `offset`, `limit`; core filtering applies after the fetch to title, description, salary and age.

### Findings

Critical for the user:

- **hh is enabled by default although the API answers 403.** `DEFAULT_SOURCES` contains `hh` (`lib/config.mjs:3`), `enabled` is true by default for it (`config.mjs:46`); unavailability is acknowledged in `README.md:5`. Every `source: all` makes a useless request and yields `failed` for hh. Closed by decision a.
- **Prompt protection is declared but not implemented.** `skill.md:4-5` calls vacancy text untrusted, while the code only strips tags and `script`/`style`, decodes entities and collapses whitespace (`normalize.mjs:3,11`); there are no length limits or detection. `title`, `company`, `location`, `description`, `note` pass through `makeJob` (`normalize.mjs:84-110`). Closed by decision e. Nuance: the regular expression `<[^>]*>` does not remove an HTML comment that contains `>` inside.

Warnings:

- **getmatch without filters.** Only `p`, `offset`, `limit` (`getmatch.mjs:62`); `enabled`, `mode`, `max_pages`, `per_page` are accepted (`config.mjs:53`). Closed by decision d.
- **CI is pinned to different cores.** `test.yml:28-29`: `career-ops-hq/career-ops` @ `8c9aae34`; `health.yml:18-19`: `santifer/career-ops` @ `92dea48b`; `release.yml:9` uses `test.yml`. The local core checkout during the review is `92f4e4d2`, a third variant. Whether these commits exist in the named repositories cannot be checked from the local environment. They need to be brought to one repository and reference, or the difference explained explicitly.
- **`requiredEnv` is empty but SuperJob fails without a key.** `manifest.json:8`; a `config` error at request time (`http.mjs:35`). Nuance: SuperJob is disabled by default (`config.mjs:46`), the key is listed in `optionalEnv` (`manifest.json:9`), so this is not a manifest defect but late detection: the error shows up at request time and lands in `sourceStatuses` as `failed/config`. Proposal: check the key in `parseConfig` when `enabled: true` or document it in `skill.md`.

Found during the review:

- **The companion cannot import plugin modules.** The installer copies one file `scan-hh.mjs` into `scripts/ru-market/` (`install.sh`, installation block; `scan-hh.mjs.txt:9-11` imports only core modules), and the plugin lives in `plugins.local/ru-market`. Decision e "a shared module for makeJob and the companion" requires either a second installable file or an embedded copy with an identity test.
- **New fields are lost in local-parser.** The key list is fixed (`local-parser.mjs:216-223`); `skills`, `seniority`, the future `employment`, `professional_role`, `injectionFlags` will not pass without extending `companion/core-contract.patch` (it currently adds `dataLevel` and others, `core-contract.patch:22`).
- **A companion failure loses `sourceStatuses`.** In `--query` mode with a non-`ok` status the process exits with code 1 (`scan-hh.mjs.txt:292,296`); `execFile` rejects, stdout is ignored (`local-parser.mjs:242`), and in the end only the error text remains (`scan.mjs:3737-3748`), while the scan does not fail.
- **The companion configuration is tied to `ru_market.sources.hh`.** `loadBatchConfig` looks for queries there (`scan-hh.mjs.txt:178`); after the adapter is removed the plugin will reject such a key (`config.mjs:29` checks source names).
- **Deduplication.** HH was the main cross-deduplication board (`skill.md:15-18`); companion results go as a separate `local-parser` entry, so links between boards stop merging (core deduplicates by URL).

## Decisions

Agreed with the owner; items f-k were accepted after the review and close earlier open questions. The mark "clarification" denotes a detail added during the review.

**a) HH: browser transport only.**

- Remove the API adapter `lib/hh.mjs`, its fixtures (`fixtures/hh/`), the optional variable `HH_ACCESS_TOKEN` (`manifest.json:9`, `http.mjs:25-31`), the API parts of [the HH page](../providers/hh.md), the registration in `index.mjs:2,12`, the queue and the allowed host `api.hh.ru`.
- The only HH transport is the Playwright companion through core local-parser. The plugin cannot launch Playwright.
- `hh` in `primary_source_order` is rejected with a `config` error with a hint about `local-parser`. The allowed lengths are derived and checked against `lib/config.mjs`: currently 3/5/6/7 (`config.mjs:31`, where 5 and 6 are hard-coded and compared with the slices `SOURCES.slice(0, n)` at `config.mjs:34-36`). After the removal `SOURCES` = habr-career, geekjob, superjob, trudvsem, getmatch, helloworld-rs, the mandatory core (`DEFAULT_SOURCES`) is habr-career and geekjob, and the allowed lengths are 2/4/5/6 (core; +superjob, trudvsem; +getmatch; all six). The hard-coded 5 and 6 in `config.mjs:31,34-36` are replaced with 4 and 5. A migration test (old lengths 3 and 7 are rejected, 2/4/5/6 are accepted, `hh` gives a migration error) is in scope. The test `test/helloworld.mjs:67` hard-codes `[3, 5, 6, 7]` and must be updated.
- Breaking change: version 0.7.0, an entry in `RELEASE_NOTES.md`.
- A companion failure (block, timeout) must give `sourceStatuses` with status `failed` and clear text, and the scan does not fail. The exact order is decision h.
- Anonymous HH collection stays a recorded legal and technical risk (one line): the HH terms require working through the API ([HH page](../providers/hh.md), "Legal and technical risk"), the companion uses an anonymous browser context (`companion/README.md:5`).

**b) Filters: hybrid.** Server-side parameters for browser HH are set through `parser.args`: `search_field`, `excluded_text`, `professional_role`, `only_with_salary`. `experience`, `employment`, `salary` are passed as Job fields and filtered by core (see [core-job-filters.md](core-job-filters.md)). The model is a core convention: there are no server-side filters in core providers. Clarifications: of these parameters the companion currently knows only `area` and `search_field=name` (through `--title-only`, `scan-hh.mjs.txt:122,270`); the other flags have to be added. Extraction of `experience` and `employment` from the listing card is not implemented (`scan-hh.mjs.txt:21-39` reads only title, company, place, salary, remote) and is not verified on markup; without it these fields stay unknown. The `--query` mode through local-parser is limited to 20 s by default (`local-parser.mjs:13`), several pages need `timeout_ms`.

**c) New Job fields `employment` and `professional_role`** are added in the plugin immediately as additional fields (like `dataLevel`, `eligibility`). The contract and core filters are described in [core-job-filters.md](core-job-filters.md). For the local-parser route the field list must be extended by a core patch (see findings).

**d) getmatch: experimental filters `sa`, `pa`, `se`, `l`** are implemented without prior live verification, strictly as explicit opt-in. In the documentation they are marked "unverified"; verification goes through health and new releases, fixes in later versions. This departs from the rule "do not invent filters". Correction to the original wording: [the getmatch page](../providers/getmatch.md) had no such text; it said that this version has no server-side filters, and the ban "Do not invent query, remote or specialization filters" is in `skill.md:38-39`. Therefore the getmatch page and `skill.md` are updated in the same work package. The other parameters (`s`, `from_date`, `to_date`, `sp`, `pl`, `c`, `exclude_applied`) are not implemented.

**e) Prompt-injection protection.**

- A new module `lib/untrusted.mjs`, used by `makeJob` (`lib/normalize.mjs`) and the companion script; the way the companion gets it is decision f.
- Normalization: invisible Unicode (zero-width, bidi), control characters, HTML comments, length limits. The specific limits are set during implementation and pinned in tests.
- Pattern detection in English and Russian: ignore previous instructions, `system:`, role markers, references to tools, `игнорируй предыдущие` ("ignore previous") and analogues. The result is an `injectionFlags` array in Job; the route to core is decision g.
- Flagged vacancies are kept, not dropped. Counters of flagged ones go into `sourceStatuses` (formed in `paginate.mjs:54-57` and `index.mjs:30`).
- Scope: any external-source text passing through the provider (`title`, `company`, `location`, `note`, `description`). There is no LLM classifier.
- Residual risk: the full vacancy text is read by core modes through Playwright or WebFetch (`modes/pipeline.md:33`, `modes/scan.md:23`); protection there is a "data, not instructions" marker and the rule in `AGENTS.md:63-71`, and there is no code detector in core (a search over `*.mjs` found none). Closed by a separate upstream proposal; the draft is in the appendix.

**f) Shared module in the companion: a managed second file.** `lib/untrusted.mjs` is installed as a second managed file `scripts/ru-market/lib/untrusted.mjs` next to the companion; the companion imports it, the single source of truth stays in the plugin, no embedded copy. `install.sh` applies to it the same rule as to `scan-hh.mjs`: refuse on local edits or an unmanaged file (the `sha256` check against `scan-hh.install.json`). This is a template for future browser and local-parser providers: the directory `scripts/ru-market/lib/` is shared, not tied to HH. The file is published in the release the same way as `companion/scan-hh.mjs.txt`.

**g) One combined core patch** (an extension of `companion/core-contract.patch`, applied locally by the installer; no upstream change is needed to work). It passes `employment`, `professional_role` (later `seniority`, `skills` per `core-job-filters.md`) through the local-parser key list (`local-parser.mjs:216-223`), passes injection flags and fixes the salary shape (decision k). Code check for flags: `buildTrustValidator` computes flags only from `url` and `company` (`_trust-validator.mjs:203-244`: `missing_apply_url`, `invalid_url`, `suspicious_domain`, `company_domain_mismatch`), and `scan.mjs:3617-3621` overwrites `trustScore`, `trustFlags`, `trustLevel` with the validator result; local-parser does not pass these keys. Therefore an externally set trust flag cannot be passed by a provider. The chosen route: the provider passes `injectionFlags` (an array of strings) as an input field, the patch passes it through local-parser and adds to the validator a rule that adds a flag to `trustFlags` and lowers `trustScore` from this field. The flags reach the existing output (`scan.mjs:2518-2539`, `4034-4036`) without a separate mechanism. A new Job field is needed in any case; one trust mechanism alone is not enough. Agreed: `injectionFlags` is an array of identifiers of triggered patterns; the validator rule adds ONE flag `prompt-injection-suspected` per vacancy and lowers `trustScore` by 30 once regardless of the number of patterns (floor 0). Flagged vacancies are kept. With `trust_filter.enabled: false` the validator degenerates into a no-op (`_trust-validator.mjs:184-186`), the field stays on the Job. One upstream proposal goes with the patch (fields, flags, salary; appendix). Core updates may require reinstalling the patch (`companion/README.md:5`).

**h) Companion failure.** On a failure encoded in `sourceStatuses` the companion exits with code 0 and emits partial vacancies plus `sourceStatuses` (reason, number of completed pages). This works with the current core: local-parser keeps `sourceStatuses` (`local-parser.mjs:262-268`), and `scan.mjs:3601-3607` turns every non-`ok` status into an error entry, so the failure is visible in the scan summary and not only in the exit code. A non-zero code remains for configuration errors and for collection with `--scan`; the condition `process.exitCode = 1` (`scan-hh.mjs.txt:292`) changes for the `--query` mode. Criterion 4 and a test are mandatory.

**i) HH configuration.** A separate `portals.yml` entry with an `hh_browser` block (model: `examples/hh-browser.yml`); `parser.args` point to it; the companion stops reading `ru_market.sources.hh` (`scan-hh.mjs.txt:178`). This is a template for any future Playwright provider. The configuration is read on every run, so it changes without reinstalling.

**j) Cross-board deduplication.** Planned as separate work (scope and risks). How core deduplicates: the normalized URL is checked against history, the pipeline and vacancies of the same run (`scan.mjs:3685-3689`, `normalizeUrlForDedup` `:1486`), then the key `company::role` (`companyRoleDedupKey` `:2116`, role via `normalizeRoleForDedup` `:2031`, company via `canonicalizeCompany` and `company_aliases`), including against vacancies already accepted from other entries of the same run (`:3695-3722`). For an entry with `aggregator: true` the company+role key is not applied, only the URL remains (`:3695-3697`). Conclusion: one vacancy from the ru-market entry (habr) and the HH entry (local-parser) with different URLs is merged by the company+role key if the company and the position match after normalization; entries are processed in parallel (`CONCURRENCY = 10`, `parallelFetch`), the entry that finished first wins; the order in `portals.yml` and `primary_source_order` does not determine the winner; alternative links are lost (the plugin currently keeps them in `note`, `lib/dedup.mjs`). Agreed: do not change core. To make HH data win for certain, HH is run as a separate scan earlier than the rest (`--company "HH browser"`), and the following scan drops the duplicate. The companion returns `company` and `title` as on the page. Differences in company spelling are solved through `company_aliases` in `portals.yml` (format `Canonical name: [alias, ...]`, case-insensitive, `templates/portals.example.yml:1575-1591`, `scan.mjs:1819`), for example:

```yaml
company_aliases:
  Яндекс: [Yandex, ООО Яндекс]
```

Loss of alternative links for merged duplicates is accepted, no new field is introduced.

**k) Salary.** The source of truth is `compensation {min, max, currency, period, taxBasis, rawText}`. `salary` is emitted as `{min, max, currency}`; the legacy form `{from, to}` is removed (`normalize.mjs:59,91`). A discrepancy on the core side: `local-parser.mjs:225-229` accepts `from`/`to`, while `scan.mjs:1006` reads `min`/`max`, so `salary` from local-parser does not take part in `salary_filter` without `compensation`. The fix is part of the combined patch and of the upstream proposal.

### Out of scope

- Server-side filters beyond those listed in b) and d).
- Automatic editing of `portals.yml`.
- Live requests to getmatch in the document preparation phase.
- Upstream core changes: edits go only through a local installer patch; the detector for raw vacancy text and Job fields are moved into one upstream proposal (appendix).
- An LLM injection classifier.
- Adapters for Armenia and Yandex.

### Risks

- Removing hh breaks existing configurations (minimized by an error with a hint and a changelog entry).
- getmatch filters without verification may be wrong or unstable; opt-in and the "unverified" mark limit the impact.
- Detection heuristics give false positives and misses; the flag is informational, vacancies are not dropped.
- Filters by `experience`, `employment` are impossible until the companion extracts this data.
- Loss of merging HH with habr and geekjob inside the plugin: the winner is determined by which scan finished first (HH is run separately and earlier), alternative links of merged duplicates are lost (accepted), different spelling of the company needs `company_aliases` (decision j).
- The combined core patch may not apply after a core update; reinstallation is needed, and on incompatibility the installer refuses (`install.sh`, branch "Cannot apply core contract cleanly").
- The second managed file widens the installer surface: a local edit of the shared module blocks the companion update.
- A companion failure with code 0 must not be confused with success: it must reach the summary through `sourceStatuses`, otherwise data is lost silently.

## Scope

- [x] Remove `lib/hh.mjs`, `fixtures/hh/`, `HH_ACCESS_TOKEN` from `manifest.json` and `http.mjs`, `api.hh.ru` from `allowedHosts`, `assertRequestUrl` and the queue, the registration in `index.mjs`, the API sections of the HH page, `skill.md`, `README.md`, `examples/portals.yml`.
- [x] Rebuild `lib/config.mjs`: remove `hh` from `SOURCES` and `DEFAULT_SOURCES`, reject `hh` in `primary_source_order` and `sources.hh` with a hint about `local-parser`, recompute the allowed lengths.
- [x] HH configuration: a separate `portals.yml` entry with `hh_browser`, `parser.args` pointing to it, the companion does not read `ru_market.sources.hh`; update `examples/hh-browser.yml`, `companion/README.md`, `README.md`.
- [x] Companion: flags `search_field`, `excluded_text`, `professional_role`, `only_with_salary`; on failure in `--query` mode exit code 0, partial vacancies and `sourceStatuses` (reason, completed pages).
- [x] Add the fields `employment`, `professional_role`, `injectionFlags` to `makeJob`; extend `companion/core-contract.patch` with one patch: the local-parser key list, a trust-validator rule on `injectionFlags`, the `salary` shape `{min,max,currency}` (decisions g, k); state in the installer messages that a core update may require reinstalling.
- [x] Fix `salary` in the plugin: `{min,max,currency}`, no `{from,to}`; `compensation` stays the source of truth.
- [x] `install.sh` and release: the second managed file `scripts/ru-market/lib/untrusted.mjs` with the same refusal rule on local edits; a shared directory `scripts/ru-market/lib/` for future providers.
- [x] Deduplication between entries: the README describes the run order (HH as a separate scan earlier than the rest) and `company_aliases` with an example; an integration test confirms that with an early separate scan HH stays. The entry order in the file does not determine the winner.
- [x] getmatch: options `sa`, `pa`, `se`, `l` in `config.mjs` and `getmatch.mjs`, off by default, marked "unverified"; update [the getmatch page](../providers/getmatch.md), `skill.md` (lines 38-39), `examples/portals.yml`.
- [x] Module `lib/untrusted.mjs`: normalization and detection, `injectionFlags`, counters in `sourceStatuses`; connect to `makeJob` and the companion through the shared file (decision f).
- [x] Tests: unit tests of `untrusted.mjs` (Russian and English patterns, invisible Unicode, bidi, control characters, HTML comments, limits, false positives); a configuration migration test (`hh` gives a migration error, old lengths 3 and 7 are rejected, 2/4/5/6 are accepted; update `test/helloworld.mjs:67`, where `[3, 5, 6, 7]` is set); update of fixtures and `test/run.mjs` (all references to hh, lines 4, 20-23, 98-111, 146-161); getmatch filter tests.
- [x] Align the core pinning in `.github/workflows/test.yml` and `health.yml` or document the difference. The difference is documented by comments in `test.yml` and `health.yml`; existence of the commits was not checked offline.
- [x] `RELEASE_NOTES.md` (a 0.7.0 section describing the breaking change), `README.md`, bump the version in `manifest.json`, `package.json`, `http.mjs:5`.

## Acceptance criteria

1. There are no references to `api.hh.ru`, `HH_ACCESS_TOKEN` and `lib/hh.mjs` in `lib/`, `index.mjs`, `manifest.json` and tests; `npm test` passes.
2. `parseConfig` with `hh` in `primary_source_order` or `sources.hh` throws an error of category `config` with text about `local-parser`; the migration test checks the new allowed lengths.
3. `source: all` does not contact HH and does not emit `failed` for hh.
4. A block or timeout of the companion in `--query` mode ends with code 0, returns partial vacancies and `sourceStatuses` with status `failed` or `partial`, a reason and the number of completed pages; in the `scan.mjs` summary and receipt the failure is visible as a source error, not only in the exit code; the scan does not fail (integration test).
5. `employment` and `professional_role` are present in Job and after applying the combined patch reach core through local-parser; their filtering is described in `core-job-filters.md`.
6. getmatch without the new options sends the same requests as in 0.6.0; with options it adds only `sa`, `pa`, `se`, `l`; in the documentation they are marked "unverified".
7. `untrusted.mjs` is covered by tests: invisible characters and HTML comments are removed, lengths limited, RU and EN patterns give `injectionFlags`, ordinary vacancies get no flags.
8. A vacancy with flags stays in the result; the number of flagged ones is visible in `sourceStatuses`, and the flag is visible in `trustFlags` of the scan output (with the patch).
9. The companion imports `scripts/ru-market/lib/untrusted.mjs`, not a copy; the installer refuses on a locally modified file; companion and `makeJob` results match on shared test strings.
10. `RELEASE_NOTES.md` contains a 0.7.0 entry describing the breaking change and the migration.
11. `salary` of plugin and companion vacancies has the shape `{min,max,currency}`, `{from,to}` is never emitted; with the patch `salary_filter` takes into account `salary` from local-parser.
12. An HH entry in `portals.yml` with `hh_browser` works without `ru_market.sources.hh`; changing `hh_browser` takes effect without reinstalling.
13. The README describes the run order (HH as a separate scan earlier than the rest) and `company_aliases` with an example; an integration test confirms that with a duplicate the HH vacancy stays.
14. The validator rule gives one flag `prompt-injection-suspected` and lowers `trustScore` by 30 once (not below 0) for any number of patterns; with `trust_filter.enabled: false` `injectionFlags` stays in Job.

## Open decisions

How to add the hh entry to `portals.yml` in the future (a command or a managed block; manually until then, see `README.md`); the specific length limits and the list of patterns; details of the version bump (0.7.0, syncing `manifest.json`, `package.json`, `USER_AGENT` in `http.mjs:5`). To check during implementation: behaviour of the combined patch on other core versions; deduplication on live data; the possibility of reusing the `sha256` rule from `install.sh` for the second managed file.

## Appendix: draft issue for upstream

Title: Detector and marker for untrusted raw job descriptions read by pipeline and scan modes.

Text:

> Summary. `AGENTS.md` ("Untrusted External Content") requires that job postings are treated as data, never instructions. In `modes/pipeline.md` (step 2a) and `modes/scan.md` the raw posting text is fetched with Playwright or WebFetch and passed to the model as-is. Enforcement relies on prompt wording only. A grep of the repository finds no code-level detector for instruction-like text.
>
> Problem. A posting from any source (listing, ATS API, scraped page) can contain text aimed at the model: "ignore previous instructions", fake `system:` or role lines, tool-call syntax, invisible Unicode (zero-width, bidi) or HTML comments. Provider-level sanitising does not cover the raw page text fetched later by the modes.
>
> Proposal. (1) A small shared module, for example `lib/untrusted-text.mjs`, that normalises text (invisible Unicode, control characters, HTML comments, length cap) and returns `flags` for known instruction-like patterns in English and other major languages. No LLM classifier. (2) The modes wrap fetched posting text in an explicit marker block and, when flags are present, quote them as an anomaly (Block G signal) instead of acting on them. (3) Flagged postings are kept, never silently dropped. (4) Providers may attach the same `flags` to Job as an optional `injectionFlags: string[]` field; `buildTrustValidator` adds one `prompt-injection-suspected` entry to `trustFlags` and lowers `trustScore` by 30 once per job (floor 0), because `scan.mjs` overwrites `trustFlags` on every job and local-parser does not pass externally supplied trust fields. (5) local-parser passes `employment`, `professional_role` (and later `seniority`, `skills`) and `injectionFlags`. (6) Salary shape: local-parser accepts `{from,to}` while `salary_filter` reads `{min,max}`; accept `{min,max}` so provider salary is not silently ignored.
>
> Out of scope. Blocking or deleting postings; semantic detection; changes to scoring.
>
> Acceptance. Unit tests with English and Russian patterns, invisible-Unicode and HTML-comment cases; a fixture posting with an embedded instruction is reported as an anomaly and does not alter the mode's output files.

## Implementation results

Done in 0.7.0 (branch `feature/provider-architecture-review`, without commits at the time). Deviations and clarifications:

- **Decision j and criterion 13 were corrected (the entry order was initially assumed, which is wrong for core).** `scan.mjs` processes entries in parallel (`CONCURRENCY = 10`, `parallelFetch`), and the duplicate stays with the entry that finished first, not the one first in `portals.yml`. The HH (browser) entry is usually slower. The deterministic variant, verified by an integration test: first a separate HH scan (`--company "HH browser"`), then the rest. The README describes the actual behaviour.
- The trust-validator rule works only with a configured `trust_filter` (without it the validator is a no-op, as in decision g). The floor of 0 is implemented but unreachable with the current core penalties (the minimum score before the rule is 40).
- `employment` and `professional_role` are filled only by SuperJob (`type_of_work`, `catalogues`) and Trudvsem (`employment`, `category.specialisation`); the API field names were not verified by live requests. The companion does not extract them.
- Shape of `employment`/`professional_role`: `{values, rawLabels}`; `values` for `employment` are derived from five Russian labels, for `professional_role` they are empty.
- getmatch values `sa`, `pa`, `se`, `l`: strings or numbers (`sa`, `pa` a single value; `se`, `l` up to 10), format unverified.
- For the upgrade from 0.6.0, `companion/core-contract-0.6.patch` (the previous patch for reverse application) and a branch in `install.sh` were added.
- The companion flag `--no-artifacts` was added so that a `local-parser` entry could run `--config` without an artifact directory; `timeout_ms` is implemented as a deadline between pages.
- HH companion server-side parameters were not verified on live HH.
