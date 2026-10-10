# Plan: adding getmatch to ru-market

Status: Implemented
Date: 2026-10-07
Type: roadmap

Shipped as an experimental opt-in source in 0.4.0 (see [RELEASE_NOTES.md](../../RELEASE_NOTES.md)); user-facing description in the [getmatch provider page](../providers/getmatch.md). The adapter code, registration and offline checks are implemented; the live contract and the basis for release remain unverified (see Open decisions).

Basis: [research of 7 October 2026](../research/getmatch.md).

## Problem

Add `getmatch` as a sixth source inside the existing `ru-market` provider, keeping the plugin installation and contract. A separate provider in career-ops or a core change is not needed for this.

Use JSON through `ctx.fetchJson` and the existing HTTP layer. Anonymous access to the `/api/offers` list and two cards is confirmed. Cookies, authorization and Playwright are not needed for the verified requests. The API is internal and undocumented: availability and structure may change.

The first version reads only the list: it already contains title, company, URL, description, salary fields, locations and date. Cards, similar vacancies, applications and profiles are not requested. No browser fallback is added. The source is disabled by default and enabled explicitly.

## Decisions

### 1. Terms of use before release

Record the permissibility of automatic reading and storage of the selected fields. Clause 3.2 of the agreement currently restricts copying, and robots.txt closes `/api/`. An anonymous HTTP 200 does not cancel these restrictions.

Basis for release: permission from getmatch or suitable published terms, or a legal assessment of the specific scenario that allows its use within chosen limits. Clarify personal use, distribution of the adapter, descriptions, retention periods, attribution and request frequency. If a different API or feed is permitted, replace the technical route in the plan.

Preparing code and checks on synthetic fixtures does not mean permission for regular collection. Until the basis is determined, do not include the source in automatic scans, health CI or the release as ready to use. The `enabled` flag expresses a user's setting, not the rights holder's permission.

### 2. Clarify the contract with a short live check

After the permitted scope of checking is determined:

1. Read two adjacent pages with the same small `limit`: compare `p`, `offset`, `meta.offset`, `meta.limit`, `meta.total` and the IDs of ordinary vacancies. Check that `p` and `offset` agree and that the next page really changes.
2. Clarify special announcements: with `limit=1` three `one_day_offer_v3` and one `vacancy` were already returned. Determine whether special announcements count in `meta.total`, repeat across pages and how the last page behaves.
3. Check one sample each with specialization and geography. Take parameter values from the interface/response; do not guess. In particular, free search `q` and `format=remote` are not confirmed.
4. Clarify the nested structure of `company`, `location_items`, `location_requirements`, descriptions and salaries; behaviour of hidden/estimated salary. Establish the timezone of `published_at`: a timestamp without an offset was observed, which cannot automatically be considered UTC or Moscow time.

Result of this stage: a minimal response contract and a confirmed pagination formula, values of the needed filters, anonymized fixtures. Do not store the original full response in the repository without a basis for using the text.

### 3. Adapter and normalization

In `lib/getmatch.mjs` implement a pure `parseGetmatch(data)` and `fetchGetmatch(cfg, ctx, options)`.

- Validate the response object, the `offers` array and the numeric `meta` fields. A wrong schema is `SourceError('broken-markup', ...)`, not an empty result.
- Accept only `offer_type === 'vacancy'` and `is_active === true`. Exclude special announcements; do not turn unknown types into ordinary vacancies. Distinguish a schema mismatch of ordinary vacancies from a correct page with special announcements.
- Normalize `position -> title`, `company.name -> company`, `url -> url`; formats and territorial restrictions go to `location`/`note`. Do not mark remote restricted to Russia as worldwide. For incognito do not try to recover the hidden employer.
- Use only the permitted description text, clean the HTML with the existing `plainText`. Do not return account service fields, `application`, `viewed` and arbitrary JSON. Treat vacancy text as untrusted data.
- For salary use `structuredSalary`, do not guess the currency when `null`. Do not present hidden and estimated salary as announced by the employer. Keep gross/net terms and period only when the field value is confirmed.
- For `postedAt` accept a date with an explicit timezone or one confirmed by the API agreement. If the timezone is unknown, omit the field; do not change the global interpretation of dates of other sources.

In `lib/normalize.mjs` add only HTTPS links `getmatch.ru/vacancies/{numeric-id}-{slug}`, without credentials, foreign hosts and ports; strip tracking query and fragment. Check that the URL ID matches the record ID. Use the URL from the API, do not generate a slug from the title.

### 4. Pagination, deduplication and errors

Compute the next offset from the confirmed `meta` contract, not from `offers.length` or the number of normalized vacancies. `max_pages` is a hard limit on page requests. Additionally recognize a repeated page by ID and lack of offset progress; report such cases as a diagnosable failure/partial result instead of looping.

In `lib/paginate.mjs` the loop currently stops on `!result.jobs.length`. This is wrong for a page containing only special announcements or filtered vacancies. Add an optional flag, for example `continueOnEmpty`, which the adapter sets only when a next page is confirmed; keep the previous behaviour of other sources. A correct fully filtered result must return `[]` with status `ok`.

In `lib/dedup.mjs` add the display name `getmatch` and identity by numeric ID: local deduplication currently uses the whole last path segment and treats different slugs as different vacancies. Use a shared identity helper in local deduplication and single-source comparison; keep the canonical link, do not merge different IDs by similar title.

