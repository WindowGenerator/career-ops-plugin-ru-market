# Research: Constants duplication

Status: Reference
Date: 2026-10-12
Type: research

## Question

How are source ids (`habr-career`, `geekjob`, `superjob`, `trudvsem`, `getmatch`, `helloworld-rs`), display names, hosts, URLs, config keys and other shared constants defined in the repository, where are they duplicated, do the copies drift, and what single-source-of-truth design fits the repo? Method: `grep` over `index.mjs`, `lib/`, `scripts/`, `test/`, `examples/`, `manifest.json`, `docs/` on the working tree at branch `chore/biome` (read-only, nothing edited). External claims cite primary documentation only. The repo has no `CLAUDE.md` or `AGENTS.md`; conventions come from the code and `docs/roadmap/parser-refactoring.md`.

## Findings

Result: there is no constants module. The source registry exists in six parallel structures keyed by source id, spread over five files, and the allowed host list exists in three more places. Every list is hand-maintained and the code itself admits it (`lib/transport/queue.mjs:63-64`). One confirmed drift exists (display names), and several hard-coded ids and lengths will break silently when a seventh source is added.

### 1. Where the source registry lives today

| # | Structure | Location | Keyed by | Holds |
| --- | --- | --- | --- | --- |
| 1 | `DEFAULT_SOURCES`, `SOURCES` | `lib/config.mjs:8-15` | list index = priority | ids and canonical order |
| 2 | `CONFIG_KEYS` | `lib/config.mjs:18-25` | id | YAML key (`habr_career`, `helloworld_rs`) |
| 3 | `API_SOURCES` | `lib/config.mjs:26` and `lib/processors/normalize.mjs:283` | list | which ids are `api` transport (two copies) |
| 4 | `adapters` | `index.mjs:16-25` | id | fetch function (imports at `index.mjs:6-11`) |
| 5 | `SOURCE_HOSTS`, `VACANCY_PATHS` | `lib/processors/normalize.mjs:155-171` | id | vacancy host and path regex |
| 6 | `label()` names | `lib/processors/dedup.mjs:29-35` | id | display name for notes |
| 7 | `ALLOWED_PATHS` | `lib/transport/http.mjs:23-30` | hostname | listing path check |
| 8 | `queues` map | `lib/transport/queue.mjs:65-80` | hostname | per-host spacing |
| 9 | `manifest.json` `allowedHosts` | `manifest.json:11-18` | hostname | egress allowlist read by the career-ops engine |
| 10 | `STOP_ON_ACCESS_ERROR` | `lib/processors/paginate.mjs:12` | id list | stop-all-routes sources |
| 11 | Per-provider `LISTING_URL`/`API_URL`/`ORIGIN` | `habr-career.mjs:19`, `geekjob.mjs:20`, `superjob.mjs:12`, `trudvsem.mjs:12`, `getmatch.mjs:12`, `helloworld.mjs:22-23` | file | the same hosts again as full URLs |

Source id as a bare literal in production code (not counting the structures above): each provider repeats its own id twice, once in its adapter object and once in the `paginate(...)` call.

| Provider | `source:` in adapter | `paginate('<id>', ...)` |
| --- | --- | --- |
| habr-career | `lib/providers/habr-career.mjs:97` | `:123` |
| geekjob | `lib/providers/geekjob.mjs:86` | `:113` |
| superjob | `lib/providers/superjob.mjs:83` | `:108` |
| trudvsem | `lib/providers/trudvsem.mjs:96` | `:123` |
| getmatch | `lib/providers/getmatch.mjs:183` | `:232`, plus `jobUrl(..., 'getmatch')` at `:53` and `:157` |
| helloworld-rs | `lib/providers/helloworld.mjs:259` | `:287` |

Other id literals used for branching: `'getmatch'` at `lib/processors/normalize.mjs:315`, `lib/processors/dedup.mjs:56,133,134`, `lib/config.mjs:170`; `'helloworld-rs'`, `'getmatch'`, `'habr-career'` in the `if (id === ...)` chain at `lib/config.mjs:231-235`; `id === 'superjob'` at `lib/config.mjs:202` (page-size default 20 versus `MAX_PER_PAGE` 100); `'habr-career'` in the default argument at `lib/processors/dedup.mjs:231`; the whole id set in `scripts/health.mjs:15,17,63` (`'all' | 'getmatch' | 'helloworld-rs'`) and in its help string at `scripts/health.mjs:56`.

