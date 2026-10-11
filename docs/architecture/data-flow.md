# Architecture: data flow

Status: Implemented
Date: 2026-10-11
Type: architecture

State as of version 0.8.0. Component relations: [components.md](components.md).

Vacancies reach core in two ways. Both end in the shared `scan.mjs` pipeline, where filters, the trust check and deduplication are applied. All external text passes through `untrusted.mjs` before it leaves the provider.

## Path 1: the ru-market provider (API and HTML)

```mermaid
flowchart TD
  A["scan.mjs<br/>entry provider: ru-market"] --> B["_engine: ctx.fetch*, settings, allowedHosts"]
  B --> C["index.mjs: parseConfig(entry.ru_market)"]
  C --> D{"in parallel<br/>Promise.allSettled"}
  D --> E1["habr-career"]
  D --> E2["geekjob"]
  D --> E3["superjob / trudvsem"]
  D --> E4["getmatch / helloworld-rs<br/>(opt-in)"]
  E1 & E2 & E3 & E4 --> F["paginate: pages, retry, partial results kept"]
  F --> G["response parsing<br/>JSON or HTML"]
  G --> H["makeJob"]
  H --> U["untrusted(): strip invisible Unicode,<br/>control characters, HTML comments,<br/>length limits, pattern detection"]
  U --> H2["Job: fields + compensation + injectionFlags"]
  H2 --> L["local dedup source:id"]
  L --> M["lib/dedup: cross-board dedup<br/>(union of injectionFlags)"]
  M --> N["array of Job"]
  D -.->|"all sources failed"| X["SourceError sources-failed"]
  N --> S["scan.mjs"]
  X --> S
```

## Path 2: HH through the companion and local-parser

```mermaid
flowchart TD
  A["scan.mjs<br/>entry HH browser (local-parser)"] --> B["local-parser: execFile<br/>node scripts/ru-market/scan-hh.mjs --config portals.yml --entry 'HH browser' --no-artifacts"]
  B --> C["loadBatchConfig: hh_browser block<br/>queries, pages, area, search_field,<br/>excluded_text, professional_role,<br/>only_with_salary, timeout_ms"]
  C --> D["Playwright, anonymous context<br/>hh.ru/search/vacancy, 1 s between pages"]
  D --> E{"page result"}
  E -->|"challenge or block"| F["stderr message,<br/>partial jobs are kept"]
  E -->|"ok"| G["card parsing"]
  G --> U["untrusted() from scripts/ru-market/lib/untrusted.mjs"]
  F --> H
  U --> H["JSON envelope: contractVersion 3, jobs<br/>exit 0 on failure, non-zero only for --scan and invalid-config"]
  H --> I["stdout"]
  I --> J["local-parser: parse JSON, extra fields pass through<br/>(salary midpoint, compensation, injectionFlags, provenance)"]
  J --> S["scan.mjs"]

  D -.-> ART["artifacts (without --no-artifacts):<br/>query-XX.json, merged.json, queries-summary.json,<br/>checkpoint.json, portals-hh.yml"]
  ART -.->|"--import-cache: re-parse without network"| B
```

## Shared scan.mjs pipeline

```mermaid
flowchart TD
  IN["Job from any provider"] --> T["buildTrustValidator<br/>trustScore, trustFlags, trustLevel<br/>(url and company only; injectionFlags is not read)"]
  T --> F1["blacklist"]
  F1 --> F2["title_filter"]
  F2 --> F3["location_filter, age, date"]
  F3 --> F4["salary_filter: reads salary min/max/currency only<br/>(no period, tax basis or compensation)"]
  F4 --> F5["content_filter: by description"]
  F5 --> F6["country, visa and other filters"]
  F6 --> D1["dedup: URL, then company::role<br/>against history, pipeline and this run"]
  D1 --> OUT["data/pipeline.md<br/>url, company, title, location, comp"]
  OUT --> LLM["pipeline and scan modes: the LLM reads the records"]
  LLM --> RAW["modes open the vacancy URL<br/>Playwright or WebFetch: raw JD text"]
```

## Boundaries: what is protected where

| Stage | Protection | Residual risk |
|---|---|---|
| Provider output (`makeJob`, companion) | `untrusted()` on `title`, `company`, `location`, `note`, `description`. Flagged vacancies stay with `injectionFlags` as information. | Patterns catch only obvious attacks. |
| Core trust check | Reads only `url` and `company`; `injectionFlags` has no effect on the trust score (the 0.7.0 rule needed a core patch and was dropped). | The flag is informational; it is not surfaced by core. |
| `pipeline.md` | Format cleaning only (`sanitizeMarkdownField`). | Fields cleaned by the plugin still reach the LLM context. |
| Raw JD in core modes | Only an "untrusted" marker in the prompts. | The plugin does not close this path. It is closed by a separate upstream proposal (appendix in the roadmap). |

## Duplicates between paths

Path 1 and path 2 are different `portals.yml` entries, and core processes them in parallel (`CONCURRENCY = 10`). A duplicate is detected by URL, then by `company::role` with `company_aliases` taken into account, and the winner is the entry that finished first. To make HH data win for certain, run HH as a separate scan earlier (`--company "HH browser"`).
