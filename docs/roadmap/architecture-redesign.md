# Architecture redesign: roadmap

Status: Planned
Date: 2026-10-12
Type: roadmap

Umbrella plan for reshaping `index.mjs` and `lib/` after the [parser refactoring](parser-refactoring.md). Phase 1 is the constants consolidation, detailed in [source registry](source-registry.md) with evidence in [constants duplication research](../research/constants-duplication.md). Later phases build on it. Every phase ends with a verification gate that must pass before the next one starts.

## Problem

- Source facts (ids, labels, config keys, transport, hosts, spacing) are hand-copied across `lib/config.mjs`, `lib/processors/`, `lib/transport/`, `index.mjs`, `manifest.json` and every provider. See [source registry](source-registry.md).
- Source-specific option validation (`apply*Options`, the `if (id === ...)` chain in `sourceConfig`) lives in `lib/config.mjs`, so adding a source edits the shared config module.
- `lib/config.mjs` hard-codes counts: `ORDER_LENGTHS` has literal `4` and `5`, and the error text says "four, five or all six".
- `fetchAll` in `index.mjs` parses config, runs sources, logs failures and aggregates errors in one function. Its failure-aggregation rule has no unit test of its own.
- `adapters` in `index.mjs` is an exported mutable object; `test/legacy.mjs` reassigns its entries to inject stubs.
- Providers have no common shape: HTML providers go through `paginate` and `parsePage`, API providers and HelloWorld.rs have their own `fetch*` bodies.
- `LEGACY(parser-pipeline)` markers have no owner or exit condition.
- `npm test` is a chain of 12 `node ... &&` commands, so the first failing file hides the rest.

## Decisions

- Phase order: constants first, then config split, then provider object, then `fetchAll`, then test runner. Each phase is independent to revert.
- One commit per step, one concern per commit, no behaviour change in phases 1 to 4. Behaviour changes (for example the `helloworld-rs` label) are separate commits.
- Persisted strings stay literal and test-pinned: source ids, YAML keys `habr_career` and `helloworld_rs`, `primary_source_order` values, manifest hosts. See [source registry](source-registry.md).
- `lib/untrusted.mjs` is shipped by path and hash. No phase imports the registry into it, moves it or reformats it.
- Registry holds only values read by two or more modules. Provider-local regexes and word lists stay local.

## Scope

### Phase 1: constants consolidation

Steps 1 to 8 are defined in [source registry](source-registry.md). Summary: add `lib/sources.mjs` (`SOURCE_REGISTRY`, `SOURCE_IDS`, `DEFAULT_SOURCE_IDS`, `LISTING_HOSTS`), then migrate `config`, `normalize`, `dedup`, `paginate`, `queue`, `http`, providers, `health` and tests onto it.

- [ ] Registry module and pinning tests
- [ ] `lib/config.mjs` derives `SOURCES`, `DEFAULT_SOURCES`, `CONFIG_KEYS`, `API_SOURCES`
- [ ] `lib/processors/normalize.mjs` drops `SOURCE_HOSTS`, `VACANCY_PATHS`, `API_SOURCES` copy
- [ ] `dedup.mjs`, `paginate.mjs` use `label`, `stopOnAccessError`; `sourceOf` reads `job.source`
- [ ] `queue.mjs`, `http.mjs` build from the registry
- [ ] Providers import their id instead of two literals
- [ ] `scripts/health.mjs` derives `--source` choices
- [ ] Shared `MS_PER_DAY` and `sleep` in one place (follow-up commit, not part of steps 1 to 8)

### Phase 2: config split

- [ ] Replace literal `4`, `5` in `ORDER_LENGTHS` and the "four, five or all six" text in `validateOrder` with a rule derived from the registry. Check `test/run.mjs` for message assertions first and update them in the same commit.
- [ ] Move `applyHabrOptions`, `applySearchApiOptions`, `applyGetmatchOptions`, `applyHelloWorldOptions` next to their providers as `validateConfig(raw, cfg)`.
- [ ] `sourceConfig` keeps only shared options (`enabled`, `mode`, `max_pages`) and calls the provider's `validateConfig`.
- [ ] Error messages stay byte-identical for existing sources (they name the offending option).

### Phase 3: provider object

- [ ] Define one shape per source: `{ id, fetch, validateConfig }`, typed with JSDoc in `lib/providers/`.
- [ ] `index.mjs` builds its provider list from these objects instead of the bare `adapters` map.
- [ ] Decide whether the third `options` argument of `fetch*` (used only by `scripts/health.mjs` for `retries: 0`) is part of the contract or is removed.
- [ ] Do not unify the HTML and API fetch bodies in this phase; only the outer shape.

### Phase 4: `fetchAll`

- [ ] Split into `runSources(config, ctx, providers)` returning `{ jobs, failures }` and a pure `summarizeFailures(failures)`.
- [ ] Inject providers as a parameter (default: the real list) so `test/legacy.mjs` stops reassigning module state.
- [ ] Keep today's rule: one source selected rethrows its own error; several selected and all failed throws `SourceError('sources-failed', ...)`; any success returns de-duplicated jobs.
- [ ] Keep the log line `ru-market` with `{ source, category, status: 'failed' }`.

### Phase 5: tests and leftovers

