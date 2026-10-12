# Research: Poslovi Infostud

Status: Reference
Date: 2026-10-12
Type: research

## Question

Can [Poslovi Infostud](https://poslovi.infostud.com) (Serbian job board, owner Infostud rešenja d.o.o. Subotica) be read as a vacancy source for personal job search, how, and under what published terms? Only primary sources were used: the site, its RSS page and feed host, terms, `robots.txt`, sitemaps and live HTTP responses. Live requests were made on 2026-10-11 between 21:28 and 21:31 UTC (plain `curl`, one request at a time, a few dozen in total). Raw samples are kept outside the repository.

## Findings

Result: the official RSS feed works but is useless for IT search (20 newest ads of all categories, three fields, about two days deep). The public HTML listing is server-rendered, filterable (IT category, keyword, remote, age) and paginated, and carries much richer data. Terms: the page footer permits download "for the personal needs of site visitors"; the general terms require written permission for unauthorized use of content and contain no explicit scraping clause; no API or partner feed was found. Permission for automated personal collection is not confirmed either way.

### 1. RSS (observed, 2026-10-11)

| Item | Observation |
| --- | --- |
| Entry page | `https://poslovi.infostud.com/rss`: HTTP 200, `text/html; charset=utf-8`, a Next.js page "RSS i mobilne aplikacije". It links two feeds: "Pregled 20 najnovijih poslova" (jobs) and a news feed. |
| Jobs feed | `https://rss.infostud.com/poslovi/rss.php`: HTTP 200, `text/xml; charset="utf-8"`, body is UTF-8, 12.9 KB. The bare path `https://rss.infostud.com/poslovi/` answers 302 to `http://rss.infostud.com/poslovi/rss.php` (plain HTTP, then 301 back to HTTPS); `http://` URLs answer 301 to `https://`. |
| News feed | `https://rss.infostud.com/poslovi/94`: HTTP 200, same format, channel "Vesti o zapošljavanju" (employment news, not vacancies). |
| Format | RSS 2.0 (`<rss version="2.0">`, namespaces `is`, `atom`, `media` declared but unused in items). Not Atom. |
| Channel | `title` "Infostud Poslovi", `language` sr, `copyright` "Copyright by INFOSTUD 3 d.o.o. 2026", `webMaster` webmaster@infostud.com, `ttl` 15 (minutes), `lastBuildDate` equal to the request time (generated live). |
| Items | Exactly 20. Fields per item: `title`, `link`, `description`, `guid`, `pubDate` (RFC 822, `+0200`). No company element, no location element, no category, no CDATA in the jobs feed. |
| Field content | `title` is the job title only. `description` is plain text `<company> - <city>` (for example "Knez Petrol d.o.o. - Niš"). `link` equals `guid`: `http://poslovi.infostud.com/posao/<Company>-<City>/<Company>/<id>?utm_source=poslovi.infostud.com&utm_medium=rss&utm_campaign=pregled-poslova`. Note `http://` scheme and tracking parameters. No salary, no vacancy text. |
| Freshness and depth | The 20 items spanned 2026-10-09 15:02 to 2026-10-11 19:56 (+0200), about 2 days, newest first. They are all categories (electrician, petrol station attendant, grill cook, nurse, warehouse specialist); none was IT. At the same moment the site listed 3147 active ads, so the feed shows about 0.6% of them. |
| Per-category or per-query feeds | None found. The RSS page offers exactly the two links above. Guessed parameters on `rss.php` (`kategorija`, `category`, `cat`, `q`, `grad`, `id`) were all ignored: each returned the same 20 items. The RSS page text says the 20-item limit applies "within the selected categories" but no category selector exists on the page. No IT feed was found. |
| Headers | No `Cache-Control`, `ETag`, `Last-Modified`, `Expires`, `Retry-After` or rate-limit headers on the feed (`cf-cache-status: DYNAMIC`, served through Cloudflare). A plain non-browser `User-Agent` got HTTP 200. |

### 2. HTML search and listing (observed, 2026-10-11)

The site is a Next.js application. Pages are server-rendered: the full result list is embedded as JSON in `<script id="__NEXT_DATA__">` (`props.pageProps.initialSearchResults`), so no JavaScript execution was needed. Plain `curl` got HTTP 200 for all pages below. Responses carry `cache-control: max-age=0` and no rate-limit headers.

| Aspect | Observation |
| --- | --- |
| Listing URL | `https://poslovi.infostud.com/oglasi-za-posao` (3147 ads, 105 pages, 30 per page). |
| IT category | `https://poslovi.infostud.com/oglasi-za-posao?categories=5` (canonicalizes to `/oglasi-za-posao-it`): 102 ads, 4 pages. Category id 5 is "IT"; the facet list holds 58 categories (id, name, count). |
| Keyword | `?q=python`: 12 ads (canonical `/oglasi-za-posao-python`). The site's own `SearchAction` JSON-LD uses `/oglasi-za-posao-{search_term_string}`. The route `/oglasi-za-posao-it` returned the same 102 ads and reports the keyword `IT`. |
| Other filters | `workPlaceTypes=remote` (with `categories=5`: 11 ads; values `on-site`, `fieldwork`, `hybrid`, `remote`), `timeOfPosting=7` (IT: 37 ads from the last 7 days). The response also lists facets for `cities` (215), `employmentTypes`, `languages`, `workingHours`, `tags` (262) and params `salary`, `educations`, `forStudents`. Their URL syntax was not tested, except that `categories=5&cities=35&q=python` returned a page without parsable results (unverified why). City routes exist as `/oglasi-za-posao/<city-slug>` (listed in `sitemap-cities.xml`, 215 URLs). |
| Seniority | No seniority filter or field was found in the response (`facets` and card keys). Not verified beyond that. |
| Pagination | `?page=N`; anchors `?page=2..4` and `?page=105` are present; `?categories=5&page=2` returned the next 30 IT ads. Combined with filters it works. Results are sorted newest first by default (`sort: null`). |
| Card fields (listing JSON) | `id`, `title`, `companyName`, `companyId`, `location` (text such as "Beograd", "Beograd \| Hibrid", "Rad od kuće", "Beograd, Novi Sad"), `salary` (text), `expirationDate` and `onlineViewDate` (both `dd.mm.yyyy`), `primaryCategory`, `standardizedPosition`, `itTags` (technologies, for example `Python`, `AWS`, `Podrška`), flags `workFromHome`, `hybridWork`, `fieldwork`, `cvRequired`, `shift`, `benefits`, `jobType` (Premium etc.), `textAdSnippet`, `jobSummary.summary`, canonical `url`. |
| Sample statistics | IT page 1 (30 ads): 1 ad with a salary (`neto 3.000 - 3.300 EUR (mesečno)`), 29 with `textAdSnippet`, 29 with `jobSummary.summary`, 0 with Cyrillic in title, company or location. 13 of 30 had location "Beograd", 8 "Beograd \| Hibrid". |
| Vacancy URL and id | `https://poslovi.infostud.com/posao/<title-slug>/<company-slug>/<numeric id>`, for example `.../posao/ai-developer-machine-learning-engineer/e-intelligence/759999`. The numeric id is the same as `id` in the listing and as `identifier.value` in the detail JSON-LD. The RSS link uses the older form `/posao/<Company>-<City>/<Company>/<id>` with the same id. `sitemap-jobs.xml` lists the same canonical ad URLs (3147 URLs at the time, equal to the listing total). Whether old URLs stay valid after an ad expires was not tested. |
| Detail page | HTTP 200, 112 KB, server-rendered. It has a `JobPosting` JSON-LD (title, id, `datePosted` `2026-10-07`, `validThrough`, `employmentType`, hiring organization and address) whose `description` is only a generic sentence, and the full ad as HTML in `props.pageProps.job.textAd`, plus `jobSummary` (`summary`, `responsibilities`, `requirements`, `benefits`), `datePosted`, `expirationDate`, `salary`, `unformattedSalary` (`from`, `to`, `type` net or gross, `additional` `monthly`, `currency`), `cities`, `applicationLink`, `hwCompanyProfileLink` (a helloworld.rs company link). |
| Date caveat | For the same ad (759999) the listing `onlineViewDate` was `06.10.2026` and the detail `datePosted` was `2026-10-07`. The meaning of `onlineViewDate` is not documented; do not use it as `postedAt` without confirming. |

### 3. robots.txt and sitemap (observed, 2026-10-11)

[`https://poslovi.infostud.com/robots.txt`](https://poslovi.infostud.com/robots.txt) (HTTP 200, `Last-Modified` 2026-09-24, 4116 bytes):

- Group `User-agent: *` disallows, among other paths: `/search/*`, `/?*` (query on the site root only), `/rss_feed/*`, `/m/*`, `/admin/*`, `/crm/*`, `/docs`, `/beta/`, `/prijava`, `/registracija`, `/odjava`, `/moj-nalog/redirect_uri`, `/api/proxy/prijava-na-nalog`, `/prijave_storage/`, `/jobler/*`, `/job/jobview_iframe/`, `/public/social_remarketing_export/*`, and about 35 specific old ad URLs under `/posao/...`.
- `/oglasi-za-posao` (also with a query string), `/oglasi-za-posao-it`, `/posao/<slug>/<company>/<id>` and `/rss` are not disallowed. No `Crawl-delay` is declared.
- `User-agent: jooblebot` has `Disallow: /` (an aggregator is blocked by name). Other aggregators are not named.
- `Sitemap: https://poslovi.infostud.com/sitemap.xml`.

[`sitemap.xml`](https://poslovi.infostud.com/sitemap.xml) is an index of 22 sitemaps (updated 2026-10-11 06:00 +02:00), among them `sitemap-jobs.xml` (3147 ad URLs), `sitemap-cities.xml` (215), `sitemap-custom.xml` (2624 landing pages such as `/remote`, `/rad-od-kuce`, `/oglasi-za-posao-<keyword>`), category and profile sitemaps. The sitemap lists ad URLs for crawlers but gives no category or date per URL in the part inspected.

[`https://rss.infostud.com/robots.txt`](https://rss.infostud.com/robots.txt) returns HTTP 404, so no crawl rules are published for the feed host.

`robots.txt` is a crawling instruction, not a licence; the terms below decide.

### 4. Terms (documented)

Language is Serbian (Latin script); the translations are mine. Terms were read on 2026-10-11.

RSS page ([poslovi.infostud.com/rss](https://poslovi.infostud.com/rss)):

> Postavljanje Poslovi.infostud.com RSS-a sa oglasima za posao je moguće samo ukoliko niste oglasni sajt i ukoliko istovremeno na svom sajtu ne prikazujete oglase za posao sa drugih sajtova za oglašavanje. Broj oglasa koji možete preuzeti je ograničen na ukupno 20 poslednjih oglasa u okviru odabranih kategorija, osim u slučaju drugačijeg dogovora sa Poslovi.infostud.com.

Translation: placing the Poslovi.infostud.com RSS with job ads on your site is possible only if you are not an advertising site and do not show, on your site at the same time, job ads from other advertising sites. The number of ads you can download is limited to the 20 latest ads in the selected categories, unless otherwise agreed with Poslovi.infostud.com.

Page footer (same page and the site pages):

> Sadržaj sajta Poslovi.infostud.com je vlasništvo Infostuda. Zabranjeno je njegovo preuzimanje bez dozvole Infostuda, zarad komercijalne upotrebe ili u druge svrhe, osim za lične potrebe posetilaca sajta.

Translation: the content of the site is the property of Infostud. Downloading it without Infostud's permission, for commercial use or for other purposes, is prohibited, except for the personal needs of site visitors.

General terms ([nalog.infostud.com/privatnost-uslovi](https://nalog.infostud.com/privatnost-uslovi), also reachable as `poslovi.infostud.com/privatnost-uslovi`; "Uslovi korišćenja", dated "Subotica, 14. avgust 2026."), clauses by section:

| Section | Quote (Serbian) | Translation and reading |
| --- | --- | --- |
| Autorsko pravo | "Kompanija ima isključivo autorsko pravo i prava intelektualne svojine na Servisu ... kao što su: tekst, ... podaci i baze podataka, programski kod ..." | The company claims exclusive copyright and IP in text, data, databases and code of the service. |
| Autorsko pravo | "Neovlašćeno korišćenje bilo kog dela Servisa ... bez izričite prethodne dozvole u pisanoj formi ... smatraće se povredom autorskih prava Kompanije ..." | Unauthorized use of any part of the service without prior written permission is treated as copyright infringement. "Unauthorized" is not defined. |
| Autorsko pravo | "Dalje prenošenje sadržaja drugih lica ili dela sadržaja sa bilo kog dela Servisa je dozvoljeno samo uz obaveznu izričitu prethodnu saglasnost Kompanije, uz napomenu da je sadržaj preuzet sa Servisa, uz naznačenje odgovarajućeg linka ..." | Passing on content (of others or parts of it) is allowed only with the company's explicit prior consent, stating the source and the link. This restricts redistribution, not private reading. |
| Korisnici | "Posetilac ... može da se upozna sa celokupnim sadržajem dostupnim na Servisu, bez plaćanja bilo kakve naknade." | A visitor (no login) may read all content available on the service free of charge. |
| Smernice (guidelines for registered users' content) | "bilo koje automatsko korišćenje sistema, kao što je, ali ne ograničavajući se na korišćenje skripti za slanje slika ili video zapisa"; "mešanje sa, prekidanje ili kreiranje nepotrebnog opterećenja Servisa ..."; "pokušaj da se ispita, skenira ili testira ranjivost ..." | Any automatic use of the system (example: scripts that upload images or video) is listed as prohibited activity, as are interference, unnecessary load and probing. These items sit in the list of forbidden activities under the guidelines for registered users; the text is not explicit that it covers a visitor reading public ads, and it does not use the words "scraping", "crawler" or "robot". |

What is and is not confirmed for personal, non-republishing use:

- Confirmed: reading public pages without login is permitted for visitors; the footer exempts download "for personal needs of site visitors" from the ban on downloading; the RSS feed is offered as an official way to follow new ads; republishing content requires prior consent with source and link; combining the jobs RSS with other boards' ads on a public site is restricted.
- Not confirmed: that an automated client (a plugin run by the user) counts as a "visitor" for personal needs; that periodic automated fetching of the HTML listing is allowed (the terms neither allow nor name it); permissible request rate (no published limit); that local storage of ad text and passing it to an LLM agent is within "personal needs". The RSS restriction concerns placing it on a site and is not obviously violated by private local reading, but the RSS page does not say so.
- The roadmap statement that the general terms "restrict automated use" is only partly supported: the only wording about automatic use is the example in the guidelines list above.
- No written permission or contact with the owner was obtained during this research. Contact addresses published by the owner: poslovi@infostud.com (Organization JSON-LD) and webmaster@infostud.com (RSS `webMaster`).

Partner clause (same terms, "Širenje dosega oglasa Poslodavca kroz partnerske sajtove"): an ad posted in the IT category "can be published also on the site Helloworld.rs", and ads for young people also on startuj.infostud.com. This matters for deduplication with the HelloWorld.rs provider.

### 5. API or partner feed

None found. The RSS page, footer, `robots.txt` and sitemaps mention no developer documentation, public API, feed with categories or partner programme; the RSS text says only that other volumes are possible "by agreement". The site calls internal GraphQL-style objects (`__typename` fields) and an `/api/proxy/...` path (login-related, disallowed in `robots.txt`); these are undocumented internals, were not probed, and must not be treated as an open API. The terms mention an Android application. This is a limited search of the owner's pages, not proof that no partner arrangement exists.

### 6. Fit with this plugin

How a provider is shaped here (read in `lib/providers/helloworld.mjs`, `lib/config.mjs`, `lib/transport/http.mjs`, `lib/transport/queue.mjs`, [helloworld-rs provider page](../providers/helloworld-rs.md), [HelloWorld research](helloworld.md) and [plan](../roadmap/helloworld-provider.md)): an adapter `{source, extract, values, finish}` passed to `parsePage`, paged by `paginate`; the source id is registered in `SOURCES` and `CONFIG_KEYS` (`lib/config.mjs`); the host and its allowed path pattern are declared in `ALLOWED_PATHS` (`lib/transport/http.mjs`), a per-host queue in `lib/transport/queue.mjs` (the code comment says the two lists are separate copies) and `manifest.json`; output is built by `makeJob` with `dataLevel: listing`, and all source text passes `lib/untrusted.mjs`, which sets `injectionFlags`. This repository has no `allowedHosts` identifier; the hosts live in the three places above.

Integration sketch (proposal only, nothing implemented):

| Aspect | Sketch |
| --- | --- |
| Transport | HTML listing, not RSS. RSS gives 20 mixed-category ads for about two days with title, company and city only; filtering it for IT would almost always return nothing. Use `https://poslovi.infostud.com/oglasi-za-posao?categories=5&q=<query>&page=N`, or the category route; parse `__NEXT_DATA__` JSON rather than DOM classes. |
| Id, config | Source id `infostud`, config key `infostud`; opt-in, disabled by default, options `enabled`, `mode`, `max_pages`, `queries` as for HelloWorld. `ORDER_LENGTHS` in `lib/config.mjs` and the order documentation would need a seventh source. |
| Hosts | Add `poslovi.infostud.com` to `manifest.json`, `ALLOWED_PATHS` (pattern like `^/oglasi-za-posao(?:-[^/]+)?/?$`, query `categories`, `q`, `page` only) and a queue with concurrency 1 and the slow spacing (1000 ms) as for HelloWorld. Detail pages `/posao/...` are allowed by `robots.txt` but add one request per ad; the first version should stay at listing level like HelloWorld. |
| Fields | `sourceId` = numeric `id`; `url` = listing `url` (already canonical, no tracking); `title`, `companyName`, `location` split into place plus work arrangement (`Hibrid`, `Rad od kuće`; the booleans `hybridWork`, `workFromHome` are a cleaner signal); `itTags` to `skills`; `salary` text to `compensation` with a parser for `neto|bruto <min> - <max> <CUR> (mesečno)` (the period is stated, unlike HelloWorld); `jobSummary.summary` or `textAdSnippet` as a short description. Seniority: none exposed, leave unknown. `postedAt`: do not use `onlineViewDate` (see date caveat); `expirationDate` is an end date. |
| Dedup | IT ads can be cross-posted to helloworld.rs (partner clause). No shared id was observed; the card has `helloworldCompanyProfileLink` for company only. Dedup by normalized title plus company across the two providers, and keep both links when matched, as the roadmap proposes. |
| Language, encoding | UTF-8 throughout; Serbian Latin with diacritics (`š č ć ž đ`); no Cyrillic in the 30 IT cards checked, but Cyrillic ads are possible and not tested. Slugs in canonical URLs are ASCII-folded; RSS and landing-page slugs may carry diacritics. Keyword search of the site is its own: whether `q=Python` matches diacritics-folded terms was not tested. |
| Location | Plugin needs Serbia as default geography; the site is Serbia-wide and also has foreign-job pages (`/oglasi-za-posao/nemačka` and others). `Rad od kuće` is not proof of eligibility from Serbia; keep `eligibility: unknown` as for HelloWorld. |
| Untrusted text | `textAd` is employer HTML and `jobSummary` is of unknown origin; both must go through `lib/untrusted.mjs`. |

Risks:

- Terms: no explicit permission for automated reading; the only clear personal-use carve-out is in the footer ("personal needs of site visitors"). Treat as opt-in, low-rate, local, with link back to the original and no republication.
- Fragility: `__NEXT_DATA__` shape and `buildId` are internal and can change without notice; there is no versioned contract. Strict validation (unknown shape fails loudly) is needed, as in the HelloWorld adapter.
- Query semantics: filter parameter names (`categories`, `workPlaceTypes`, `timeOfPosting`) were observed in responses, not documented; city and salary filters were not verified.
- Volume: IT is about 102 ads (3% of the board), so `max_pages` of 4 covers the category; the feed alternative is not viable.
- Overlap: heavy IT overlap with HelloWorld.rs likely; the added value of this source for an IT search is mostly non-IT-titled roles and ads not mirrored to HelloWorld, which was not measured.
- The cookie and consent behavior is irrelevant for plain requests (no cookie was needed), but `set-cookie` headers (`visitor_id`) are issued; the client must not store them.

### Not verified

- Written permission or any agreement with the owner; any API or partner feed beyond the pages inspected.
- Whether the "Smernice" automatic-use item applies to visitors; legal assessment of copyright and database rights under Serbian law.
- Request-rate tolerance (Cloudflare fronts both hosts; no limits published, no blocking seen at a few dozen sequential requests with a non-browser User-Agent).
- Meaning of `onlineViewDate`; stability and lifetime of ad URLs after expiry; behavior for Cyrillic queries and ads; city filter syntax; behavior of expired ads in the listing.
- Whether the RSS jobs feed ever offers category-specific variants for partners ("selected categories" in the RSS text).

## Sources

- [RSS page](https://poslovi.infostud.com/rss); [jobs feed](https://rss.infostud.com/poslovi/rss.php); [news feed](https://rss.infostud.com/poslovi/94)
- [Listing](https://poslovi.infostud.com/oglasi-za-posao), [IT listing](https://poslovi.infostud.com/oglasi-za-posao?categories=5), [example ad](https://poslovi.infostud.com/posao/ai-developer-machine-learning-engineer/e-intelligence/759999)
- [robots.txt](https://poslovi.infostud.com/robots.txt), [feed host robots.txt (404)](https://rss.infostud.com/robots.txt), [sitemap index](https://poslovi.infostud.com/sitemap.xml), [ad sitemap](https://poslovi.infostud.com/sitemap-jobs.xml)
- [Terms of use and privacy notice](https://nalog.infostud.com/privatnost-uslovi)
- Repository: [serbia-providers roadmap](../roadmap/serbia-providers.md), [HelloWorld research](helloworld.md), [HelloWorld plan](../roadmap/helloworld-provider.md), [helloworld-rs provider](../providers/helloworld-rs.md)

## Conclusion

Poslovi Infostud is technically readable: the official RSS exists but cannot serve an IT search (20 ads, all categories, no per-category feed, three fields); the HTML listing is server-rendered with an IT category (102 ads), keyword, remote and age filters, 30-per-page pagination, permanent numeric ad ids and salary and technology tags, and `robots.txt` does not disallow these paths. Permission is only partly established: the footer allows download for visitors' personal needs and the terms require written consent for unauthorized use and for passing content on, but no clause explicitly allows or forbids automated personal reading, and no API or partner feed exists in the public pages. A plugin source would be an opt-in, listing-only HTML adapter with strict validation and cross-provider deduplication against HelloWorld.rs; before building it, ask the owner (poslovi@infostud.com) to confirm that low-rate personal automated reading is acceptable. The first-candidate status in the [roadmap](../roadmap/serbia-providers.md) (RSS) should be revised because the feed is not a usable source.
