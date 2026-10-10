# getmatch

Status: Implemented
Date: 2026-10-10
Type: guide

## Status

Experimental, opt-in. Released as a sixth optional source in 0.4.0; experimental filters added in 0.7.0. The undocumented endpoint, the permitted usage and live pagination are unverified: the code is experimental until permitted usage and live pagination are confirmed. Implementation and verification use synthetic fixtures; no live collection, scheduled health or release was enabled. See the [research](../research/getmatch.md) and the [implementation plan](../roadmap/getmatch-provider.md) for the outstanding usage conditions.

## Transport and access

- The undocumented `https://getmatch.ru/api/offers` endpoint through `ctx.fetchJson`, adapter `lib/getmatch.mjs`. No token, cookies or browser. `mode` accepts `api` and `auto`; `auto` has the same API behaviour and does not launch a browser.
- Authorization: none.
- Disabled by default. Adding the declared host `getmatch.ru` may require normal renewed plugin consent on upgrade.
- `lib/http.mjs` allows only the exact path `/api/offers`; cards, profiles, auth and apply paths stay forbidden.

## Configuration

```yaml
job_boards:
  - name: getmatch
    provider: ru-market
    ru_market:
      source: getmatch
      sources:
        getmatch:
          enabled: true
          mode: api
          max_pages: 1
          per_page: 20
```

Accepted options: `enabled`, `mode`, `max_pages` (1-20), `per_page` (1-100) and the experimental filters below. For `source: all`, explicitly enable getmatch in `sources`; the two default sources remain unchanged. Priority lists containing the two core sources, the four, five or all six sources are accepted; missing optional sources are appended in stable order. Keep the default single page: larger scans/retries may exceed the core hook budget.

Experimental filters `sa`, `pa`, `se`, `l` (UNVERIFIED), opt-in and off by default. The parameter names were inferred from the public client code ([research](../research/getmatch.md)); their values and behaviour were never observed against the live API, and this change made no live request. They may be wrong or unstable. Without these options requests are identical to 0.6.0 (`p`, `offset`, `limit`). With them, only these parameters are added:

```yaml
getmatch:
  enabled: true
  sa: 300000        # single value, passed verbatim as sa
  pa: 7             # single value, passed verbatim as pa
  se: [senior]      # up to 10 values, repeated se=
  l: [Москва]       # up to 10 values, repeated l=
```

Values are short strings or numbers (letters, digits, space, `_.:-`, up to 64 characters). The meaning of the parameters (salary, publication period, seniority, location) comes from client code only. Tests cover URL building from fixtures, not server behaviour.

## Filters

Supported (request level): `p`, `offset`, `limit`, and the experimental `sa`, `pa`, `se`, `l`.

Not supported: no server-side free-text, remote or `sp` specialization filter; `s`, `from_date`, `to_date`, `sp`, `pl`, `c` and `exclude_applied` are deliberately not implemented. Career-ops filters apply only to the loaded pages.

## Output fields

Common fields of [all adapters](README.md#common-behaviour), plus:

- Only active ordinary vacancies (`offer_type` `vacancy`, `is_active`) are retained. Special announcements and unknown promotion types are excluded.
- Employer (omitted for incognito publications), canonical vacancy URL, location labels with work format and territorial restrictions, and explicit salary metadata are preserved.
- Hidden or estimated salaries are excluded; a missing currency is not inferred. Gross/net and "total compensation" notes are added only when stated.
- Full job descriptions and account/application fields are not copied.
- Publication timestamps without an explicit timezone are omitted (`postedAt` absent).
- The numeric vacancy ID remains the dedup key when a URL slug changes.

Location format labels are emitted in Russian by the adapter, for example `Офис`, `Гибрид`, `Удалённо`, and `Исключено: ` for excluded places.

## Limits

- Pagination assumes `p=1` at offset zero and advances by `meta.limit` (not by the number of returned offers, because promotions are injected outside the page size). An empty filtered page can continue when metadata says another page exists.
- Wrong offsets and repeated ordinary vacancy IDs are diagnostic errors. First-page failure fails the source; later failure preserves earlier pages with `partial` status. Access errors are not retried and stop the remaining routes. Network/5xx/429 use the existing bounded retry policy.
- The queue starts at most one request per second with concurrency 1; this is an internal conservative setting, not a published getmatch rate limit.

## Known issues

- The API is internal and undocumented; availability and structure may change.
- The terms of use (agreement clause 3.2) restrict copying and robots.txt closes `/api/`; a technically reachable endpoint is not permission. See the [research](../research/getmatch.md).
- Live pagination and the behaviour of the experimental filters are unverified.
- Do not enable getmatch in scheduled scans or default health checks.

## Verification

- Tests: `npm test` (`test/getmatch.mjs`, `fixtures/getmatch/normal.json`); integration checks synthetic/offline scan with a substituted HTTP layer.
- Health check, explicit only: `node scripts/health.mjs --career-ops ../career-ops --source getmatch`. It makes one listing request and does not retry or request vacancy details.