- [ ] One test runner that runs every test file and reports all failures, replacing the `&&` chain in `package.json`.
- [ ] Triage each `LEGACY(parser-pipeline)` marker: keep as a documented decision (add owner and exit condition) or fix with a pinned behaviour change.
- [ ] Decide the `lib/untrusted.mjs` long line against the Biome 80-column width: exclude it explicitly in `biome.json`, or reformat and re-pin the hash. Never change it silently.
- [ ] Confirm whether `detect() { return null }` in `index.mjs` is required by the career-ops provider contract; comment it either way.

## Verification

### Baseline (before Phase 1)

Run once on a clean tree and keep the output as the reference.

1. `npm test` passes.
2. `npm run lint` passes.
3. Capture golden output: run `fetchAll` against the recorded fixtures for all six sources and save the job list as JSON in the scratchpad. The same capture must be byte-identical after every phase 1 to 4 step. Fixtures: `fixtures/habr-career`, `fixtures/geekjob`, `fixtures/getmatch`, `fixtures/helloworld-rs`; superjob and trudvsem use stubbed API responses from `test/run.mjs`.
4. Record the SHA-256 of `lib/untrusted.mjs` and of `manifest.json`.

### Gate after every step

- `npm test` and `npm run lint` pass.
- `node test/docs.mjs` passes when docs changed.
- `git diff --stat` touches only the files the step names.
- Golden output from the baseline is unchanged (phases 1 to 4).
- `lib/untrusted.mjs` hash is unchanged.

### Per-phase checks

| Phase | Extra check | How |
| --- | --- | --- |
| 1 | Adding a seventh source needs one registry entry, one provider file, one adapter line and one manifest host | Dry run on a throwaway branch: add a fake source and confirm the only failing test is the missing manifest host. Discard the branch. |
| 1 | `manifest.allowedHosts` equals `LISTING_HOSTS` as a set | Test in `test/smoke.mjs` |
| 1 | `Object.keys(adapters)` equals `SOURCE_IDS`; `ALLOWED_PATHS` keys equal `LISTING_HOSTS` | Tests |
| 1 | Every id matches `/^[a-z-]+$/` | Test, or `sourceOf` reads `job.source` |
| 1 | Persisted strings unchanged | Literal expectations in tests for ids, YAML keys, order values, manifest hosts |
| 2 | Config error messages unchanged | Existing `test/run.mjs` assertions pass without edit, except the deliberate `validateOrder` message change, which gets its own test |
| 2 | Accepted `primary_source_order` lengths | New table test covering every prefix length of the registry, plus rejection of duplicates, unknown ids and missing core pair |
| 2 | `config.mjs` no longer names any source id except through the registry | `grep -n "'habr-career'\|'geekjob'\|'superjob'\|'trudvsem'\|'getmatch'\|'helloworld-rs'" lib/config.mjs` returns nothing |
| 3 | Every registry entry has a provider object and the reverse | Test comparing the two key sets |
| 3 | `scripts/health.mjs` still passes `retries: 0` through | `npm run health -- --source habr-career` against the fixture transport, or the existing health test |
| 4 | Failure aggregation | New unit tests for `runSources` and `summarizeFailures`: one source fails alone, one of several fails, all of several fail, empty selection |
| 4 | Log line shape | Test captures `ctx.log` and compares the JSON string |
| 4 | `test/legacy.mjs` no longer assigns to `adapters` | `grep -n "adapters\[" test/` returns nothing |
| 5 | Runner reports all failures | Temporarily break two test files, confirm both are reported, then revert |
| 5 | Every file listed in the old `test` script is still run | Compare the runner's file list with the old chain |

### Final acceptance

After Phase 5, run `npm test`, `npm run lint`, `npm run test:integration` and `npm run health`. Compare golden output with the baseline: no difference. Confirm the `lib/untrusted.mjs` hash against the baseline, or against a deliberately re-pinned value recorded in [RELEASING.md](../../RELEASING.md) terms.

## Acceptance criteria

1. Phase 1 acceptance criteria in [source registry](source-registry.md) hold.
2. `lib/config.mjs` contains no per-source option validation and no source-count literals.
3. Adding a source touches: the registry, one provider file, one `index.mjs` line, `manifest.json` hosts, docs. A missed manifest host fails a test.
4. `fetchAll` failure rules are covered by unit tests that need no real provider.
5. No test mutates an exported module object.
6. `npm test` reports every failing test file in one run.
7. Output for every existing source is byte-identical to the baseline after phases 1 to 4.
8. Every remaining `LEGACY(parser-pipeline)` comment has an owner or an exit condition.
9. `node test/docs.mjs` passes.

## Open decisions

Recommended defaults are in bold.

1. **Test runner.** **A small `test/index.mjs` runner that spawns each file and aggregates exit codes** (no new dependency). Alternative: migrate to `node:test` and `node --test`, which needs a rewrite of the assert style in about 12 files.
2. **`options` argument of `fetch*`.** **Keep it, document it in the provider object type.** Alternative: remove it and let `health` pass retries through `ctx`.
3. **Provider object location.** **Each provider file exports its object next to `fetch*`.** Alternative: one `lib/providers/index.mjs` that assembles them.
4. **`untrusted.mjs` formatting.** **Exclude it in `biome.json`.** Alternative: reformat and re-pin the hash.
5. **Phase 1 `helloworld-rs` label.** **Keep today's raw-id quirk in this refactor**, as in [source registry](source-registry.md).
