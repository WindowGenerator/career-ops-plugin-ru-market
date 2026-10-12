# Parser refactoring: roadmap

Status: Planned
Date: 2026-10-11
Type: roadmap

The branch `refactor/parser-pipeline` made `lib/` readable without changing behaviour. This page records what was done, what was left on purpose, and the order in which the remaining candidates should be taken. It is written to be read next to the code.

## What was done in this branch

- Layout: `lib/providers/` (six sources), `lib/transport/` (`http`, `queue`, `retry`), `lib/processors/` (`paginate`, `normalize`, `compensation`, `dedup`, `page-pipeline`), `lib/helpers/` (`html`). `lib/config.mjs`, `lib/errors.mjs`, `lib/sources.mjs` (source registry, see [source registry](source-registry.md)) and `lib/untrusted.mjs` stay at the root; `lib/untrusted.mjs` did not move because `install.sh`, the release workflow and the HH companion use that path and its hash.
- Characterization tests written first on the old behaviour: `test/text.mjs`, `test/html.mjs`, `test/transport.mjs`, `test/processors.mjs`. Existing tests and fixtures are unchanged except for import paths.
- Page pipeline: the six providers repeated the same tail (map cards with `makeJob`, drop nulls, refuse a page where every item is invalid, deduplicate). It now lives once in `lib/processors/page-pipeline.mjs`, tested in `test/page-pipeline.mjs`. Each provider supplies a small extractor adapter.
- Readability pass: module header comments, JSDoc on every export, named constants and regexes, early returns instead of nested ternaries, lines under 120 characters (only a few long regex literals remain), no function above 40 lines.
- Odd behaviour was not fixed. It carries a `LEGACY(parser-pipeline)` comment and is pinned by a test named `legacy: ...`, mostly in `test/legacy.mjs`.

## Page pipeline: chosen interface

`parsePage(adapter, raw, ctx)` returns `{ jobs, hasNext, ...extras }`. The adapter has `source`, `noValid` (the exact broken-markup message), `extract(raw, ctx)` returning `{ items, hasNext, ...extras }`, `values(item, ctx)` returning `makeJob` input or `null`, and an optional `finish(job, item)` that runs on every `makeJob` result.

The module owns: the `makeJob` mapping, dropping invalid items, the rule that a page with items but no valid job is `broken-markup`, local deduplication, and copying extras to the result. The adapter owns what differs per source: access and shape checks (these need the HTML tree or the JSON shape), empty-page confirmation and `hasNext`.

Deviation from the first brief: access checks stay in each extractor instead of the module, because only HTML providers have an access check and it needs the parsed tree. `hasNext` and extras may be getters; the module reads them after mapping, which keeps the original HelloWorld.rs error order.

### Rejected alternatives

- Curried single parameter, `pagePipeline(adapter)` returning a parser, with candidates that are either values or prebuilt jobs (thunks). Smallest interface, but the dual candidate type is a smell and getmatch needed an escape hatch to amend jobs after `makeJob`.
- Staged hooks (`access`, `extract`, `emptyOk`, `validate`, `nullIsInvalid`, `brokenWhenNoneValid`, `finish`, a `SKIP` symbol). Most flexible, but about eight knobs against about fifteen lines of owned logic: shallow, low leverage, and the complex providers kept all their logic in the hooks.
- Chosen: the declarative extractor with `values` and an optional `finish`. Four simple providers shrink to extraction plus a field mapping, and the two complex ones (getmatch, HelloWorld.rs) use only `finish` and extras. Fewer knobs than the staged design, and the seam sits where behaviour really varies.

## LEGACY quirks left as they are

Each is marked `LEGACY(parser-pipeline)` in code. The tests are named `legacy: ...`.

