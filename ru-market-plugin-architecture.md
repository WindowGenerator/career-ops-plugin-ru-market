# ru-market Provider Plugin — Architecture Handoff

**Status:** implemented locally; fixture and scanner integration tests pass; release/distribution steps tracked in RELEASING.md
**Target repository:** `career-ops-plugin-ru-market`
**Plugin ID / provider ID:** `ru-market`
**Scope:** public Russian-language vacancies across Russia and CIS markets
**Primary source:** HeadHunter (HH)

## Objective

Build one external career-ops provider plugin that discovers vacancies from:

- HeadHunter (`hh`)
- Habr Career (`habr-career`)
- GeekJob (`geekjob`)

The plugin must use the existing career-ops plugin/provider API without changes to career-ops core. Develop it locally under `plugins.local/ru-market`, then publish it as a separate GitHub repository named exactly `career-ops-plugin-ru-market`.

## Non-goals and hard constraints

- Do not add a new `contrib` layer or custom provider framework.
- Do not modify career-ops core or extend its Job API.
- Do not add login, user cookies, CAPTCHA bypass, application submission, or browser automation. An optional registered-application token is supported for HH API.
- Do not make network requests to employer sites or any host outside the configured job platforms.
- Do not add third-party runtime dependencies in v1; use Node.js ESM and the standard library.
- All HTTP must go through the plugin `ctx.fetch*` methods so `allowedHosts` remains effective.
- User search terms, geography, categories, and limits belong in `portals.yml`, not in plugin source.

## Existing API constraints

The current Job contract supports the following relevant fields:

```js
{
  title,
  url,
  company,
  location,
  description,
  postedAt,
  salary,
  note
}
```

Important limitations:

- There is no official `sourceDetail` field.
- `scan.mjs` assigns the system source as `ru-market-api`.
- Use the existing `note` field for the actual board name, alternative links, raw salary details, and cross-listing warnings.
- `postedAt` must be a finite Unix epoch timestamp in milliseconds.
- `salary` may carry the structured fields understood by career-ops: `from`, `to`, and `currency`. Preserve richer/raw salary wording in `note`.
- Plugin providers currently receive plugin context, not the scanner's runtime context. Do not rely on `ctx.maxPages`, `ctx.sinceMs`, or other scan-only fields.
- `verify-portals.mjs` does not currently merge plugin providers. Plugin health checks must remain plugin-local unless core support is added in a separate future project.

## Package layout

```text
career-ops-plugin-ru-market/
├── manifest.json
├── index.mjs
├── lib/
│   ├── hh.mjs
│   ├── habr-career.mjs
│   ├── geekjob.mjs
│   ├── normalize.mjs
│   ├── dedup.mjs
│   ├── queue.mjs
│   └── retry.mjs
├── fixtures/
│   ├── hh/
│   ├── habr-career/
│   └── geekjob/
├── test/
│   └── smoke.mjs
├── skill.md
├── README.md
└── LICENSE
```

Use the approved `career-ops-plugin-startup-boards` plugin as the architectural precedent: one provider hook dispatching to multiple internal board adapters.

## Manifest

Initial manifest shape:

```json
{
  "id": "ru-market",
  "name": "ru-market",
  "version": "0.1.0",
  "apiVersion": 1,
  "description": "Discover public Russian-language vacancies across HH, Habr Career and GeekJob.",
  "hooks": ["provider"],
  "requiredEnv": [],
  "allowedHosts": [
    "api.hh.ru",
    "career.habr.com",
    "geekjob.ru"
  ],
  "skill": "skill.md",
  "humanInTheLoop": true,
  "homepage": "https://github.com/<owner>/career-ops-plugin-ru-market"
}
```

Do not add regional HH domains until a concrete source requires them and its terms have been reviewed.

## Provider dispatch

Export one provider hook:

