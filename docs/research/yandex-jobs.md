# Research: Yandex vacancies

Status: Reference
Date: 2026-10-07
Type: research

## Question

Can vacancies from Yandex's career site be added as a source, technically and under its published terms? Checked on 7 October 2026.

## Findings

Result: no documented public vacancy API was found; public pages can be read through a web tool. The Playwright check was not performed because no browser was attached. Compliance of automated collection with the platform terms is not confirmed: for the Russian career site a restriction on using content outside its functionality was found.

### What this source is

[yandex.com/jobs](https://yandex.com/jobs) is Yandex's career site with vacancies of its companies, not a general board of vacancies from different employers. The public listing is available in [English](https://yandex.com/jobs/vacancies) and [Russian](https://yandex.ru/jobs/vacancies?text=Python). The visible interface allows reading the catalogue without login; authorization is offered separately for applying. A public catalogue does not establish how the internal ATS works.

For the Russian market it makes sense to study `yandex.ru/jobs`: the `.com` listing differs in language and contains international positions. Equal catalogue completeness, equivalence of cards and the relation between their identifiers were not checked.

### API

Public pages and search queries about a Yandex Jobs API and a vacancy API on Yandex domains were checked. No documentation, supported catalogue endpoint, response schema or licence for a vacancy API was found. This is the result of a limited search, not proof that no API exists.

The DataSphere Jobs API and Search API that turn up belong to other products and do not confirm a career catalogue API. XHR/fetch requests of the interface were not studied: no browser was attached. An unknown internal JSON endpoint, even if reachable without a key, must not automatically be considered an open and permitted API.

### Page availability and parsing

The web tool read the main page, the `.com` catalogue, the Russian listing for `text=Python` and the [English SRE card](https://yandex.com/jobs/vacancies/site-reliability-engineer-ydb-8260). This confirms that the text is available to that tool, but does not prove that the full catalogue is present in the source HTML of an ordinary HTTP response: the tool may have rendered the page or used an index.

Observations on the listing:

- There are links to individual cards, titles, teams, short descriptions, cities, work formats and skills.
- `text=Python` is used as the text search parameter. Site links also contain `work_modes`, `services`, `skills` and `pro_levels`; the full set of values and filter combinations were not checked.
- An example card path: `/jobs/vacancies/site-reliability-engineer-ydb-8260`. There are also cards with a Cyrillic slug. The full path contract and the stability of the numeric suffix are not established.
- The Russian listing has a `Показать ещё` ("Show more") control. The loading mechanism, cursor/offset, chunk size and end-of-list condition are not established. Collecting all vacancies from the first page cannot be promised.
- Publication dates and salaries are not confirmed as universal fields. Do not derive them from the age of the search index, the check date or general benefits.

An attempt to attach a browser through the `browser:control-in-app-browser` skill ended with the message `No browser is available`; the list of available browsers is empty. Local `playwright` and `puppeteer` packages are also absent. DOM selectors, network responses and the operation of the `Показать ещё` button via Playwright were not checked; no ready parser was created.

### Terms of use

A dedicated [user agreement of the career site](https://yandex.ru/legal/yandex_job_rules/ru/) was found, published on 30 March 2026. It explicitly names `https://yandex.ru/jobs` and extends acceptance of the terms to access to content, not only to submitting an application.

Clause 2.3 restricts use of content to the site's functions; other ways require prior written permission of the company or the right holder. Clause 4.3 prohibits actions that disrupt normal operation of the site. No separate direct prohibition called "parsing" was found in the text, but this does not cancel the restriction of clause 2.3.

My assessment for the plugin: automatic extraction and storage of cards in a third-party application may go beyond the permitted functionality. There are not enough grounds to claim that such a scenario is permitted. This is an assessment of the platform terms, not a final conclusion on the lawfulness of any way of reading the data. Questions of copyright, database rights and possible exceptions need a separate assessment of the specific scenario.

The agreement explicitly refers to `.ru`. Applicability of the same document to `.com` is not established separately; an attempt to open `https://yandex.com/legal/yandex_job_rules/` did not return a document. Switching the domain does not by itself confirm permission.

[robots.txt for `.ru`](https://yandex.ru/robots.txt) contains, in the `User-agent: *` group, a ban on `/jobs/skill-diagnostic/private/*`; no general ban on the public `/jobs/vacancies` was found. No rule with `jobs` was found in [robots.txt for `.com`](https://yandex.com/robots.txt). These are crawling instructions, not a licence to extract and reuse content. A future specific API path will need a separate check.

### What is needed to return to integration

By the task condition, a plan for adding the source is written after the permissibility of use is confirmed. That criterion is not met now.

1. Ask the owner, through the [official feedback](https://yandex.ru/jobs/vacancies?text=Python) linked in the footer, whether an API/feed exists and whether periodic reading for personal search is permitted. Separately clarify permitted fields, local storage, public distribution of the plugin and limits. No message to the owner was sent as part of this research.
2. Obtain written permission or official API terms that allow the required scenario, and determine the applicable domains.
3. After that, perform a bounded browser check of search and `Показать ещё`: establish the public endpoint or DOM route, pagination, fields, handling of empty results and removed vacancies. Do not touch applications and candidate profiles.
4. On the basis of the confirmed contract, write a separate adapter plan with explicit enabling of the source, compatibility of orders of three and five sources, bounded hosts/paths, a request queue, deduplication and partial-error checks. Whether to prefer the API or ordinary HTML is decided by the check result; the need for a browser in the runtime is not established yet.

The current implementation, `allowedHosts`, configuration examples and the release version of the plugin do not change.

## Sources

- [yandex.com/jobs](https://yandex.com/jobs), [English listing](https://yandex.com/jobs/vacancies), [Russian listing](https://yandex.ru/jobs/vacancies?text=Python)
- [English SRE card](https://yandex.com/jobs/vacancies/site-reliability-engineer-ydb-8260)
- [Career site user agreement](https://yandex.ru/legal/yandex_job_rules/ru/)
- [robots.txt .ru](https://yandex.ru/robots.txt), [robots.txt .com](https://yandex.com/robots.txt)

## Conclusion

The source is not added to the plugin and no implementation plan is written until the owner confirms permitted use (API/feed or written permission). Technical readability of public pages is established only through a web tool; the browser-level contract (DOM, XHR, pagination) is unverified.
