# Plan: Serbian vacancy sources

Status: In progress
Date: 2026-10-09
Type: roadmap

HelloWorld.rs shipped in 0.6.0 (see [HelloWorld.rs plan](helloworld-provider.md) and the [provider page](../providers/helloworld-rs.md)). Poslovi Infostud and Poslovi.rs are still planned.

## Problem

Add Serbian job boards to the existing `ru-market` plugin, keeping its `id`, the vacancy format and compatibility with the current `portals.yml`. Adding the Serbian sources was deferred when this plan was written: adapters, configuration, network permissions and tests were not part of the then-current implementation. Below are the research results and the tasks for future implementation.

### Sources and order

| Queue | Source | First check |
| --- | --- | --- |
| 1 | [Poslovi Infostud](https://poslovi.infostud.com/rss) | Official RSS, the last 20 vacancies and links to cards |
| 2 | [HelloWorld.rs](https://www.helloworld.rs/oglasi-za-posao) | IT search, filters, pagination and permanent links |
| 3 | [Poslovi.rs](https://www.poslovi.rs/jobs/categories) | Current IT category, listing volume and cards without login |

For each source, assess separately the technical availability of public vacancies and the restrictions in the platform terms. A public page confirms neither adapter stability nor permission for automated collection. For personal search the plan is to keep minimal fields and a canonical link to the original; do not touch accounts, candidate personal data, closed interfaces and pages behind CAPTCHA. Before implementation check pagination, update frequency and robots.txt for the specific paths.

### Result of the first check

| Source | Status | Basis and next step |
| --- | --- | --- |
| HelloWorld.rs | Technical candidate, explicit terms conflict | The [public Python listing](https://www.helloworld.rs/oglasi-za-posao/python/stranica/0) shows dozens of IT vacancies and pages without login. The [terms](https://helloworld.rs/uslovi-koriscenja) prohibit automated use of the system and restrict passing on content. Check a stable path, pagination and cards; the plan covers only short fields and a link, with an explicit note that compliance with the terms is not confirmed. |
| Poslovi Infostud | First candidate via official RSS | The [official RSS page](https://poslovi.infostud.com/rss) permits automatically obtaining vacancies and contains a link to the last 20 listings. For **placing the RSS on a site** the same page states a restriction: do not combine vacancies of other platforms without agreement. The [general terms](https://nalog.infostud.com/privatnost-uslovi) restrict automated use of the site and passing on content. Check the feed format and suitability for personal search without public republication; assess HTML search separately. |
| Poslovi.rs | Technical candidate, low value for IT | The [general listing](https://www.poslovi.rs/jobs) and the [category list](https://www.poslovi.rs/jobs/categories) are publicly available; the IT category had only 3 vacancies at the time of the check. The [published terms](https://www.poslovi.rs/uslovi-i-pravila-koriscenja) are addressed to employers, so they do not confirm permission for automated collection of the candidate-facing listing. The old `/kategorija/it` showed a JS stub. Check the current IT category path, cards and suitability of HTML; do not treat page availability as the platform's consent. |

Checking `robots.txt` of the three Serbian sites through the available tools failed; the crawl status of specific paths remains unknown. Until the route is technically checked, Serbian hosts are not added to `allowedHosts`, and the configuration example below stays only a draft. The nearest check is the Poslovi Infostud RSS, then the public IT listing of HelloWorld.

## Decisions

### Configuration and compatibility

1. Keep `provider: ru-market` and the `ru_market` key: installed users will need no migration.
2. Add an optional `ru_market.market: ru | rs | all` with default `ru`. The value `ru` must select the same sources as the current `source: all`; the value `rs` limits the selection to Serbian sources. Each new source is disabled by default and enabled explicitly in `sources`.
3. For `primary_source_order` keep accepting the existing lists of three and five sources. Allow a new order of Serbian sources, reject unknown and repeated names, and append unspecified sources in a stable order.
4. Add to `allowedHosts`, URL checking and the request queue only confirmed hosts and public listing pages. Bound the number of pages and requests per host.

Assumed example after implementing the first two sources:

```yaml
ru_market:
  market: rs
  source: all
  max_pages: 2
  sources:
    helloworld_rs:
      enabled: true
      queries: [Python, Data Engineer]
    infostud:
      enabled: true
      queries: [Python, Data Engineer]
```

Names of search and filter fields are to be finally chosen after checking the platforms. The example above is not supported by the plugin yet.

### Adapter implementation

- Each adapter returns the current `provider.fetch` contract: title, canonical link, company, place, description, publication date and vacancy salary, when it is really stated. `note` contains the exact source.
- Support Serbian Latin and Cyrillic, local date formats, RSD/EUR and designations of office, hybrid and remote work. Do not turn a company rating or a market salary estimate into vacancy fields.
- Remove tracking marks from links and check the host and path of the card before adding a vacancy. Keep alternative links when a match between HelloWorld and Infostud vacancies is confirmed.
- On partial failure keep the vacancies found and output the error category, query number, page and HTTP status, without vacancy text, personal data and the search string.

### HelloWorld.rs: agreed scope and stages

Discussion of 2026-10-09: the current priority is the HelloWorld.rs integration plan. The queue above keeps the results of the initial research. At the time of the discussion implementation had not started; the [verified fields and limitations](../research/helloworld.md) are separated from design decisions. The detailed steps, the shape of shared fields and the acceptance criteria are collected in the [HelloWorld.rs plan](helloworld-provider.md). It refines the initial configuration proposals for the first release of one source.

Accepted:

- Configurable search phrases; merging of results and removal of duplicates.
- Vacancies with a workplace in Serbia and remote work with Serbia explicitly permitted. Unclear geography is kept as unknown.
- The first version uses the fields of the HTML listing without extra requests for full descriptions. The end date does not become `postedAt`; an unknown salary period stays unknown.
- Seniority and technologies must have a shared structured representation. Support for filtering them in career-ops is included as a separate stage and is not considered an existing configuration capability.
- The seniority scale is agreed with core: `intern / entry / mid / senior`. HelloWorld labels are normalized as `Junior -> entry`, `Intermediate -> mid`, `Senior -> senior`; source labels are kept. A missing or unrecognized label does not turn into `mid`; the level stays unknown.
- All explicitly stated seniority levels and technologies are kept as lists; one level is not chosen instead of several, skills are not derived from the job title.
- A missing seniority or technologies does not exclude a vacancy; the corresponding new filter lets unknown data through. Further assessment is done in the rank pipeline, without assuming guaranteed rejection of such records.
- The first adapter release is allowed before the new core filters are ready. Availability of metadata and availability of filtering are documented separately.

Stages of the resulting plan:

1. **Data contract and the HelloWorld.rs adapter.** Define the shape of shared optional seniority and technology fields; the level scale and keeping source labels are agreed above. The adapter obtains the listing, normalizes facts and passes them to the consumer. Use the existing fields for places, work format and `compensation`.
2. **Shared filters in career-ops are a separate roadmap task.** [Scope and acceptance criteria](core-job-filters.md). This stage does not block the first adapter release. Selection rules belong to core; the adapter provides data.
3. **Joint check and documentation.** Check the path from HTML through the shared Job to core filters, unknown values and the existing RU sources. Add configuration examples and explicitly describe the capabilities of each version.

The product decisions Q1-Q8 are recorded; the technical shape of the lists is proposed in the detailed plan. Filtering decisions are moved to a separate roadmap task; a missing metadata is not by itself a reason for exclusion.

## Scope

### Poslovi Infostud RSS adapter plan

- [ ] Check the live feed `https://rss.infostud.com/poslovi/`: availability, XML structure and the presence of the last 20 vacancies. The previous prototype was checked only on fixtures; a live request from the development environment could not be made.
- [ ] Create `lib/infostud.mjs` with an RSS parser and the `fetchInfostud` adapter, register the `infostud` source in `index.mjs`.
- [ ] Add an explicitly enabled `sources.infostud` with mode `rss`. Without `queries` return the whole feed; a given non-empty list of queries is checked locally against the title and short description, case-insensitively. Make one request to the feed regardless of `max_pages`.
- [ ] Keep support for `primary_source_order` of three and five existing sources, extending the order with the new source.
- [ ] Add `rss.infostud.com` to `manifest.json` and the request queue. Allow only the HTTPS path `/poslovi/` without query parameters, credentials and a non-standard port; pass RSS/XML in the `Accept` header.
- [ ] Accept only links `https://poslovi.infostud.com/posao/<title>/<company>/<numeric-id>`, remove tracking parameters and the trailing slash. Add the card host to URL normalization and the source name to deduplication.
- [ ] Parse CDATA and XML entities, clean description HTML, limit the description to 300 characters. Keep company, place and date when available; do not write an invalid date.
- [ ] Keep valid items when other items have damaged links. Reject an unknown format, damaged RSS items and a non-empty feed without valid links with category `broken-markup`.
- [ ] Restore the checks: explicit enabling and compatibility of RU configurations, local filtering, empty and damaged RSS, CDATA and entities, optional fields, description limit, canonical URLs, deduplication and one request, ban on foreign hosts and credentials, diagnostics of HTTP errors and keeping results when another source fails.
- [ ] After the live check add the source to the README and `examples/portals.yml`, stating the limit of the feed to the last 20 vacancies and local filtering.
- [ ] Evaluate Poslovi.rs after a useful IT listing is confirmed.

## Acceptance criteria

1. For each source add fixtures and checks for an ordinary and an empty listing, pagination, a damaged response, access denial, canonical links and optional fields.
2. Then run one bounded live request, `npm test`, an integration `scan --dry-run` and the plugin audit.
3. Check separately the HelloWorld and Infostud deduplication and that the behaviour of existing RU configurations is unchanged.
4. Release a separate version with the first technically confirmed source, keeping the restrictions of its terms of use in the documentation. First check the official Poslovi Infostud RSS, then HelloWorld.rs HTML; for HTML record the conflict with the platform terms separately.
5. README and the `portals.yml` example show only really working sources, and monitoring checks enabled sources one page at a time without saving vacancies.

## Open decisions

- Final names of search and filter fields for the Serbian sources (after checking the platforms).
- Crawl status of the specific paths: `robots.txt` of the three sites could not be checked.
- Whether the explicit terms conflicts (HelloWorld.rs, Poslovi Infostud general terms) allow even a personal-search adapter.
- Whether Poslovi.rs has enough IT vacancies to be worth an adapter.
