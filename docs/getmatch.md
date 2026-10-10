# getmatch — experimental listing source

getmatch is a sixth, optional source inside `provider: ru-market`. It uses the
undocumented `https://getmatch.ru/api/offers` endpoint through `ctx.fetchJson`.
No token, cookies or browser is used. It is disabled by default; `auto` has the
same API behavior and does not launch a browser.

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

Accepted options: `enabled`, `mode`, `max_pages` (1–20), `per_page` (1–100) and the
experimental filters below. There is no server-side free-text, remote or `sp`
specialization filter; `s`, `from_date`, `to_date`, `sp`, `pl`, `c` and
`exclude_applied` are deliberately not implemented. Career-ops filters apply only
to the loaded pages. For `source: all`, explicitly enable getmatch in `sources`;
the two default sources remain unchanged. Priority lists containing the two core
sources, the four, five or all six sources are accepted. Missing optional sources
are appended in stable order.

### Experimental filters `sa`, `pa`, `se`, `l` (UNVERIFIED)

Opt-in, off by default. The parameter names were inferred from the public client
code ([research](getmatch-research.md)); their values and behaviour were **never
observed against the live API**, and this change made no live request. They may
be wrong or unstable; verification happens through health checks and later
releases. Without these options requests are identical to 0.6.0
(`p`, `offset`, `limit`). With them, only these parameters are added:

```yaml
getmatch:
  enabled: true
  sa: 300000        # single value, passed verbatim as sa
  pa: 7             # single value, passed verbatim as pa
  se: [senior]      # up to 10 values, repeated se=
  l: [Москва]       # up to 10 values, repeated l=
```

Values are short strings or numbers (letters, digits, space, `_.:-`, up to 64 characters).
Meaning of the parameters (salary, publication period, seniority, location) comes
from client code only. Tests cover URL building from fixtures, not server behaviour.

Only active ordinary vacancies are retained. Special announcements and unknown
promotion types are excluded. Employer, canonical vacancy URL, location labels,
territorial restrictions and explicit salary metadata are preserved. Hidden or
estimated salaries are excluded; missing currency is not inferred. Full
job descriptions and account/application fields are not copied. Publication
timestamps without an explicit timezone are omitted. Numeric vacancy ID remains
the dedup key when a URL slug changes.

Pagination currently assumes `p=1` at offset zero and advances by `meta.limit`.
Synthetic tests cover this contract; adjacent live pages have not been verified.
An empty filtered page can continue when metadata says another page exists.
Wrong offsets and repeated ordinary vacancy IDs are diagnostic errors. First-page
failure fails the source; later failure preserves earlier pages with `partial`
status. Access errors are not retried. Network/5xx/429 use the existing bounded
retry policy. The queue starts at most one request per second with concurrency 1;
this is an internal conservative setting, not a published getmatch rate limit.
Keep the default single page: larger scans/retries may exceed the core hook budget.

Health excludes getmatch by default. Explicit diagnostic command:
`node scripts/health.mjs --career-ops ../career-ops --source getmatch`.
It makes one listing request and does not retry or request vacancy details.

Read [the research](getmatch-research.md) and [implementation plan](getmatch-provider-plan.md)
for the outstanding usage conditions. Implementation and verification use
synthetic fixtures; no live collection, scheduled health or release was enabled.
The code is experimental until permitted usage and live pagination are confirmed.
Adding the declared host may require normal renewed plugin consent on upgrade.
