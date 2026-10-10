# HelloWorld.rs: vacancy presentation and the shared contract

Status: Reference
Date: 2026-10-09
Type: research

## Question

How does HelloWorld.rs present vacancies, and how do they map to the shared `Job` contract of the plugin and core? Checked on 2026-10-09. This is research and input for a plan, not an implemented adapter. Accepted product scope: configurable search phrases, listing fields without loading full descriptions, Serbian vacancies and remote work available from Serbia; unknown geography is kept as unknown.

References to `career-ops/...` paths below point to the read-only sibling core checkout, not to files of this repository.

## Findings

### Verified primary sources

| Source | Observation |
| --- | --- |
| [Python listing](https://www.helloworld.rs/oglasi-za-posao/python/stranica/0) | Direct HTTP 200, full HTML, 56 results, 30 cards on the first page. This is the technology filter `tag=69`, not an arbitrary keyword query. |
| [Second page](https://www.helloworld.rs/oglasi-za-posao/stranica/30?tag=69&disable_saved_search=0) | HTTP 200, 26 cards. The next page is set by offset 30; the link is present in `rel=next`. |
| [Data Engineer search](https://www.helloworld.rs/oglasi-za-posao?q=Data%20Engineer) | HTTP 200, 96 results; the next URL keeps `q`. A vacancy title need not contain the exact phrase. |
| [Listing with salary](https://www.helloworld.rs/oglasi-za-posao?salary=on) | HTTP 200, real EUR/USD amounts with separators such as `2.600,00`, marked `(net)` / `(gross)`, with no pay period on the card. |
| [Data Engineer, Bel-Dev, 760224](https://www.helloworld.rs/posao/Data-Engineer/Bel-Dev-d.o.o/760224) | HTTP 200; checked only to establish date semantics. The listing shows `25.10.2026.`, the card JSON-LD contains `datePosted=2026-10-07`, `validThrough=2026-10-26T00:00:00`. |
| [robots.txt](https://www.helloworld.rs/robots.txt) | HTTP 200; `/oglasi-za-posao` and `/posao` are not disallowed, `/auth/` and `/konkurs/` are disallowed. |

Result counts are a snapshot of the check, not a guarantee of future volume. At first the web tool returned the Python listing from an old index; the numbers above were obtained by a direct HTTP request. The initial DNS error occurred in a restricted network environment; after network access was permitted the requests succeeded. JavaScript or a browser is not required for the verified listing pages.

### What the listing card actually contains

Different records from the first and second Python pages and from the keyword listing were checked:

| Example | Visible place / mode | Seniority and technologies |
| --- | --- | --- |
| Data Engineer, Bel-Dev | `Beograd | Hibrid` | `Senior`; SQL, Python, Batch, Kubernetes |
| Data Platform Engineer (DataOps), Keba | `Novi Sad` | `Intermediate`; SQL, Git, Python, Docker |
| Associate Development Operations Engineer, Clarivate | `Beograd | Hibrid` | `Junior`; Linux, Git, Python and other tags |
| Application Security Engineer, CCBill | `Rad od kuće` | `Intermediate`; .NET, C#, JavaScript and other tags |
| Founding GPU Engineer, Fuse Energy | `Remote` | `Senior`; Node, C++, Python, C, CUDA |
| Data Scientist GenAI, Madiff | `Inostranstvo, Inostranstvo | Rad od kuće` | `Intermediate`; Python, R |

Table sources: [first page](https://www.helloworld.rs/oglasi-za-posao/python/stranica/0), [second page](https://www.helloworld.rs/oglasi-za-posao/stranica/30?tag=69&disable_saved_search=0). `Inostranstvo` means abroad, not a list of permitted countries. The repeated word is an observed feature of the data. No reliable example of two different named cities was found in the checked sample: an arbitrary string cannot yet be split at every comma.

In the HTML, title links are marked `__ga4_job_title` and `data-job-id`; the employer is an `h4`, sometimes without a link. The place is next to `la-map-marker`, the date next to `la-clock`, the salary next to `la-coins`; technologies have the class `jobtag`. Company ratings, benefits and promotional elements are nearby but are not salary fields or a job description. These selectors are an observation of the current [listing](https://www.helloworld.rs/oglasi-za-posao/python/stranica/0), not a public API contract.

The form has filters `workplace[]=office|remote|hybrid`, `senioritet[]=1|2|3`, `city`, `vreme_postavljanja=today|2|3|7`. Their presence was verified in the HTML; the behaviour of all combinations was not. A city without an explicit mode label does not by itself prove office work: the Keba example should be normalized with `workArrangement=unknown` until a separate observable field confirms `onsite`. [Source](https://www.helloworld.rs/oglasi-za-posao/python/stranica/0).

### Proposed mapping to the existing Job

The shared constructor already provides most of the needed fields: [lib/normalize.mjs](../../lib/normalize.mjs). The proposal is to use it, adding only HelloWorld rules; rewriting the other adapters is not required.

| Source data | Job field | Rule / limitation |
| --- | --- | --- |
| Title and employer | `title`, `company` | Text of the specific card; do not append a rating to the name. |
| `/posao/<title>/<company>/<id>` | `url`, `sourceId` | HTTPS, verified host/path, strip query/fragment; check the numeric ID from the path against `data-job-id`. |
| Source | `source`, `transport`, `note` | Proposal: `helloworld-rs`, `html`, note starting with `source: helloworld-rs`. The YAML key may be `helloworld_rs`. |
| Original place string | `locationText` | Keep the source text, including the mode label. |
| Place for the existing interface | `location` | A readable string with explicit `Hybrid` / `Remote`, because old filters read exactly this string. |
| Individual known places | `locations` | Only confirmed labels; do not turn `Remote` into a city or country. An empty array is acceptable for a mode-only string. |
| `Hibrid`, `Rad od kuće`, `Remote` | `workArrangement` | `hybrid`, `remote`, `remote` respectively; `onsite` only with explicit confirmation, otherwise `unknown`. |
| Date next to the clock | Not `postedAt` | The verified example shows the listing expiry, not publication. In listing-only v1 `postedAt` is absent. |
| Missing description | `hasDescription=false`, `dataLevel=listing` | `description` absent; do not substitute technologies for a description. |
| Listing salary | `compensation` | Explicit amount, currency, net/gross, source text; do not guess an unknown period. |
| Matched search phrase | `matchedQueries` | Already produced by the shared [paginate](../../lib/paginate.mjs); query matches are merged by [dedup](../../lib/dedup.mjs). |
| Eligibility from Serbia | `eligibility.status=unknown` | The current contract supports only unknown; Remote and a Serbian site do not by themselves confirm the right to work from Serbia. |
| Seniority and technologies | Shared optional lists | Level scale `intern / entry / mid / senior`; all explicit levels/technologies and source labels are kept. Filtering is a separate core stage. |

`helloworld-rs` matches the current extraction of source via `[a-z-]+`: an underscore in the source ID would be truncated. See [lib/dedup.mjs](../../lib/dedup.mjs).

Geographic selection and legal/contractual eligibility are different things. For v1, listings with Serbian places, with explicit permission for Serbia and with unknown remote geography may be kept; only explicitly incompatible restrictions are excluded. The checked listing has too little information to confirm that Serbia is permitted for a generic Remote. Keeping unknown records is an accepted product decision, not confirmation of availability. Do not make hidden card requests to change this.

### Salary: units matter more than having a number

Observations from one [salary listing](https://www.helloworld.rs/oglasi-za-posao?salary=on):

| Visible text | Correct numbers | Tax basis | Period |
| --- | --- | --- | --- |
| `2.600,00 - 2.700,00 EUR (net)` | 2600-2700 EUR | net | unknown |
| `14,00 - 18,00 EUR (net)` | 14-18 EUR | net | unknown |
| `48.000,00 - 90.000,00 USD (gross)` | 48000-90000 USD | gross | unknown |
| `120,00 - 200,00 USD (gross)` | 120-200 USD | gross | unknown |

The magnitude of an amount does not prove month/hour/year. These cards show no period; for the first one the surrounding HTML was additionally checked. The `price:1, currency:RSD` seen in analytics JavaScript describes a commerce event and is not a salary. No RSD vacancy salary was found in the checked sample.

The current [parseSalary](../../lib/normalize.mjs) and [parseCompensation](../../lib/compensation.mjs) are not designed for `2.600,00` and RSD. The minimal change is a small parser for the source format feeding the existing `normalizeCompensation`, without changing common units or currency conversions. Keep an unsupported or ambiguous format as `rawText`, with no invented numbers. The legacy `salary` may be derived from the same numbers if needed, but downstream must receive `compensation` with `period=unknown`.

### What core preserves and what it does not yet support

The current sibling core checkout and the shipped [companion/core-contract.patch](../../companion/core-contract.patch) were checked, not a promise of compatibility with any upstream version.

- The direct plugin provider passes the `hook.fetch` result without field projection: core `plugins/_engine.mjs`. Unknown fields may reach scan, but this creates no filtering or interface storage.
- The patched core `providers/local-parser.mjs` explicitly passes `locationText`, `locations`, `workArrangement`, `sourceId`, `compensation`, `matchedQueries`, `hasDescription`, `dataLevel`; `eligibility` is passed only with status `unknown`. Top-level `seniority`, `skills` or `tags` are absent from the allowlist and are lost on this path. The same is visible in the [shipped patch](../../companion/core-contract.patch).
- In core `scan.mjs` the location filter reads `job.location`, country eligibility reads `job.description`, salary reads `job.salary` together with `job.compensation`. One new structural field is not enough to change selection. There is no basis to claim that card technologies already take part in content filters.
- The shared `makeJob` does not yet copy seniority/skills from its input. Simply adding them to the call is not enough. See [lib/normalize.mjs](../../lib/normalize.mjs).

Clarification of existing core filtering: the settings exist, but they work on text, not on separate source tags.

| `portals.yml` setting | What it reads now | Meaning for HelloWorld |
| --- | --- | --- |
| `skip_tiers: [intern, entry]` | `classifyTier(job.title)`; categories `intern`, `entry`, `mid`, `senior` | Filters out Junior in the title, but not a separate Junior badge next to an ordinary title. The classifier assigns an unknown title level to `mid`. |
| `title_filter.positive` / `.negative` | `job.title` | Can look for Python in the title, but not in the card technology. |
| `content_filter.positive` / `.negative`, optional `by_title_keyword` | `job.description`, with the rule chosen by title match | Without a description the record passes this filter even if positive is set. In listing-only v1 it does not filter technology badges. |

Verified in core `scan.mjs` (config reading and filter creation at `3396-3417`, application of `classifyTier(job.title)` at `3647` and `contentFilter(job.description, ...)` at `3669`, `buildContentFilter` at `753` with the empty-description skip at `769`), `title-keywords.mjs` (`218`) and `classify-tier.mjs` (`28`). The setting is named `skip_tiers`; `tiers_classifier` was not found in the checked code/configuration. The behaviour of an ordinary `Software Engineer -> mid` is pinned in core `tests/classify-tier-position.test.mjs`; text positive/negative and skipping a missing description in `tests/content-filter-word-prefix.test.mjs`.

Consequently, agreed filtering of shared structural fields at the core boundary is a planned **extension**, not an existing setting. The priority of an explicit source level over the title heuristic is defined in a separate roadmap task; unknown data is by agreement let through. The change must not be presented as simply switching on a YAML flag.

User decision after the research: include shared structured seniority/technology fields and a separate stage for filtering them in career-ops, in the [integration plan](../roadmap/helloworld-provider.md). The scale `intern / entry / mid / senior` is agreed: `Junior -> entry`, `Intermediate -> mid`, `Senior -> senior`, keeping the source labels. These are normalized values, not literal source values. Missing or unrecognized labels stay unknown and by themselves do not exclude a vacancy. All explicitly listed levels and technologies are kept as lists; the technical shape is proposed in the plan. Do not hide this information inside `description` or `provenance` just to get around the allowlist.

### Target result examples, not output of a working adapter

Based on the verified [Bel-Dev](https://www.helloworld.rs/posao/Data-Engineer/Bel-Dev-d.o.o/760224) listing; without tracking parameters, HTML and full texts:

```json
{
  "title": "Data Engineer",
  "company": "Bel-Dev d.o.o.",
  "url": "https://www.helloworld.rs/posao/Data-Engineer/Bel-Dev-d.o.o/760224",
  "source": "helloworld-rs",
  "sourceId": "760224",
  "transport": "html",
  "location": "Beograd | Hybrid",
  "locationText": "Beograd | Hibrid",
  "locations": ["Beograd"],
  "workArrangement": "hybrid",
  "eligibility": { "status": "unknown" },
  "dataLevel": "listing",
  "hasDescription": false,
  "note": "source: helloworld-rs"
}
```

Finductive salary fragment from the [listing](https://www.helloworld.rs/oglasi-za-posao?salary=on):

```json
{
  "compensation": {
    "min": 2600,
    "max": 2700,
    "currency": "EUR",
    "period": "unknown",
    "taxBasis": "net",
    "rawText": "2.600,00 - 2.700,00 EUR (net)"
  }
}
```

For `Rad od kuće` the proposal is `location="Remote"`, the original `locationText`, `locations=[]`, `workArrangement="remote"`, `eligibility={"status":"unknown"}`. An example of the new seniority and technology lists is in the plan; `postedAt` is absent from all listing-only examples.

### Limits and next checks

The current [terms URL](https://www.helloworld.rs/uslovi-koriscenja) returns a JS loading shell; the indexed older [terms text](https://helloworld.rs/uslovi-koriscenja) contains restrictions on automated use and on passing on content. A direct HTTP request did not confirm their current complete edition. The fresh listing footer still prohibits downloading the content without permission. Permission of paths in robots does not remove this question. The advertised `/rss/` returned HTTP 403 and is not a verified fallback transport.

Before implementation, fixtures are needed for an empty/damaged listing, access denial, a page without a next link, a confirmed multi-location and several seniority levels. There is no observed example yet for RSD and for an explicit pay period. The HTML parser must distinguish absence of results from changed markup. All these checks are bounded adapter validation, not a reason to add a browser fallback, extract full descriptions or change the other sources.

### Addendum during implementation, 2026-10-09

A real example of several levels was found in the saved keyword listing: `Data Engineering Tech Lead` (Madiff, ID 706747) has both visible labels Intermediate and Senior. They are kept in the trimmed fixture `normal.html`.

One direct request with a deliberately absent phrase confirmed that the site shows `(0 oglasa)` and `Trenutno nema oglasa po traženim kriterijumima pretrage.`, but below it, inside the same `__search-results`, places 30 new recommended vacancies (`icampaign=alternate-criteria-results-newest`). The implemented adapter returns an empty result on the confirmed heading/message pair and does not attribute a match with the original query to these recommendations.

A live request of the implemented adapter with `q=Python`, one page: 30 vacancies, 29 with technologies and 30 with a level, `page-limit`, no full descriptions or `postedAt`. This is a check of 2026-10-09, not a guarantee of further availability or volume.

## Sources

- [Python listing](https://www.helloworld.rs/oglasi-za-posao/python/stranica/0) and [second page](https://www.helloworld.rs/oglasi-za-posao/stranica/30?tag=69&disable_saved_search=0)
- [Data Engineer search](https://www.helloworld.rs/oglasi-za-posao?q=Data%20Engineer)
- [Salary listing](https://www.helloworld.rs/oglasi-za-posao?salary=on)
- [Bel-Dev card 760224](https://www.helloworld.rs/posao/Data-Engineer/Bel-Dev-d.o.o/760224)
- [robots.txt](https://www.helloworld.rs/robots.txt)
- [Terms of use](https://www.helloworld.rs/uslovi-koriscenja) and [older indexed terms](https://helloworld.rs/uslovi-koriscenja)
- Repository code: [lib/normalize.mjs](../../lib/normalize.mjs), [lib/compensation.mjs](../../lib/compensation.mjs), [lib/paginate.mjs](../../lib/paginate.mjs), [lib/dedup.mjs](../../lib/dedup.mjs), [companion/core-contract.patch](../../companion/core-contract.patch)
- Core checkout (read-only, outside this repository): `career-ops/plugins/_engine.mjs`, `providers/local-parser.mjs`, `scan.mjs`, `title-keywords.mjs`, `classify-tier.mjs`, `tests/classify-tier-position.test.mjs`, `tests/content-filter-word-prefix.test.mjs`

## Conclusion

The public HTML listing is technically readable without a browser and carries enough fields (title, employer, place and mode, explicit salary, seniority labels, technology tags) for a listing-only adapter. The published access and content terms restrict downloading and automated use, and their complete current edition could not be verified, so the source stays opt-in. Seniority and technologies need shared optional Job fields and a separate core filtering stage; see the [HelloWorld provider plan](../roadmap/helloworld-provider.md) and the [provider page](../providers/helloworld-rs.md).
