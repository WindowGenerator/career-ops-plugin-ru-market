# Plan: HelloWorld.rs integration

Status: Implemented
Date: 2026-10-09
Type: roadmap

Shipped as an optional source in 0.6.0 (see [RELEASE_NOTES.md](../../RELEASE_NOTES.md)); user-facing description in the [HelloWorld.rs provider page](../providers/helloworld-rs.md). Agreed product decisions Q1-Q8, 2026-10-09. The first version of the adapter is implemented. Basis: [research of the live listing and the core contract](../research/helloworld.md).

## Problem

An optional HelloWorld.rs source in the existing `provider: ru-market`: search by configurable phrases, reading the HTML listing, normalized vacancies and merging of query results. Serbian vacancies, remote work explicitly available from Serbia and records with undetermined geography are kept. Explicitly incompatible restrictions are taken into account only when data exists, not by the site's domain or the word Remote.

The first version does not load full descriptions and does not need a browser. Shared seniority and technology filters in core are a [separate roadmap stage](core-job-filters.md) that does not block the adapter release. The current rank adds scores and explanations but does not itself exclude records.

## Decisions

### Data contract

Use the existing Job fields: `title`, `company`, `url`, `sourceId`, `source`, `transport`, `location`, `locationText`, `locations`, `workArrangement`, `compensation`, `matchedQueries`, `dataLevel`, `hasDescription`, `note`.

- `source: helloworld-rs`, YAML key `helloworld_rs`, `transport: html`.
- Links: HTTPS on `www.helloworld.rs`, path `/posao/<title>/<company>/<numeric-id>`, no query/fragment; listing identity is source plus numeric ID.
- Keep the original place string. `Hibrid -> hybrid`, `Rad od kuće / Remote -> remote`. A city without an explicit mode label does not prove `onsite`; Remote does not prove availability from Serbia.
- The date in the listing is the listing expiry; do not write it to `postedAt`.
- Do not create a description that is absent from the listing out of tags: `hasDescription: false`, `dataLevel: listing`.
- Salary: parse the confirmed format `2.600,00`, keep currency, net/gross and the source text. An unknown period is `unknown`; keep ambiguous amounts as text. Do not use analytics or salary reviews as the vacancy salary.
- Unknown seniority, technologies or geography do not by themselves exclude a record.

Proposed technical shape of the new shared optional fields, implementing the agreed lists:

```json
{
  "seniority": {
    "levels": ["mid", "senior"],
    "rawLabels": ["Intermediate", "Senior"]
  },
  "skills": ["Python", "SQL"]
}
```

This illustrates the contract and is not a claim about a specific live vacancy. Scale: `intern / entry / mid / senior`; confirmed HelloWorld labels: `Junior -> entry`, `Intermediate -> mid`, `Senior -> senior`. Keep all explicitly listed seniority levels and technologies, with duplicates removed. Do not derive skills from the job title. If there are no labels, the corresponding field is absent; keep an unknown seniority label in `rawLabels` with no invented value in `levels`. Source technology names are kept as is; a synonym dictionary is not needed for the first adapter.

Proposed configuration example after implementation:

```yaml
job_boards:
  - name: HelloWorld Serbia
    provider: ru-market
    ru_market:
      source: helloworld-rs
      max_pages: 2
      sources:
        helloworld_rs:
          enabled: true
          queries: [Python, Data Engineer]
```

For one source the existing `source` selection is enough; a shared `market` selector from the original Serbian plan remains a possible later extension. Two pages here is an example of a user limit, not a new global default.

### Separate stage: career-ops filters

The [roadmap task](core-job-filters.md) uses the same fields. It defines selection settings, the priority of an explicit level over the title heuristic, rules for several values and compatibility of old filters. Missing data is let through; this is an already agreed requirement.

### Known source limitations

The public HTML listing is technically verified. The [research](../research/helloworld.md) separately records the restrictions of the published terms and the incomplete check of their current edition; HTML availability does not mean confirmed permission of the platform. The plan does not provide for account login or CAPTCHA bypass. These restrictions must be kept in the documentation of the implemented source.

## Scope

### Stage 1. Configuration and shared fields

