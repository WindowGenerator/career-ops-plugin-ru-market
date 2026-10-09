# HelloWorld.rs

Optional Serbian IT job-board source in the existing `ru-market` provider.

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

`html` and `auto` both use public HTML listings. Queries are required when enabled:
1–20 nonempty strings, at most 500 characters each, with duplicates removed.
`max_pages` is 1–20 per query (default 1). Unsupported source options are rejected.
`source: all` includes HelloWorld only when explicitly enabled. Legacy three-,
five- and six-source precedence orders still work; the new source is appended.

Each phrase is sent as keyword parameter `q`; the site's `/python/` route is a
technology filter and is not used. Results can include jobs whose title does not
contain the exact query. Pagination follows validated next links at offsets of
30. The page budget, exhausted results, partial failures and access blocks appear
in source/query diagnostics. Access blocks stop later queries. Duplicate numeric
IDs merge query matches, including when the title/company URL slug changes.

Fields include title, employer, original URL, raw location and work arrangement,
explicit salary, `seniority: { levels, rawLabels }` and `skills`. Junior maps to
entry, Intermediate to mid, Senior to senior. All explicit labels/tags are kept;
unknown labels retain raw text without an invented level. Tags do not become a
fabricated description. Missing metadata does not exclude a job.

`Rad od kuće` / `Remote` means remote work, not verified eligibility from Serbia.
City-only listings retain an unknown work arrangement. `Inostranstvo` (abroad)
is not a named city or a verified country restriction. Ambiguous comma-separated
places remain one raw place label; the adapter does not infer multiple cities.
The listing lacks reliable eligibility restrictions, so unknown geography is
retained for later evaluation. There is no country-exclusion guess based on a
company, site domain or remote badge.

Observed salaries such as `2.600,00 - 2.700,00 EUR (net)` preserve amounts,
currency and taxes, but the period remains `unknown`. Unrecognized notation is
kept as raw text. No full descriptions, publication dates or complete history are
provided: the visible listing date is an expiry date. Empty keyword searches
show unrelated newest advertisements; these are explicitly excluded.

The direct plugin-provider preserves the new optional fields. Existing core
filters/display and the companion local-parser do **not** yet consume/pass
through seniority and skills. That work is tracked separately in
[core-job-filters](roadmap/core-job-filters.md) and does not block this adapter.

Health (no writes, one page of one explicit query, no retries):

```sh
npm run health -- --source helloworld-rs --career-ops ../career-ops
```

The host `www.helloworld.rs` is declared in the manifest; the HTTP allowlist
permits only HTTPS listing routes, not detail pages. No account access, browser
fallback or CAPTCHA bypass is implemented. Public HTML access does not establish
permission to download/reuse content: the observed footer prohibits downloading
without permission, older indexed terms restrict automation, and the complete
current terms could not be verified. See the
[research and source links](helloworld-provider-research.md). This source remains
opt-in and subject to its published access/content limitations.
