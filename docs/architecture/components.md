# Architecture: components and relations

Status: Implemented
Date: 2026-10-11
Type: architecture

State as of version 0.8.0. The data flow is described separately: [data-flow.md](data-flow.md). Decisions and their rationale: [../roadmap/provider-architecture-review.md](../roadmap/provider-architecture-review.md). Provider comparison: [../providers/README.md](../providers/README.md).

The plugin consists of two independent parts. The `ru-market` provider runs inside the core plugin host and reaches only allowed hosts through `ctx.fetch*`. The HH companion runs outside the host, because it launches a browser, and connects to core through `local-parser`. Shared code (`untrusted.mjs`) is installed into both parts from one file.

## Components and dependencies

```mermaid
flowchart LR
  subgraph User["User configuration"]
    PY["portals.yml<br/>entry provider: ru-market<br/>entry HH browser (local-parser + hh_browser)"]
    PLY["config/plugins.yml<br/>plugin enablement"]
  end

  subgraph Core["career-ops core (stock upstream, never modified by the plugin)"]
    SCAN["scan.mjs<br/>filters, dedup, pipeline"]
    ENG["plugins/_engine.mjs<br/>plugin host, ctx, allowedHosts"]
    LP["providers/local-parser.mjs<br/>runs an external script, passes extra fields through"]
    TV["providers/_trust-validator.mjs<br/>trustScore / trustFlags"]
    TYPES["providers/_types.js<br/>Job schema"]
  end

  subgraph Plugin["ru-market plugin (host sandbox)"]
    MAN["manifest.json<br/>hook provider, allowedHosts"]
    IDX["index.mjs<br/>provider, Promise.allSettled"]
    CFG["lib/config.mjs<br/>ru_market validation"]
    AD["lib/providers/<br/>habr-career, geekjob, superjob,<br/>trudvsem, getmatch, helloworld"]
    INF["lib/transport/ + lib/helpers/html.mjs<br/>http, queue, retry, html"]
    PIPE["lib/processors/page-pipeline.mjs + paginate.mjs<br/>page to jobs, pages and routes"]
    NORM["lib/processors/normalize.mjs + compensation.mjs<br/>makeJob"]
    UNT["lib/untrusted.mjs<br/>normalization, injection flags"]
    DD["lib/processors/dedup.mjs<br/>cross-board dedup"]
  end

  subgraph Comp["HH companion (outside the sandbox)"]
    SH["scripts/ru-market/scan-hh.mjs<br/>Playwright collector"]
    SUNT["scripts/ru-market/lib/untrusted.mjs<br/>copy of the same file"]
    ART["artifacts: merged.json,<br/>checkpoint.json, portals-hh.yml"]
  end

  subgraph Inst["Installation"]
    INSH["install.sh<br/>two files + sha256 state, no core changes"]
  end

  subgraph Ext["External sources"]
    API["JSON API<br/>superjob, trudvsem, getmatch"]
    HTML["HTML<br/>habr, geekjob, helloworld.rs"]
    HH["hh.ru (browser)"]
  end

  PY --> SCAN
  PLY --> ENG
  SCAN -->|"provider: ru-market"| ENG
  ENG -->|"hook loading"| MAN
  MAN --> IDX
  IDX --> CFG
  IDX --> AD
  AD --> INF
  AD --> PIPE
  PIPE --> NORM
  NORM --> UNT
  IDX --> DD
  INF -->|"ctx.fetch"| API
  INF -->|"ctx.fetch"| HTML

  SCAN -->|"parser.command: node"| LP
  LP -->|"execFile"| SH
  SH --> SUNT
  SH -->|"Playwright"| HH
  SH --> ART
  PY -.->|"hh_browser is read on every run"| SH

  SCAN --> TV
  LP --> TYPES
  TV --> TYPES

  INSH -->|"copies"| SH
  INSH -->|"copies"| SUNT
```

## Boundaries and rules

| Boundary | Rule |
|---|---|
| Plugin and network | HTTPS only, to hosts from `allowedHosts`; requests go through `ctx.fetch*` (SSRF protection, 10 s by default). The plugin does not import Playwright and does not spawn processes. |
| Companion and core | The companion runs as an external parser: `local-parser` calls `node scripts/ru-market/scan-hh.mjs ...` and reads JSON from stdout. The companion configuration lives in `portals.yml` (the `hh_browser` block) and is re-read on every run. |
| Core | Never modified. Since 0.8.0 there are no patches: `local-parser` passes the companion's extra fields (`compensation`, `injectionFlags`, `matchedQueries` and others) through unchanged (upstream PR #4697), and core reads only the fields it knows (`salary` among them). There is no status channel and no trust rule for `injectionFlags`. |
| Shared code | `lib/untrusted.mjs` has one source copy. `install.sh` puts it into `scripts/ru-market/lib/` and records its sha256 in `scan-hh.install.json`; the installer does not overwrite locally modified files. |
| Code layout | `lib/providers/` holds one module per source and knows only that source's markup or JSON. `lib/transport/` is the only network door (allowlist, queue, retry). `lib/processors/` holds the shared steps (page pipeline, pagination, normalisation, compensation, deduplication). `lib/helpers/html.mjs` is the HTML tree reader. `lib/config.mjs`, `lib/errors.mjs`, `lib/sources.mjs` (the source registry: ids, labels, config keys, hosts, spacing) and `lib/untrusted.mjs` stay at the root; `lib/untrusted.mjs` must not move because `install.sh`, the release workflow and the companion rely on that path. |
| Source separation | HH is not a source of this plugin; the browser companion collects it. The source order allows lengths 2, 4, 5 and 6. |

## Extension: a new provider

- Through an API or HTML without a browser: a new provider module in `lib/providers/` whose extractor adapter is run by `parsePage` from `lib/processors/page-pipeline.mjs`, a registry entry in `lib/sources.mjs`, registration in `index.mjs`, the host in `manifest.json` and its listing-path check in `lib/transport/http.mjs`; tests fail when these lists disagree. The result goes through `makeJob`, then `untrusted.mjs` is applied automatically.
- Through a browser: a script in `scripts/ru-market/`, importing `./lib/untrusted.mjs`, a separate `local-parser` entry in `portals.yml` with its own configuration block modelled on `hh_browser`.