- [x] Extend `makeJob` with optional seniority and technology lists without changing the results of old adapters. Check passing these fields through the direct plugin provider; do not claim readiness of their filtering or display in core.
- [x] Register the source in `index.mjs` and `lib/config.mjs`, disabled by default. Configurable `queries`, `mode: html|auto` and the existing `max_pages` limits; auto mode uses the same HTML transport.
- [x] For an enabled source accept an explicit non-empty list of queries with the current string-list limits; reject unsupported parameters. Health uses one explicit check query.
- [x] Keep the old `source: all` and orders of 3/5/6 sources. Add the new source to the permitted order without duplicates, keeping the stable appending of omitted sources.

### Stage 2. HTML adapter and bounded requests

- [x] Add `lib/helloworld.mjs` with separate listing parsing and page fetching, using the existing HTML utilities, queue, retry and `paginate`.
- [x] Send phrases through `q`. The `/python/` path is a site technology filter, not equivalent to keyword search. Keep the matched queries in `matchedQueries`.
- [x] Follow the verified next-page link with offsets 0, 30 and onward; validate origin, route, preservation of the original query and offset progress. Bound traversal by `max_pages`, detect a repeated page/link, mark reaching the limit in diagnostics.
- [x] Parse only vacancy cards: title, employer, place/mode, salary, separate seniority and technology labels. Exclude ratings, benefits and advertising from fields. Do not treat arbitrary HTML as an empty result.
- [x] Add the verified host to `manifest.json` and `lib/queue.mjs`; allow in `lib/http.mjs` only the necessary HTTPS listing routes. Normalizing card links does not mean permission to load them in v1.
- [x] Merge duplicates by ID, keeping queries. On failure of later pages/another query keep the results already received and status partial. On an access ban stop further requests to the source and mark the rest as skipped.

### Stage 3. Checks and adapter release readiness

- [x] Fixtures: normal and explicitly empty listing, last page, pagination repeat, damaged markup, access denial, wrong link and partial failure.
- [x] Fields: several levels and technologies, unknown label, missing metadata, Remote without a country, hybrid, ambiguous geography, salaries with comma/dot, net/gross without a period and absence of a false `postedAt`.
- [x] Explicitly separate synthetic variants for several labels/places from snapshots of the live listing. Do not claim support for an ambiguous format that is checked only by guesswork.
- [x] Check configuration, URL/pagination, duplicate queries, preservation of shared fields and the previous behaviour of RU sources. Run `npm test`, an audit and an integration `scan --dry-run` with network fixtures.
- [x] Add a health check of the selected source: one page of one query without retries and without saving vacancies. Make one bounded live smoke request with the adapter.
- [x] Update README, the configuration example and the release notes. State the absence of full history, publication date, full description and new core filters in the first version.
- [ ] Core filtering of seniority and skills (tracked in [core-job-filters.md](core-job-filters.md); does not block this adapter).

## Acceptance criteria

1. An ordinary listing returns correct Job records.
2. Unknown fields are not invented.
3. Partial failures are visible.
4. Old configurations work.
5. All the checks listed in Scope, stage 3, pass.
6. Publishing a version is a separate action after implementation.

### Verification of the implementation (2026-10-09)

- `npm test`: shared regressions, getmatch, HelloWorld and provider smoke.
- `bash test/integration.sh`: isolated core checkout, plugin audit, fixture-backed `scan --dry-run` and writing to a temporary pipeline/history; user data was not changed.
- Live adapter smoke: one request `q=Python`, one page, 30 vacancies, 29 with technologies, 30 with levels; stop `page-limit`, no descriptions or `postedAt`. `node --use-system-ca` was used because of a network-environment certificate; TLS verification was kept.
- An additional live check of an empty search found 30 recommendations instead of matches: the adapter excludes them by the confirmed zero-results heading/message.
- Real Intermediate + Senior were found in a keyword snapshot; multi-city remains a synthetic check and is kept as one ambiguous string without an invented split.

Limitations of the current core and the platform terms are described in the [HelloWorld.rs provider page](../providers/helloworld-rs.md).

## Open decisions

- Confirmation of the current complete edition of the site terms and of permission for automated use (see the [research](../research/helloworld.md)).
- Core filtering of the shared seniority and skills fields: see [core-job-filters.md](core-job-filters.md).
- Evidence for RSD salaries, an explicit pay period and a real multi-city listing: none observed yet.
