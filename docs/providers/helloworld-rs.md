# HelloWorld.rs

Status: Implemented
Date: 2026-10-10
Type: guide

## Status

Implemented in 0.6.0 as an optional Serbian IT job-board source in the existing `ru-market` provider. Disabled by default. Live smoke on 2026-10-09: one request `q=Python`, one page, 30 vacancies. The source stays opt-in and subject to its published access and content limitations. Plan: [HelloWorld.rs plan](../roadmap/helloworld-provider.md); research: [research](../research/helloworld.md).

## Transport and access

- Public HTML listing `https://www.helloworld.rs/oglasi-za-posao`, adapter `lib/helloworld.mjs`. `html` and `auto` both use public HTML listings.
- Authorization: none.
- The host `www.helloworld.rs` is declared in the manifest; the HTTP allowlist permits only HTTPS listing routes, not detail pages. No account access, browser fallback or CAPTCHA bypass is implemented.
- Public HTML access does not establish permission to download or reuse content: the observed footer prohibits downloading without permission, older indexed terms restrict automation, and the complete current terms could not be verified (see the [research](../research/helloworld.md)).

## Configuration

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
          mode: html
          queries: [Python, Data Engineer]
```

Options: `enabled`, `mode`, `max_pages` (1-20 per query, default 1), `queries`. Queries are required when enabled: 1-20 nonempty strings, at most 500 characters each, duplicates removed. Unsupported source options are rejected. `source: all` includes HelloWorld only when explicitly enabled. Legacy three-, five- and six-source precedence orders still work; the new source is appended.

## Filters

Supported (request level): each phrase is sent as keyword parameter `q`; pagination follows validated next links at offsets of 30.

Not supported: the site's `/python/` route is a technology filter and is not used; the site filters `workplace[]`, `senioritet[]`, `city` and `vreme_postavljanja` are not used. Results can include jobs whose title does not contain the exact query. Core filtering of `seniority` and `skills` is not available yet ([core-job-filters](../roadmap/core-job-filters.md)).

## Output fields

Common fields of [all adapters](README.md#common-behaviour), plus:

- Title, employer, original URL (`/posao/<title>/<company>/<id>`), raw location (`locationText`) and work arrangement, explicit salary, `seniority: { levels, rawLabels }` and `skills`.
- Junior maps to `entry`, Intermediate to `mid`, Senior to `senior`. All explicit labels/tags are kept; unknown labels retain raw text without an invented level. Tags do not become a fabricated description. Missing metadata does not exclude a job.
- `Rad od kuće` / `Remote` means remote work, not verified eligibility from Serbia. City-only listings retain an unknown work arrangement. `Inostranstvo` (abroad) is not a named city or a verified country restriction. Ambiguous comma-separated places remain one raw place label; the adapter does not infer multiple cities. Unknown geography is retained for later evaluation; there is no country-exclusion guess based on a company, site domain or remote badge.
- Observed salaries such as `2.600,00 - 2.700,00 EUR (net)` preserve amounts, currency and taxes, but the period remains `unknown`. Unrecognized notation is kept as raw text.
- No full descriptions, publication dates or complete history are provided: the visible listing date is an expiry date, not `postedAt`. Empty keyword searches show unrelated newest advertisements; these are explicitly excluded.

The direct plugin provider preserves the new optional fields. Existing core filters/display and the companion local-parser do not yet consume or pass through seniority and skills. That work is tracked in [core-job-filters](../roadmap/core-job-filters.md) and does not block this adapter.

## Limits

- Queue: one request at a time, 1000 ms spacing (internal setting). Timeout 10 s, bounded retries for transient errors.
- The page budget, exhausted results, partial failures and access blocks appear in source/query diagnostics. An access block stops later queries (they are reported as skipped). Duplicate numeric IDs merge query matches, including when the title/company URL slug changes.

## Known issues

- The terms/permission question above is unresolved.
- Real multi-city listings were not observed; multi-city handling is a synthetic check only.
- No observed example yet for RSD salaries or an explicit pay period.

## Verification

- Tests: `npm test` (`test/helloworld.mjs`, `fixtures/helloworld-rs`; fixture provenance in [fixtures/helloworld-rs/README.md](../../fixtures/helloworld-rs/README.md)); integration with network fixtures through `test/integration.sh`.
- Health check (no writes, one page of one explicit query, no retries):

```sh
npm run health -- --source helloworld-rs --career-ops ../career-ops
```