The same ids are repeated in tests: about 150 literal occurrences across `test/run.mjs`, `test/legacy.mjs`, `test/processors.mjs`, `test/untrusted.mjs`, `test/getmatch.mjs`, `test/helloworld.mjs`, `test/page-pipeline.mjs`, `test/smoke.mjs`, and `test/integration.sh:43` (a hostname-to-id table). `test/run.mjs:598-601` spells the full expected order again instead of deriving it from `SOURCES`.

### 2. Drift observed

| Item | Copies | Drift |
| --- | --- | --- |
| Display name | `lib/processors/dedup.mjs:29-35` (`Habr Career`, `GeekJob`, `SuperJob`, `Работа России`, `getmatch`); `manifest.json:6` (`Habr Career, GeekJob, SuperJob, Работа России ... getmatch and Serbian HelloWorld.rs`); `docs/providers/README.md:14` (`Habr Career`) | Real drift: `manifest.json` has no getmatch capitalisation rule to compare against; the only confirmed gap is that HelloWorld has no entry at all and falls back to the raw id `helloworld-rs`. The code marks this deliberate and test-pinned (`lib/processors/dedup.mjs:23-26`, LEGACY comment). Manifest writes `HelloWorld.rs`; no code string does. |
| Hostname forms | `www.superjob.ru` vacancy host (`lib/processors/normalize.mjs:158`) versus `api.superjob.ru` API host (`http.mjs:26`, `manifest.json:14`, `queue.mjs:69`); `www.helloworld.rs` in all four places | Not drift but two different hosts per source; a single flat "host" field cannot model superjob (and trudvsem: `trudvsem.ru` vacancy vs `opendata.trudvsem.ru` API, `normalize.mjs:159`, `http.mjs:29`). |
| Host allowlist | `http.mjs:23-30`, `queue.mjs:65-80`, `manifest.json:11-18` | In sync today. `queue.mjs:63-64` states "this host list is a second copy of the allowlist in http.mjs ... Nothing keeps them in sync". `queue.mjs:88` throws for an unknown host, so a missed entry fails at runtime. |
| API transport list | `lib/config.mjs:26`, `lib/processors/normalize.mjs:283` | In sync today, byte-identical duplicates. |
| Order lengths | `lib/config.mjs:32` (`[DEFAULT_SOURCES.length, 4, 5, SOURCES.length]`), error text `lib/config.mjs:119` ("two core sources, the four, five or all six"), `docs/providers/README.md:21` and `docs/providers/getmatch.md:34` (same prose), `docs/roadmap/parser-refactoring.md:11` ("six sources") | Literal `4`, `5`, `6` in code and prose. Adding a source requires editing all of them; stale prose would pass every test. |
| Version | `package.json:3`, `manifest.json:4`, `lib/transport/http.mjs:13` (inside `USER_AGENT`) | In sync (all `0.8.0`); `http.mjs:10` comment says the release procedure edits the string by hand. Out of the scope of source ids but the same class of duplication. |
| Project URL | `lib/transport/http.mjs:11-12`, `manifest.json:22` | In sync. |
| Page limits | `lib/config.mjs:33-36` (`MAX_PAGES` 20, `MAX_PER_PAGE` 100, `MAX_LIST_ITEMS` 20, `MAX_ITEM_LENGTH` 500); `lib/untrusted.mjs:4` `LIMITS`; `lib/providers/helloworld.mjs:24` `PAGE_SIZE` 30; `getmatch` default `per_page ?? 20` at `lib/config.mjs:172` (`applyGetmatchOptions`) and `superjob` default 20 at `lib/config.mjs:202`; docs say "1-20", "1-100" in `docs/providers/getmatch.md:34` | Same numbers appear as magic literals in prose; each has a single owner in code, so these are not duplicated in code. |
| `MS_PER_DAY` | `lib/processors/normalize.mjs:28`, `lib/processors/dedup.mjs:9` | Identical value, duplicated. |
| `sleep` | `lib/transport/queue.mjs:7`, `lib/transport/retry.mjs` | Duplicated; flagged by a LEGACY comment (`queue.mjs:6`). |
| Source note format | `lib/processors/normalize.mjs:354` writes `source: ${source}`; `lib/processors/dedup.mjs:19-20` parses it with `/^source: ([a-z-]+)/` | A format contract split over two files with the regexp hard-coding the id alphabet. Works while ids are lower-case letters and hyphens. |
| Negative-case ids | `hh` in `test/run.mjs:665-677`, `test/integration.sh:77` | Intentional (tests that `hh` is rejected); must be kept as literals, not derived. |
| YAML keys | `lib/config.mjs:18-25` only in code; `examples/portals.yml`, `test/*.mjs`, `docs/` use `habr_career`, `helloworld_rs` | The key differs from the id for two sources (hyphen to underscore). Derivable by `id.replaceAll('-', '_')`, but the explicit map is safer as a persisted contract. |
| Docs counts | `docs/providers/README.md:26` lists spacing per host in prose; `docs/providers/README.md:37` onward lists options per source | Prose copy of `queue.mjs` and `config.mjs`; `test/docs.mjs` checks links and categories (`test/docs.mjs:7-9`), not these values. |

