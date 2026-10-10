# getmatch.ru: vacancy source research

Status: Reference
Date: 2026-10-07
Type: research

## Question

Can the plugin collect vacancies from https://getmatch.ru/vacancies, technically and under the published terms of use? Checked on 7 October 2026. This is a study of terms and technical availability, not legal advice.

## Findings

### Service and API

getmatch describes itself as a job search and IT recruitment service with candidate and client sides. For the plugin it is interesting mainly as a vacancy board; public vacancies do not imply an open ATS API (see the [users manual](https://getmatch.ru/docs/users-manual)).

A search of public getmatch materials found no third-party vacancy search API documentation, no key issuance procedure, no data licence and no published rate limits. The [archived getmatch vacancy](https://getmatch.ru/vacancies/18595-senior-backend-engineer) mentions development of a Public API for clients, but contains no specification and does not confirm that search is available to external aggregators.

The public list page was read with a plain HTTP GET without login: status 200, `content-type: text/html; charset=utf-8`, `x-powered-by: Next.js`. The saved HTML is about 222 thousand characters and contains filters and the `b-vacancies-list__content-column` container with a loader `aria-label="Загрузка вакансий"`. No links to individual `/vacancies/{id}-{slug}` pages were found. Extracting vacancies from the initial list HTML alone did not work in this check; the absence of cards must not be read as an empty result.

Only public JS resources listed by the page itself were read. In the site version at the check date:

- `/_next/static/chunks/24r948zlcnodp.js` contains `fetchVacancies` and `fetchVacancy`;
- `/_next/static/chunks/1wwo05ckxi2q8.js` defines `API_BASE` as `${NEXT_PUBLIC_API_HOST || ''}/api` and the `apiFetch` wrapper;
- `/_next/static/chunks/2jk53mtji43cb.js` calls the list loader and reads `offers`, `meta.total`, `meta.offset`, `filters`, `profile_filters`, `current_filters`.

Build file names are unstable; they are evidence references for this check, not integration points.

| Operation | Path found in front-end code | What is known |
| --- | --- | --- |
| List | `GET {API_BASE}/offers` | The client builds `p`, `offset`, `limit`, optional `sa`, `pa`, `s`, `from_date`, `to_date`, repeatable `l`, `se`, `sp`, `pl`, and also `c`, `exclude_applied` |
| Card | `GET {API_BASE}/offers/{id}` | The client may pass `s`, `tg` |
| Similar vacancies | `GET {API_BASE}/offers/{id}/similar` | Found in the same public JS |

By the client code, `sp` is specialization, `l` is locations, `sa` is salary, `se` is seniority and `pa` is publication period. Free-text search through `q` is not confirmed. Do not borrow the guessed parameters `q` or `format=remote` from third-party parsers.

The client wrapper adds `X-Client-Platform: web` and uses `credentials: include`. This is front-end behaviour, not proof that authorization is required. In the initial research no API requests were made because of the `/api/` restriction in robots.txt. At the user's later direct request a limited anonymous-access check was made, described below. Real limits and filter values remain unverified.

### Additional check without authorization

On 7 October 2026 three separate HTTP GET requests were made with curl. No `Authorization`, `Cookie`, API key, `X-Client-Platform`, `Origin` or `Referer` was sent; `Accept: application/json` was used. No cookie jar was used: cookies from responses were not carried to later requests.

| Request | Result |
| --- | --- |
| `https://getmatch.ru/api/offers?p=1&offset=0&limit=1` | HTTP 200, JSON with `meta`, `offers`, `filters`, `current_filters`, `profile_filters`; `meta`: `total=921`, `offset=0`, `limit=1`; `profile_filters=null` |
| `https://getmatch.ru/api/offers/36553` | HTTP 200, JSON card of an active special announcement `offer_type=one_day_offer_v3` |
| `https://getmatch.ru/api/offers/35243` | HTTP 200, JSON of an ordinary active vacancy `offer_type=vacancy`: `Старший разработчик Java (Платформа стриминговой обработки)`, Ozon; description and canonical path available |

Technical conclusion: at the time of the check the list and both cards were available without authorization or cookies. The `X-Client-Platform` header was not needed for these requests either. Playwright is not needed to obtain the verified JSON; documentation and permission for third-party use of the API are still not confirmed.

Response quirk: with `limit=1` the `offers` array contained four items, three special announcements and one ordinary vacancy. `offers.length` therefore cannot be treated as the page size, and the array length cannot be used to compute the next offset without further pagination checks. The number 921 is the value of `meta.total`, not an independently confirmed count of ordinary active vacancies. Availability of all cards and filters was not checked.

The legal conclusion did not change: these responses confirm technical access but do not override robots.txt and clause 3.2 of the agreement. Regular collection was not started.

### Playwright attempt and HTML

An attempt was made to attach a browser through the available browser runtime for Playwright. The answer was `No browser is available`; after following the recovery instructions the browser list was still empty. `playwright`, `@playwright/test` and `puppeteer` are also not installed in the project. Browser execution, network request observation, pagination and parsing of rendered cards were therefore not verified in this session. There is no successful Playwright prototype.

The ordinary sandbox network first did not resolve DNS for getmatch.ru. Permitted read-only HTTP requests outside the sandbox made it possible to check the page, robots.txt and its public scripts. These results do not replace a browser check.

The public [archived card](https://getmatch.ru/vacancies/18595-senior-backend-engineer) is reachable through a web tool and contains title, company, salary, locations, work formats, specialization, seniority, experience and description. It states explicitly that the vacancy is archived. This confirms that individual cards are reachable, but not the current listing. Any future prototype must exclude archived vacancies; remote work with Russia specified is not equivalent to remote work from any country.

### Terms of use and legal assessment

The [current user agreement](https://getmatch.ru/docs/terms-of-service) was checked, published as the edition of 13 October 2022, not historical editions available by separate links.

- Clause 2.1 permits viewing open materials without registration. Clause 1.3 treats gaining access to the materials as accession to the agreement. The legal applicability of such accession in a specific case needs separate assessment.
- Clause 3.1 classifies texts, databases and other materials as objects of exclusive rights of getmatch, users and other right holders.
- Clause 3.2 restricts reproduction, repetition, copying, sale and commercial use of parts of the service, including content, without getmatch's permission or a basis in additional documents. The wording gives grounds to see a restriction on copying, not only on commercial use. No separate direct prohibition using the word "parsing" was found in the agreement as read; this does not cancel the copying restriction.

[robots.txt](https://getmatch.ru/robots.txt) was fetched: for `User-agent: *` it closes `/api/`, authorization paths, profiles, employers and a number of service paths. `/vacancies` is not closed, and `Sitemap: https://getmatch.ru/sitemap.xml` is listed. The sitemap was not read in this check. robots.txt is a technical instruction for robots, not a content licence: permission to crawl a public page does not override the agreement and database rights.

[Article 1335.1 of the Civil Code of the Russian Federation](https://www.consultant.ru/document/cons_doc_LAW_64629/6a3a364978a1d1c94fdbf7cbf6d14b5c4bb528a1/) provides exceptions for lawful use of a database, including personal purposes to a justified extent and an insignificant part for other purposes. It also restricts repeated extraction of small parts if that conflicts with normal use of the database and unreasonably harms the maker's interests. The exceptions give no automatic permission for regular collection or republication of full descriptions and do not remove the copyright question. A link to the original does not by itself make copying permitted.

Summary: open viewing is confirmed; the lawfulness of regular extraction and storage for a distributed plugin is not established, and there is a substantial conflict with the copying terms. It cannot be claimed that any personal viewing is unlawful or that any parsing is permitted. Under the task condition "add if everything is legal", the source was not ready for implementation at the time.

### What to clarify with getmatch

Official [support](https://getmatch.ru/docs/support): `hello@getmatch.ru`, Telegram `@gbot_team`. No messages were sent on the user's behalf.

Request a documented API or partner feed, or permission for automatic reading of public vacancies for career-ops. Clarify permitted fields, local storage, retention and refresh periods, use of descriptions for personal search, distribution of the adapter, attribution, limits, anonymous access and commercial-use terms. Permission for API calls and the right to store and use content must be checked separately. If a different official endpoint is provided, obtain its documentation and terms.

### Conditional plan after permission

This is a preliminary estimate of changes against the plugin code at the time, not an approved launch plan. The first mandatory step is to remove the uncertainty about the terms.

1. **Confirm the permitted access method.** Prefer a documented API/feed. If only browser collection is permitted, check rendering of one page and one current card via Playwright, plus filters, pagination and the archive marker. Do not pin internal endpoints and parameters as an official contract.
2. **Agree on data and normalization.** Use only permitted fields: title, company, canonical link, location/format, salary and a confirmed publication date. Descriptions only to the permitted extent. Keep regional remote restrictions; do not substitute a missing date with the current one and do not treat an archived card as active.
3. **Add the `lib/getmatch.mjs` adapter.** Define a checkable response contract, pagination, deduplication, access errors, limits and schema changes. For permitted HTML use the existing `lib/html.mjs` tools; do not introduce Playwright into the runtime without checking host capabilities. The current contract offers `ctx.fetchJson`/`ctx.fetchText`, and existing adapters do not use a browser context. A separate browser must not bypass the plugin engine's network restrictions.
4. **Update registration and configuration.** Add `getmatch` to `index.mjs` and `lib/config.mjs`, disabled by default. Keep old configurations and the deduplication order. At the time `primary_source_order` allowed exactly three initial sources or all five; after adding the sixth, keep supporting existing lists of five. Write the example configuration only with verified filters.
5. **Update HTTP guarding and queues.** Put only permitted host/path into `manifest.json` and `lib/http.mjs`, add a queue in `lib/queue.mjs`, respect agreed limits and bound the page count. The current 750 ms between requests is an internal plugin setting, not a getmatch limit. On `403`, CAPTCHA or a required login, stop collection and emit an explicit status.
6. **Extend URL normalization.** In `lib/normalize.mjs` add a check of canonical getmatch links and test URL identity by ID when the slug changes. Do not accept arbitrary external links and do not extract candidate profiles.
7. **Verify behaviour.** Fixtures of permitted output: active/archived vacancies, empty result versus loader and broken schema, regional remote, salary, pagination, repeated IDs; separately check the disabled source, backward compatibility of configurations, partial failure under `source: all` and host/path restrictions. Then `npm test`, an integration check with career-ops and one bounded live request to the permitted interface.
8. **Documentation and release.** Update README, `portals.yml` examples, `skill.md`, the manifest description and the health check, taking into account the source being disabled by default. Publish the basis of use, data limits and the check date. Release after a successful live check and confirmation of the terms; until then do not claim the source works.

No working code, dependencies, manifest or source settings were changed during the research.

## Sources

- Listing page: https://getmatch.ru/vacancies
- [Users manual](https://getmatch.ru/docs/users-manual)
- [Archived getmatch vacancy](https://getmatch.ru/vacancies/18595-senior-backend-engineer)
- [User agreement](https://getmatch.ru/docs/terms-of-service)
- [robots.txt](https://getmatch.ru/robots.txt)
- [Support](https://getmatch.ru/docs/support)
- [Article 1335.1 of the Civil Code of the Russian Federation](https://www.consultant.ru/document/cons_doc_LAW_64629/6a3a364978a1d1c94fdbf7cbf6d14b5c4bb528a1/)
- Public front-end JS chunks of getmatch.ru (names unstable, listed above)

## Conclusion

Do not connect regular collection to the plugin until getmatch gives permission or an official interface with suitable terms of use is found. A technical interface was found, but an open API for third-party vacancy search and permission to copy data are not confirmed.

The adapter was later implemented as an experimental, opt-in source; see [getmatch provider plan](../roadmap/getmatch-provider.md) and [getmatch provider page](../providers/getmatch.md).