```js
export default {
  provider: {
    id: 'ru-market',
    detect() {
      return null;
    },
    async fetch(entry, ctx) {
      // Dispatch by entry.ru_market.source.
    },
  },
};
```

Supported source selectors:

- `all` — production mode; query all enabled boards and perform cross-board dedup before returning `Job[]`.
- `hh` — HH only, primarily for diagnostics or selective use.
- `habr-career` — Habr Career only.
- `geekjob` — GeekJob only.

Plugin providers are explicit-only. Every portal entry must set `provider: ru-market`; do not implement implicit detection.

## Configuration contract

Use career-ops-style snake_case in YAML, especially `max_pages`.

Recommended production entry:

```yaml
job_boards:
  - name: Russian-language job boards
    provider: ru-market
    ru_market:
      source: all
      primary_source_order:
        - hh
        - habr-career
        - geekjob
      max_pages: 3
      sources:
        hh:
          enabled: true
          mode: api
          max_pages: 2
          host: hh.ru
          locale: RU
          area: ""
          schedule: remote
          queries:
            - Python backend
        habr_career:
          enabled: true
          mode: html
          max_pages: 3
          categories:
            - programmist_python
            - backend_razrabotchik
          remote: true
        geekjob:
          enabled: true
          mode: html
          max_pages: 5
```

Parameter precedence:

1. Source-specific setting, such as `sources.hh.max_pages`.
2. Shared `ru_market.max_pages`.
3. Conservative built-in default.

Validate configuration strictly enough to reject unsupported source names, modes, invalid page limits, and malformed query arrays. Ignore or warn on unknown forward-compatible fields rather than executing them.

## Source modes

Each adapter recognizes `api`, `html`, or `auto` where meaningful.

### HH

- Default and recommended mode: `api`.
- `api`: use only the official public HH vacancies API.
- `html`: unavailable; HH site terms prohibit automated scraping.
- `auto`: in v1 behaves as API with retry, then returns an API error. It does **not** fall back to HH HTML search.

Reason: HH provides an official API, and its site terms prohibit automated collection through page parsing. Use an application token where available.

### Habr Career

- Initial implementation: public HTML only.
- `auto` may resolve to `html`.
- Access only listing/vacancy pages allowed by the host policy; do not access profile, response, conversation, or other private/action endpoints.

### GeekJob

- Initial implementation: public HTML only.
- `auto` may resolve to `html`.
- Do not access `/json/` or `/rest/`; GeekJob's robots policy explicitly disallows those paths.

## Host queues and retry policy

Maintain a separate process-wide queue per source host:

| Host | Default concurrency | Default pacing |
|---|---:|---:|
| `api.hh.ru` | 2 | honor `Retry-After` |
| `career.habr.com` | 1 | 500–1000 ms between requests |
| `geekjob.ru` | 1 | 500–1000 ms between requests |

Retry only transient failures:

- network failure or timeout;
- HTTP 429;
- HTTP 5xx.

Do not retry ordinary 4xx responses. Use bounded exponential backoff with jitter and honor a bounded `Retry-After`. A malicious or accidental very large `Retry-After` must not stall a scan indefinitely.

## Empty, broken, and partial results

Contract:

- Expected page structure exists and contains no jobs: valid empty result.
- Expected structure is absent: broken-markup error.
- CAPTCHA, login wall, challenge page, or interstitial: access error, not empty.
- Unknown document shape: error, not empty.

For paginated sources:

1. Retry a transient failed request.
2. If retries are exhausted after earlier pages succeeded, retain jobs from successful pages.
3. Emit a warning with `ctx.log`, including source, completed pages, failed page, and error category.
4. Return the partial `Job[]`.

## Job normalization

### Dates

- Return only `postedAt` as Unix epoch milliseconds.
- Account for the source timezone when parsing localized dates.
- Do not replace an unknown date with the current time.
- Do not label an update date as a publication date.
- Omit `postedAt` if the date cannot be parsed confidently.