Keep the existing `sourceStatus`/`sourceStatuses`: failure of the first page is `failed`, of a later one `partial` with the vacancies already received. Under `source: all` the other sources keep working. For getmatch an `access` error must stop the remaining routes of the source; generalize the current special condition for HH only, without changing the behaviour of other sources. Do not retry `401/403` and CAPTCHA; for network/5xx/429 use bounded retries under existing rules, then stop the current route. Do not write responses and descriptions to logs.

### 5. Configuration and network

| File | Change |
| --- | --- |
| `index.mjs` | Import and register `adapters.getmatch` |
| `lib/config.mjs` | `SOURCES`, key `sources.getmatch`, `enabled: false`, `mode: api`/`auto`, `max_pages`, `per_page` |
| `manifest.json` | Allowed host `getmatch.ru`, description of the sixth source; no new env vars needed for the current anonymous route |
| `lib/http.mjs` | Allow only the exact path `/api/offers` for getmatch; send the plugin's ordinary User-Agent and `Accept: application/json` |
| `lib/queue.mjs` | getmatch queue with concurrency 1; choose the interval according to agreed terms, do not call it a published API limit |

Keep the then-current three default sources and support for `primary_source_order` of three and five sources. Additionally support a full list of six; append missing optional sources in a stable order. By default getmatch has the lowest priority. An explicit `source: getmatch` requires `sources.getmatch.enabled: true`, like the current optional sources.

Initial values: `max_pages: 1`, `per_page: 20` are proposed settings that must be confirmed at stage 2. Until the filters are checked the MVP may read a bounded general listing. Do not add `queries` with a fictitious server-side search. Introduce confirmed specializations, locations and seniority as separate validated options; for a local keyword filter state explicitly that it covers only the loaded pages.

All calls go through `request` and `ctx.fetchJson`; do not use direct `fetch` in the adapter. Adding a host to the manifest may require the standard renewed user consent in career-ops on plugin update; describe this in the release notes.

## Scope

- [x] `getmatch` registered as the sixth opt-in source of ru-market; HTTP allows only `/api/offers`, queue concurrency 1 / 1000 ms.
- [x] Configuration, URL normalization, identity by ID and continuation over empty filtered pages wired in. Old orders of three and five sources preserved.
- [x] Synthetic fixture and 11 getmatch scenarios added; integration checks that getmatch reaches the pipeline and scan history through a real guarded context with substituted HTTP.
- [x] Documentation: [getmatch provider page](../providers/getmatch.md); a separate health check `--source getmatch`, without changing the default health.
- [x] README, `examples/portals.yml`, `skill.md`, manifest description and release notes updated; getmatch kept disabled in the example. The undocumented API, absence of mandatory authorization, exclusion of special announcements, page-bound coverage and the legal basis are described.
- [ ] Live pass, confirmation of the pagination contract and of the basis for release not performed. Full descriptions are not copied; the personal portals.yml was not changed.
- [ ] Publish a version with the source as ready to use only after the checks and determination of the terms of use (separate step).

Recommended order of work: clarify terms, check the contract, adapter and fixtures, configuration/network/deduplication, regression and integration checks, bounded dry-run, documentation and release. If the terms are not confirmed, the result is limited to prepared code and local checks; regular collection and release of the source stay deferred.

## Acceptance criteria

1. Mixed output of special announcements and active vacancies is handled; archive and unknown types are excluded.
2. Hidden/estimated salary, a timezone without an offset, incognito and territorial remote are handled correctly.
3. A slug change with one ID, different IDs of identical vacancies and foreign links are handled correctly.
4. An empty result is distinguished from a broken schema; a page without suitable jobs continues; a repeated ID/offset is detected.
5. Pagination works when `offers.length > meta.limit`; the hard page limit, partial failure and stop on access hold.
6. A disabled getmatch in `all`, an explicitly enabled source, old configurations of three/five and the new order of six all work.
7. Only `/api/offers` is allowed: cards, profiles, auth, apply, foreign hosts and non-standard ports stay forbidden.
8. Health makes at most one getmatch request without retries, only when the getmatch check is explicitly enabled; logs contain no payload.
9. `npm test` and `CAREER_OPS_ROOT=../career-ops npm run test:integration` pass. After the terms of use are determined, one bounded live pass through a real `ctx`, then `scan --dry-run`, and the hook fits within the host timeout. The current standard core timeout is 15 seconds; do not increase the number of requests/pages without estimating the total call budget with retries.
10. Readiness: ordinary active vacancies reach the existing pipeline, special announcements are excluded, links are preserved, errors are explicitly diagnosed, old sources work as before, and the permitted storage scope and collection are respected.

## Open decisions

- Permissibility of automatic reading and storage (agreement clause 3.2, robots.txt closing `/api/`): see Decisions, section 1.
- Live pagination contract, behaviour of special announcements in `meta.total`, filter values and the timezone of `published_at`: see Decisions, section 2.
- Whether the `sa`, `pa`, `se`, `l` filters (added later as experimental and unverified, see [provider-architecture-review.md](provider-architecture-review.md)) behave as inferred from client code.
- Whether the source can be released as ready to use and enabled in scheduled scans or health CI.
