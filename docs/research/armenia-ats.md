# ATS and vacancy platforms for Armenia

Status: Reference
Date: 2026-10-02
Type: research

## Question

Which ATS and vacancy platforms give an open way to read vacancies located in Armenia, and under what terms? Initial check on 2 October 2026. Here ATS means an employer's system for receiving and tracking applications. Some Armenian platforms combine an ATS with a general vacancy board; they must be checked as separate sources.

## Findings

`career-ops` already has the providers `greenhouse`, `lever` and `workable` (`../career-ops/providers/`). For Armenia they need verified companies or boards, not new adapters. `career-ops` has no separate providers for `workx.am`, `staff.am` and `job.am` yet.

| Candidate | Evidence of vacancies in Armenia | Open way to read | Priority |
| --- | --- | --- | --- |
| [Greenhouse](https://docs.greenhouse.io/job-board.html) | [JetBrains publishes vacancies located in Yerevan](https://job-boards.greenhouse.io/jetbrains) | Official Job Board API, public `GET /v1/boards/{board_token}/jobs`, no key | High |
| [Lever](https://github.com/lever/postings-api) | [Provectus](https://jobs.lever.co/provectus?location=Yerevan) and [Ajax Systems](https://jobs.lever.co/ajax?location=Yerevan) show vacancies for Yerevan | Official Postings API for published vacancies | High |
| [workx.am](https://workx.am/api) | Armenian platform with vacancies and application tracking | Official public MCP `https://workx.am/mcp`, tools `search-jobs` and `get-job-details`; a limit of 60 requests per minute is stated | First implementation candidate |
| [Workable](https://help.workable.com/hc/en-us/articles/115012771647-Using-the-Workable-API-to-create-a-careers-page) | [CloudLinux lists Yerevan among its locations](https://apply.workable.com/cloudlinux-1/j/451EC658A2/apply/) | Official documentation describes public endpoints only for published vacancies; the main API needs an employer token | Medium |
| [staff.am](https://staff.am/en/jobs/software-development) | Public IT listing and [cards](https://staff.am/jobs/software-development/software-developer-mid-senior); the service [tracks applications](https://staff.am/en/how-we-work) | Public HTML and [sitemap](https://staff.am/assets/staff-am-sitemap.xml); terms restrict automated collection | Technical candidate with an explicit terms conflict |
| [job.am](https://job.am/en/jobs?i=17) | Public IT listing; [ATS is advertised in the pricing](https://job.am/en/static/pricing) | Public HTML and [vacancy sitemap](https://job.am/sitemap/jobs.xml); terms restrict reproduction | Technical candidate with a content restriction |

Do not confuse [ats.am](https://ats.am/images/ats-eng.pdf) with a hiring system: the site found offers telephony and customer support.

### Terms of use

Public terms checked on 2 October 2026:

| Source | What is permitted or restricted | Decision for career-ops |
| --- | --- | --- |
| workx.am | The [MCP documentation](https://workx.am/api) explicitly invites third-party AI agents to search vacancies through a public read-only endpoint without login; a limit of 60 requests per minute is stated. The [terms](https://workx.am/en/terms) prohibit unauthorized access and collecting user data without permission. No separate licence for republishing full vacancy texts is stated. | Can be prototyped through the documented `search-jobs` and `get-job-details`, for vacancies only. Respect the limit, give a canonical link, do not collect candidate profiles and do not assume a right to wide republication. Before release, check the output format and the volume of stored text. |
| staff.am | The [terms](https://staff.am/en/site/terms-of-use) explicitly restrict automated search and data collection by agents without written permission. [robots.txt](https://staff.am/robots.txt) permits crawling general pages and search with links and short excerpts, but does not override the site terms; URLs with arbitrary query parameters are mostly closed to robots, `?page=` is allowed. | Study the public sitemap and pages without login as a technical option for personal search. Limit stored data to metadata and a link; record that compliance with the platform terms is not confirmed. |
| job.am | The [terms](https://job.am/terms) prohibit unauthorized reproduction and further distribution of materials, as well as commercial use of part of the service. No direct permission for automatic collection of vacancies or an official public API/RSS was found. [robots.txt](https://job.am/robots.txt) allows general pages and lists the vacancy sitemap, but closes `/api/*` and a number of service URLs. | Study the public sitemap and cards as a source of metadata and canonical links. Do not access paths closed in robots.txt and do not carry over full descriptions; compliance with the platform terms is not confirmed. |

### Plan for adding the missing providers

1. **workx.am:** make one bounded call of the official MCP `search-jobs`, then `get-job-details` for one vacancy. Check vacancy activity, URL stability, city and profession filters, pagination, response fields and the absence of candidate data. If the result is suitable, add an optional adapter and only `workx.am` to `allowedHosts`; keep requests below the published limit. Check empty and error output, deduplication and compatibility with the current configuration.
2. **job.am:** check the vacancy sitemap and one public card without login: freshness, links, metadata, change frequency. If the data is usable, design an optional adapter for personal search with short fields and a link to the original, without full text. Keep the terms restriction in the documentation; technical availability does not mean permission to use.
3. **staff.am:** check the public sitemap and a card in the same way. Find out whether a useful listing can be obtained without closed query URLs. When designing the adapter, explicitly mark the conflict with the ban on automated collection in the platform terms and do not present it as a permitted provider.
4. Check the existing providers Greenhouse for JetBrains and Lever for Provectus on current Armenian vacancies; new adapters are not needed for them. In all sources, distinguish the ability to work from Armenia from the physical location of the vacancy.

None of the Armenian sources is connected in this plugin yet. The shared Greenhouse, Lever and Workable adapters are already implemented in `career-ops`. The items above are a plan, not a list of working providers.

## Sources

- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html), [JetBrains board](https://job-boards.greenhouse.io/jetbrains)
- [Lever Postings API](https://github.com/lever/postings-api), [Provectus](https://jobs.lever.co/provectus?location=Yerevan), [Ajax Systems](https://jobs.lever.co/ajax?location=Yerevan)
- [workx.am MCP documentation](https://workx.am/api), [workx.am terms](https://workx.am/en/terms)
- [Workable API help](https://help.workable.com/hc/en-us/articles/115012771647-Using-the-Workable-API-to-create-a-careers-page), [CloudLinux posting](https://apply.workable.com/cloudlinux-1/j/451EC658A2/apply/)
- staff.am: [listing](https://staff.am/en/jobs/software-development), [how we work](https://staff.am/en/how-we-work), [sitemap](https://staff.am/assets/staff-am-sitemap.xml), [terms](https://staff.am/en/site/terms-of-use), [robots.txt](https://staff.am/robots.txt)
- job.am: [listing](https://job.am/en/jobs?i=17), [pricing](https://job.am/en/static/pricing), [sitemap](https://job.am/sitemap/jobs.xml), [terms](https://job.am/terms), [robots.txt](https://job.am/robots.txt)
- [ats.am](https://ats.am/images/ats-eng.pdf) (unrelated telephony site)

## Conclusion

Greenhouse and Lever boards with Yerevan vacancies are readable through official public APIs already supported by core providers; workx.am is the first candidate for a new adapter through its documented MCP. staff.am and job.am are technical candidates only, with unresolved conflicts with their published terms. Nothing is implemented in this plugin.