### Company

- Preserve the original display name in `job.company`.
- Internally normalize whitespace, punctuation, quote styles, casing, and common legal suffixes for matching.
- Do not automatically transliterate brand names.
- If normalization is uncertain, compare and return the original name.
- career-ops core performs its own company normalization after the plugin returns results; do not return a non-standard `companyNormalized` field.

### Location

- Preserve the fullest useful original location/remote wording.
- Do not collapse `remote within Russia`, hybrid, relocation, or post-probation remote conditions into a generic `remote` string.

### Salary

When reliable, return:

```js
salary: {
  from: 250000,
  to: 350000,
  currency: 'RUB'
}
```

Preserve gross/net, period, negotiability, and the full source wording in `note`, because the current pipeline serializer only formats the standard numeric range and currency.

### Source attribution

There is no `sourceDetail` field in the current API. Use a stable note prefix:

```text
source: hh
```

For an aggregated result:

```text
source: hh; cross-listed: Habr Career <url>; GeekJob <url>
```

The primary URL's host remains the durable source signal in scan history.

## Cross-board deduplication

Cross-board dedup is required in v1 and must run inside the plugin before returning `Job[]`. This is why normal production usage should use `source: all`; separate provider calls could be deduplicated by career-ops before the plugin has a chance to preserve both links.

Matching stages:

1. Exact board URL and source-specific external ID.
2. Conservative normalized company + normalized title + normalized location.
3. Description similarity when both sources provide usable descriptions.

Outcomes:

- **High confidence:** return one Job. HH is the default primary source. Put every alternative posting URL in `note`.
- **Medium confidence:** return both Jobs. Put a reciprocal `possible cross-listing` link in each Job's `note`.
- **Low confidence:** return both Jobs without merging.

Primary-source order defaults to:

```text
hh → habr-career → geekjob
```

Allow `primary_source_order` to override this, but HH remains the documented default.

Do not use company+title alone as a high-confidence match: a company can have multiple genuinely distinct openings with the same title.

## Health checking

No career-ops core changes are allowed, and the current `verify-portals.mjs` does not load provider plugins. Therefore health checks are plugin-local in v1.

Provide a dependency-free smoke/health command that:

- checks each source independently;
- fetches at most one page;
- distinguishes reachable, empty, broken markup, auth/challenge, rate-limited, network, and server errors;
- emits machine-readable JSON;
- exits non-zero for broken/access failures but not for a legitimate empty result.

Do not claim integration with career-ops portal health until core supports it.

## Testing

Required fixture tests for every source:

- normal result;
- valid empty result;
- pagination;
- duplicate cards;
- changed/broken markup;
- CAPTCHA or interstitial;
- localized dates;
- missing optional fields;
- malformed URLs;
- salary variants;
- transient failure followed by success;
- partial pagination failure.

Required aggregate tests:

- high-confidence HH/Habr duplicate merges to one HH-primary Job;
- all alternative links survive in `note`;
- medium-confidence matches remain separate with reciprocal links;
- different roles with the same company/title are not incorrectly merged;
- one source failing does not discard successful results from the other sources;
- host queues remain independent.

Live tests:

- run in a separate scheduled GitHub Actions workflow;
- do not block ordinary pull requests;
- use minimal page counts and conservative pacing;
- alert on structural degradation;
- do not commit live vacancy payloads or personal data.

## Terms and access-policy findings

These are preliminary engineering constraints, not legal advice:

- HH has an official API and documents registered-application tokens. Do not perform active user actions. Keep HTML search fallback disabled under the current site terms.
- Habr Career's robots policy does not prohibit public vacancy listing/detail pages but prohibits private/action areas. Use public read-only HTML conservatively.
- GeekJob's robots policy allows public pages but disallows `/json/` and `/rest/`. Use public HTML only and do not probe those endpoints.
- Re-check terms before the first public release and record the review date and links in the plugin README.

References:

- HH API: <https://github.com/hhru/api>
- HH API agreement: <https://dev.hh.ru/admin/developer_agreement>
- HH site terms: <https://hh.ru/article/33205>
- HH robots: <https://hh.ru/robots.txt>
- Habr Career robots: <https://career.habr.com/robots.txt>
- GeekJob robots: <https://geekjob.ru/robots.txt>

## Versioning and distribution

Use SemVer in `manifest.json`:

- patch: parser fixes with unchanged configuration;
- minor: backward-compatible source/features/config additions;
- major: incompatible configuration or provider behavior.

Current career-ops installs plugins by exact commit SHA and has no automatic `plugins.mjs update` command. The scanner core also needs a small change to show per-source plugin failures in its JSON receipt. Release flow:

1. Tag and publish a plugin release.
2. Update the official registry entry to the new version and exact SHA.
3. Users reinstall the pinned release using the existing plugin CLI.
4. `portals.yml` and `config/plugins.yml` remain outside plugin code and survive reinstall.

Initial direct installation before registry approval:

```bash
node plugins.mjs add <owner>/career-ops-plugin-ru-market --sha <40-hex-commit> --confirm
```

The plugin will be marked community-unverified until accepted into the official registry.

## Suggested implementation order

1. Scaffold `plugins.local/ru-market` with `node plugins.mjs new ru-market`.
2. Replace the template ingest hook with a provider hook and finalize the manifest.
3. Extract/refactor existing local HH parser logic into `lib/hh.mjs`; use only the official API initially.
4. Extract Habr Career parser into `lib/habr-career.mjs` with structural empty/broken checks.
5. Extract GeekJob parser into `lib/geekjob.mjs`; avoid `/json/` and `/rest/`.
6. Add shared queues and retry utilities.
7. Add normalization and source-local dedup.
8. Implement aggregate `source: all` and cross-board dedup with HH-primary selection.
9. Add fixtures and contract tests.
10. Add plugin-local live health command and scheduled workflow.
11. Test through career-ops `scan.mjs` using a temporary `portals.yml` entry.
12. Publish `career-ops-plugin-ru-market`, install it by pinned SHA, then prepare a registry PR.

## Existing local implementation material

The current career-ops working tree contains local parser prototypes that can be refactored as implementation input:

```text
scripts/parsers/hh-jobs.mjs
scripts/parsers/habr-career-jobs.mjs
scripts/parsers/geekjobs-jobs.mjs
```

They are CLI parsers, not provider hooks. When migrating:

- remove CLI `main()` and argument parsing from reusable adapter modules;
- replace global `fetch` with plugin `ctx.fetchJson`/`ctx.fetchText`;
- preserve pure parser functions for fixture tests;
- keep source configuration in `portals.yml`;
- do not modify or delete the prototypes until the plugin has equivalent test coverage.

## Final decisions already made

- One plugin and one provider ID.
- HH is the primary source for high-confidence merged cross-listings.
- One aggregate production invocation (`source: all`).
- Alternative URLs are retained in `note`.
- API/HTML/auto is source-specific; HH defaults to API and does not HTML-fallback in v1.
- Empty versus broken markup is determined structurally.
- Retry transient requests, then return partial results with a warning.
- Separate request queues per platform.
- Unified `postedAt` epoch milliseconds.
- Cross-board dedup ships in v1.
- Preserve original company and location wording; normalize conservatively for matching.
- Return structured salary where possible and preserve raw details in `note`.
- Network access is restricted to the platform hosts.
- No OAuth2 implementation or third-party dependencies; an existing HH application token may be supplied.
- SemVer releases use existing pinned-SHA installation mechanics.
- Health checks remain plugin-local; scanner core records per-source status in JSON receipts.
- Fixture tests plus non-blocking scheduled live smoke tests.
- Scope is Russian-language vacancies across Russia and CIS, not only jobs geographically located in Russia.