### 3. What does not need to move

- Provider-specific regexes and word lists (`habr-career.mjs:20-22`, `geekjob.mjs:21-22`, `helloworld.mjs:25-31`, `getmatch.mjs:13-15`, `superjob.mjs:13-21`, `trudvsem.mjs:13`) have one owner and one use. Keep them local; hoisting them would add indirection with no deduplication.
- Cross-cutting regexes with one owner (`lib/helpers/html.mjs:21-28`, `lib/errors.mjs:21-27`, `lib/untrusted.mjs:6-12`, `lib/processors/normalize.mjs:94-97,226-229,417-418`, `lib/processors/compensation.mjs:116-124`) are not duplicated.
- Transport tuning (`queue.mjs:9-10`, `retry.mjs:4-7`, `http.mjs:15`) has one owner each.
- `PERIODS`/`TAX_BASES` (`lib/processors/compensation.mjs:7-8`) and the `'api'`/`'html'`/`'auto'` mode strings (`lib/config.mjs:219-221`, `normalize.mjs:364`) are small enums with two or three uses; naming them is optional.

### 4. Platform and repo conventions

- Importers cannot reassign an imported binding but can mutate properties of an exported object: "The imported values are read-only views of the features that were exported ... you cannot re-assign the variable that was imported, but you can still modify properties of object values" ([MDN, JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)). Hence an exported registry object needs `Object.freeze`.
- `Object.freeze` is shallow: it "only applies to the immediate properties of `object` itself", and nested objects stay mutable unless also frozen; writes to a frozen object "fail, either silently or by throwing a `TypeError` exception (most commonly ... in strict mode)" ([MDN, Object.freeze](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze)). Modules use strict mode automatically ([MDN, JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)), so a write throws. A registry of objects therefore needs each entry frozen too.
- Node documents JSON imports with a mandatory `with { type: 'json' }` attribute and a default export only ([Node.js ESM, JSON modules](https://nodejs.org/docs/latest/api/esm.html#json-modules)). The repo declares `"engines": {"node": ">=18"}` (`package.json:7-9`) and `manifest.json` is read with `readFileSync` + `JSON.parse` (`scripts/health.mjs:70-72`), so a JSON source of truth would add an import-attribute dependency; I did not verify which Node 18.x/20.x versions support the attribute syntax, so a `.mjs` module is the safer choice.
- A TypeScript `as const` has no runtime effect and does not exist in `.mjs`; the nearest equivalent is `Object.freeze` plus JSDoc types. I found no `checkJs` or `tsc` in `package.json`, so JSDoc types are documentation only.
- Repo conventions: `lib/config.mjs`, `lib/errors.mjs`, `lib/untrusted.mjs` "stay at the root" of `lib/` (`docs/roadmap/parser-refactoring.md:11`); `lib/untrusted.mjs` is excluded from Biome (`biome.json:11`) and is shipped by path and hash (same roadmap line). Duplicates are tracked with `LEGACY(parser-pipeline)` comments (`queue.mjs:6,63`, `paginate.mjs:9-11`, `dedup.mjs:23-26`, `index.mjs:35-36`). Biome `organizeImports` is off (`biome.json:30`).

### 5. Proposed design

One module, `lib/sources.mjs`, at `lib/` root beside `config.mjs`, with no imports from other `lib/` files (so `transport/`, `processors/` and `config.mjs` can all import it without cycles; `index.mjs` already imports provider modules, so adapters stay out of it).

Shape (a frozen map of frozen entries; field list is the whole set found in section 1):

```js
export const SOURCES = Object.freeze({
  'habr-career': Object.freeze({
    id: 'habr-career',
    label: 'Habr Career',
    configKey: 'habr_career',
    transport: 'html',
    default: true,
    vacancyHost: 'career.habr.com',
    vacancyPath: /^\/vacancies\/\d+\/?$/,
    listingHost: 'career.habr.com',
    spacingMs: 750,
    stopOnAccessError: false,
  }),
  // geekjob, superjob, trudvsem, getmatch, helloworld-rs
});
export const SOURCE_IDS = Object.freeze(Object.keys(SOURCES));      // canonical order
export const DEFAULT_SOURCE_IDS = Object.freeze(SOURCE_IDS.filter(id => SOURCES[id].default));
export const LISTING_HOSTS = Object.freeze([...new Set(Object.values(SOURCES).map(s => s.listingHost))]);
```

Key points:

- Object key order of string keys is insertion order, so `SOURCE_IDS` preserves today's `SOURCES` order (`habr-career`, `geekjob`, `superjob`, `trudvsem`, `getmatch`, `helloworld-rs`), which `primary_source_order` validation and the appended order depend on (`lib/config.mjs:112-123,270-274`, `test/run.mjs:595-601`). A test should pin this order.
- Keep the existing exports `SOURCES` and `DEFAULT_SOURCES` from `lib/config.mjs` as re-exports of arrays (tests import them: `test/run.mjs:669,694,699`), or change the tests in the same step. Naming the new map `SOURCES` while the array export of the same name stays is confusing; call the map `SOURCE_REGISTRY` and keep `SOURCES` as `SOURCE_IDS`.
- Derived values replace hand-kept lists: `API_SOURCES` becomes `transport === 'api'` (removes the pair at `config.mjs:26` and `normalize.mjs:283`); `SOURCE_HOSTS`/`VACANCY_PATHS` come from `vacancyHost`/`vacancyPath`; `CONFIG_KEYS` from `configKey`; `label()` from `label`; `STOP_ON_ACCESS_ERROR` from the flag; `ORDER_LENGTHS` from a computed rule.
- `manifest.json:11-18` must remain a literal file read by the career-ops engine, so it cannot import the module. Add one test in `test/smoke.mjs` (which already checks the manifest contract per `index.mjs:4-5`) asserting `manifest.allowedHosts` equals `LISTING_HOSTS` as a set. That converts the silent three-way copy into a checked one.
- `http.mjs` `ALLOWED_PATHS` holds listing-path predicates, not just hosts. Keep the predicates in `http.mjs` (they are security-relevant and have one owner) but key the object from `LISTING_HOSTS` or assert in a test that its keys equal `LISTING_HOSTS`. `queue.mjs` can build its `queues` map from `listingHost` and `spacingMs` and delete the LEGACY comment.
- Provider files import their own entry (`SOURCES['geekjob'].id` or a named `GEEKJOB`) in place of the two string literals; the fetch URLs (`LISTING_URL`, `API_URL`) stay local, because they hold path and query logic, but their host can be derived from `listingHost` if desired. This step is optional.
- `index.mjs` `adapters` stays an explicit object: it imports the provider functions, and `test/legacy.mjs:95-111` reassigns `adapters['habr-career']` to inject a stub, so freezing it would break that test. A test can assert `Object.keys(adapters)` equals `SOURCE_IDS`.
- Do not freeze `adapters`; do freeze the registry. Note that freezing is shallow, so each entry and each exported array must be frozen as in the sketch (MDN link above); a `RegExp` value stays mutable through `lastIndex`, but the patterns have no `g` flag (`normalize.mjs:165-170`), so they are stateless in `.test()`.

### 6. Migration order (smallest safe steps)

1. Add `lib/sources.mjs` and a test file (or section in `test/smoke.mjs`) that pins the id order, the id-to-`configKey` map, hosts, and `manifest.allowedHosts`. Nothing else changes, tests pass.
2. `lib/config.mjs`: derive `SOURCES`/`DEFAULT_SOURCES`, `CONFIG_KEYS`, `API_SOURCES`, `ORDER_LENGTHS` from the registry; keep export names. Replace the `4, 5` literal and the "four, five or all six" error text (`config.mjs:119`) with a message built from the lengths, or keep the text if tests assert it (check `test/run.mjs` for message matches first).
3. `lib/processors/normalize.mjs`: replace `SOURCE_HOSTS`, `VACANCY_PATHS`, `API_SOURCES`.
4. `lib/processors/dedup.mjs` and `paginate.mjs`: use `label` and `stopOnAccessError`. Decide the `helloworld-rs` label first (see risks); `dedup.mjs:23-26` says the missing label is pinned by a test.
5. `lib/transport/queue.mjs` and `http.mjs`: build from the registry; remove the LEGACY duplicate-list comment.
6. Providers: replace the two id literals each. Mechanical.
7. `scripts/health.mjs`: derive the `--source` choices and help text from `SOURCE_IDS` (or leave as is: only `getmatch` and `helloworld-rs` get special config there, `health.mjs:15-17`).
8. Tests and docs: replace repeated literals with the registry only where it improves clarity; keep literals where a test pins the persisted string (see risks). Update `docs/providers/README.md:21,26` and `docs/providers/getmatch.md:34` prose, and add the new module to the layout line in `docs/roadmap/parser-refactoring.md:11`.

Each step is one commit and one concern; run `npm test` and `npm run lint` after each (`package.json:11-12`).

### 7. Risks and stable contracts

- Persisted and external string values must not change: source ids (they appear in job notes `source: <id>`, the `source` and `sourceId` fields of every job, `normalize.mjs:354-365`, and in logs `index.mjs:48-53`), YAML keys `habr_career`/`helloworld_rs` (user `portals.yml`, `examples/portals.yml`), `primary_source_order` values, and `manifest.json` hosts. All are user-visible config or downstream data. Pin them with literal expectations in tests, not derived ones, so a rename in the registry fails a test.
- Source display names appear in notes shown to users (`dedup.mjs:181-201`). Adding `helloworld-rs` to labels changes output text that a test pins (`dedup.mjs:23-26`); treat it as a separate, deliberate behaviour change, not part of the refactor.
- `sourceOf` parses the note with `/^source: ([a-z-]+)/` (`dedup.mjs:19-20`). Ids with digits or underscores would silently become `''`. Keep the id alphabet documented in the registry (a test that every id matches `/^[a-z-]+$/`), or read `job.source` (`normalize.mjs:363`) instead of the note.
- Circular imports: the registry must not import anything from `lib/`; regexes in it must be copied verbatim (`normalize.mjs:164-171`). The test suite has coverage per source (`test/run.mjs:403-422,847-851`), which guards the move.
- `manifest.json` cannot reference the module; the test in step 1 is the only guard. A JSON registry would let `manifest.json` stay the single file, but needs `with { type: 'json' }` ([Node.js ESM, JSON modules](https://nodejs.org/docs/latest/api/esm.html#json-modules)) and gives up regex values and comments; not recommended.
- Over-centralising: moving provider-local regexes and strings into the registry would couple unrelated files for no deduplication gain (section 3). The registry should hold only values read by two or more modules.
- Bundling: `lib/untrusted.mjs` is distributed by path and hash and is excluded from Biome (`biome.json:11`); do not make it import the registry.
- Release procedure: the version string in `http.mjs:13` is edited by hand (`http.mjs:10`, `RELEASING.md`). Reading it from `manifest.json` or `package.json` would remove a third copy, but `lib/` code reading files at import time is a separate decision; leave it out of this change.

## Sources

- `lib/config.mjs`, `lib/processors/normalize.mjs`, `lib/processors/dedup.mjs`, `lib/processors/paginate.mjs`, `lib/transport/http.mjs`, `lib/transport/queue.mjs`, `index.mjs`, `manifest.json`, `scripts/health.mjs`, `test/*.mjs`, `docs/providers/README.md`, `docs/roadmap/parser-refactoring.md` (line numbers as cited, working tree on 2026-10-12; some files carry uncommitted formatting changes, so line numbers can shift by a few lines against `master`).
- [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [MDN: Object.freeze](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze)
- [Node.js: ECMAScript modules, JSON modules](https://nodejs.org/docs/latest/api/esm.html#json-modules)
