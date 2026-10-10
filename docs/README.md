# Documentation index

This directory holds the project documentation. It has exactly four categories plus this index; no other files or directories are allowed under `docs/` (checked by `test/docs.mjs`, run as part of `npm test`).

| Category | Purpose | Type |
| --- | --- | --- |
| [providers/](providers/README.md) | Provider matrix and one page per provider: status, access, configuration, filters, fields, limits | `guide` |
| [architecture/](architecture/components.md) | Components, boundaries and data flow of the plugin | `architecture` |
| [research/](research/getmatch.md) | Studies of external sources: what was checked, when, with what result | `research` |
| [roadmap/](roadmap/provider-architecture-review.md) | Plans and decisions, including implemented ones | `roadmap` |

Documents in the repository root: [README.md](../README.md) (install and usage), [RELEASE_NOTES.md](../RELEASE_NOTES.md), [RELEASING.md](../RELEASING.md), [skill.md](../skill.md) (agent instructions), [companion/README.md](../companion/README.md) (HH browser companion).

## Index

Providers: [matrix](providers/README.md), [hh](providers/hh.md), [habr-career](providers/habr-career.md), [geekjob](providers/geekjob.md), [superjob](providers/superjob.md), [trudvsem](providers/trudvsem.md), [getmatch](providers/getmatch.md), [helloworld-rs](providers/helloworld-rs.md).

Architecture: [components](architecture/components.md), [data flow](architecture/data-flow.md).

Research: [getmatch](research/getmatch.md), [HelloWorld.rs](research/helloworld.md), [Armenia ATS](research/armenia-ats.md), [Yandex Jobs](research/yandex-jobs.md).

Roadmap: [provider architecture review (0.7.0)](roadmap/provider-architecture-review.md), [core job filters](roadmap/core-job-filters.md), [getmatch provider](roadmap/getmatch-provider.md), [HelloWorld.rs provider](roadmap/helloworld-provider.md), [Serbian providers](roadmap/serbia-providers.md).

## Rules

These rules live only here.

### Mandatory header

Every file under `docs/` except `docs/README.md` and `docs/providers/README.md` starts with the H1 title followed by a header block:

```markdown
# Title

Status: Planned | In progress | Implemented | Obsolete | Reference
Date: YYYY-MM-DD
Type: guide | research | roadmap | architecture
```

- `Status`: `Planned` (not started), `In progress`, `Implemented` (shipped; a roadmap file stays in place and links to the provider page), `Obsolete` (superseded; say by what), `Reference` (research and other fixed-in-time documents).
- `Date`: the last meaningful change of the content (not the date of a typo fix).
- `Type`: matches the category: `guide` for providers, `architecture`, `research`, `roadmap`.

### Formatting

- Language: English everywhere (docs, README, release notes, release procedure, skill, companion README, comments and prose in examples). Translate prose only.
- Do not translate: Russian search queries, city names and other values used as examples or configuration, quotes of source-site text (for example field labels), and any string in code or tests that the scanner or the agent matches on. Keep such Russian strings in inline code spans, fenced code blocks or blockquote lines; the checker accepts Cyrillic only there.
- Links are relative and must render on GitHub. A link to a file must resolve inside the repository; paths of the read-only core checkout (`career-ops/...`) are written as inline code, not as links.
- Mermaid diagrams stay as fenced `mermaid` blocks; keep node ids stable when editing labels.
- File names are lowercase with hyphens; provider pages are named after the provider id (`helloworld-rs.md`).
- Filling a skeleton: if a section has no content, write `None.` instead of inventing text. Facts that were not verified are marked as unverified.

### Skeletons

Provider page (`providers/<id>.md`):

```markdown
# Provider name

Status / Date / Type: guide

## Status
## Transport and access
## Configuration
(example in a fenced block)
## Filters
Supported / Not supported
## Output fields
## Limits
## Known issues
## Verification
Tests, health check
```

Research (`research/<topic>.md`, Type: research):

```markdown
# Title

Status / Date / Type: research

## Question
## Findings
## Sources
## Conclusion
```

Roadmap (`roadmap/<topic>.md`, Type: roadmap; model: [core-job-filters.md](roadmap/core-job-filters.md)):

```markdown
# Title

Status / Date / Type: roadmap

## Problem
## Decisions
## Scope
(checkbox list)
## Acceptance criteria
(numbered list)
## Open decisions
```

Architecture (`architecture/<topic>.md`, Type: architecture): one or more diagrams followed by a boundaries table.

### Checker

`node test/docs.mjs` scans all `*.md` files outside `node_modules`, `.git` and `reports`. It fails on broken relative links and images, on Cyrillic outside code spans, fenced blocks and blockquote lines (in `docs/`, root `*.md`, `companion/README.md`, `examples/*.md`), and on files under `docs/` outside the four categories. It only warns about a missing `Status:` or `Date:` header.