- `lib/processors/dedup.mjs:22`: `label()` has no entry for `helloworld-rs`, so notes read `cross-listed: helloworld-rs <url>`.
- `lib/processors/dedup.mjs:146`: salary notes are merged by splitting the donor note on `'; salary: '`.
- `lib/processors/dedup.mjs:126`: a `postedAt` of 0 counts as missing in the date comparison.
- `lib/processors/dedup.mjs:187`: a source missing from the order list has `indexOf` -1 and ranks first.
- `lib/processors/paginate.mjs:9`: `getmatch` and `helloworld-rs` are hard-coded as stop-on-access-error.
- `lib/processors/paginate.mjs:65`: `matchedQueries` is written onto the job objects returned by the provider.
- `lib/processors/compensation.mjs:196` and `:205`: any unit mismatch keeps the job; a filter `max` of 0 or unset means no upper bound.
- `lib/processors/compensation.mjs:173`: the period expression `text?.period !== 'unknown' ? text?.period ?? period : period`.
- `lib/processors/compensation.mjs:158`: a thousands suffix applies only to the amount it follows (`100–200 тыс.` gives 100 and 200000).
- `lib/processors/compensation.mjs:92` and `lib/processors/normalize.mjs:175`: the currency regex chain is duplicated with slightly different RUB patterns.
- `lib/providers/superjob.mjs:60` and `lib/providers/trudvsem.mjs:70`: duplicated `salaryText` builders.
- `lib/providers/getmatch.mjs:28` and `lib/providers/helloworld.mjs:31`: `broken` redefined per module; `sleep` is redefined in `lib/transport/retry.mjs:10` and `lib/transport/queue.mjs:6`.
- `lib/transport/queue.mjs:54`: the host list is a second copy of the allowlist in `lib/transport/http.mjs`.
- `index.mjs:55`: `fetch*` take `(cfg, ctx, options)` but the plugin never passes `options`.
- `lib/providers/habr-career.mjs:41` and `:52`: hard-coded Russian and English labels for dates and chips.
- `lib/providers/geekjob.mjs:45`: card dates count only with an explicit publication label.
- `lib/providers/helloworld.mjs:136` and `:171`: lazy next-link validation, and the icon-row location and salary reading.
- `lib/providers/getmatch.mjs:91`: `continueOnEmpty` to pass over pages of promotions only.
- `lib/helpers/html.mjs:33`: the `findLastIndex` fallback, dead on Node 18 and later.

## Code review findings left for later

The review of the branch found no regression introduced by the refactor. It did confirm pre-existing behaviour that the refactor must not change, so these are open for a separate behaviour change:

- `lib/providers/getmatch.mjs:51`: `checkVacancyIdentity` reads `match(...)[1]` without a null guard; a vacancy URL without a numeric id prefix throws a `TypeError` (category `unknown`) instead of `broken-markup`. Same as before the branch.
- `lib/processors/dedup.mjs:51`: `postingIdentity` can produce an empty or `undefined` id for unexpected URLs, merging unrelated jobs.
- `lib/processors/compensation.mjs:84`: `taxBasisOf` matches `net` and `gross` without word boundaries, so unrelated words in salary text can set a tax basis.
- `lib/providers/superjob.mjs` and `lib/providers/trudvsem.mjs`: `Number(x) || undefined` turns an explicit amount of 0 into a missing bound.
- `index.mjs:55`: no per-source timeout around the parallel fetch.
- The LEGACY list above (order list `indexOf` -1, salary note split, hard-coded stop-on-access ids, duplicated helpers) also appeared in the review.

## Lint warnings left for later

Biome (`biome.json`) runs in CI with `npm run lint`. Two rules are set to `warn` because fixing them could change behaviour:

- `noEmptyCharacterClassInRegex`: the `[^]` idiom ("any character, including newlines") in `lib/helpers/html.mjs:17-18` and `test/helloworld.mjs`. Replace with `[\s\S]` together with a test that pins the match.
- `useIterableCallbackReturn`: `forEach`-style callbacks that return a value in `lib/processors/normalize.mjs`, `lib/providers/getmatch.mjs`, `lib/providers/helloworld.mjs` and `test/getmatch.mjs`.

`lib/untrusted.mjs` is excluded from Biome: `install.sh` and `release.yml` check its sha256, and the companion embeds the same file. Companion files (`*.mjs.txt`) are not matched by Biome.

## Remaining candidates

1. One module per provider that owns its hosts, configuration, id rules, queue spacing and deduplication identity. Today these are spread over eight modules (`config`, `http`, `queue`, `normalize`, `dedup`, `paginate`, `index`, the provider). Removes the duplicated host list and the hard-coded source ids.
2. Done in this branch: the page pipeline.
3. Split `lib/processors/normalize.mjs` (text helpers, dates, URLs, salary, `makeJob`) and unify the two salary parsers (`parseSalary` and `parseCompensation`) and their currency chains.
4. The HH companion duplicates plugin code (the inlined compensation parser, a copy of `untrusted.mjs`). Share it through modules, weighing the `install.sh` trade-off: every shared file is another hashed managed file with an install and upgrade path.
5. Break up `searchHh` and `collectBatch` in the companion with a page-state classifier (ok, empty, challenge, broken).
6. A per-provider config schema so `lib/config.mjs` stops knowing every provider option.

## Suggested order

Candidate 3 first (low risk, covered by the new processor tests), then 1 (removes the largest source of smearing and fixes most LEGACY items on the way, each as its own change with its test updated), then 6, then 5 and 4 (companion; needs browser tests and the installer trade-off decision).
