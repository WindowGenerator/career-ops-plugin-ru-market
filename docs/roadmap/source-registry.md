# Source registry: roadmap

Status: Implemented
Date: 2026-10-12
Type: roadmap

Evidence for every claim here, with `file:line` references, is in [constants duplication research](../research/constants-duplication.md). This page records the decisions and the order of work.

## Problem

The repository has no constants module. The source registry (ids, labels, config keys, transport, hosts, vacancy paths, spacing, stop-on-access-error) lives in 11 hand-kept structures across `lib/config.mjs`, `lib/processors/`, `lib/transport/`, `index.mjs`, `manifest.json` and every provider file. Concretely:

- `API_SOURCES` is a byte-identical copy in `lib/config.mjs` and `lib/processors/normalize.mjs`.
- The host allowlist is copied three times (`http.mjs`, `queue.mjs`, `manifest.json`). `queue.mjs` admits nothing keeps the copies in sync, and a missed host throws at runtime.
- Each provider repeats its own id twice (adapter object and `paginate(...)` call). Tests use about 150 id literals.
- Literal `4`, `5` and "six" in `lib/config.mjs` and in docs prose go stale when a seventh source is added.
- `sourceOf` in `dedup.mjs` parses the id back out of the note text with `/^source: ([a-z-]+)/`.
- `MS_PER_DAY`, `sleep` and the version string `0.8.0` are also duplicated (separate concern).

Adding a source today means editing about 11 places with no test to catch a miss.

## Decisions

- One module, `lib/sources.mjs`, at the `lib/` root. It imports nothing from other `lib/` files, so `config`, `transport` and `processors` can all import it without cycles. It must not be imported by `lib/untrusted.mjs` (shipped by path and hash).
- Shape: a frozen `SOURCE_REGISTRY` of frozen entries with `id`, `label`, `configKey`, `transport`, `default`, `vacancyHost`, `vacancyPath`, `listingHost`, `spacingMs`, `stopOnAccessError`. `Object.freeze` is shallow, so each entry and each exported array is frozen too.
- Derived exports: `SOURCE_IDS` (canonical order, same as today's `SOURCES`), `DEFAULT_SOURCE_IDS`, `LISTING_HOSTS`. Existing exports `SOURCES` and `DEFAULT_SOURCES` stay in `lib/config.mjs` as re-exports because tests import them.
- A `.mjs` module, not a JSON registry. JSON imports need `with { type: 'json' }`, the repo targets Node 18, and regexes and comments do not fit JSON.
- `index.mjs` `adapters` stays an explicit, unfrozen object. `test/legacy.mjs` reassigns entries. A test asserts its keys equal `SOURCE_IDS`.
- `manifest.json` cannot import code. A test in `test/smoke.mjs` asserts `allowedHosts` equals `LISTING_HOSTS` as a set.
- `ALLOWED_PATHS` predicates stay in `http.mjs` (security-relevant, one owner). A test asserts its keys equal `LISTING_HOSTS`. `queue.mjs` builds its per-host map from the registry.
- Provider-local regexes and word lists stay local: one owner, one use. The registry holds only values read by two or more modules.
- Persisted strings stay literal and test-pinned, not derived: source ids, YAML keys `habr_career` and `helloworld_rs`, `primary_source_order` values, manifest hosts, and the `hh` negative-test literals.
- Superjob and trudvsem have different vacancy and API hosts, so the entry has separate `vacancyHost` and `listingHost` fields rather than one host.
- Scope is data only. Behaviour (`fetch`, per-source option validation) stays where it is; moving it behind the same module is a later change (see [architecture redesign](architecture-redesign.md)). The module is a leaf so that transport and processors can import it without a cycle.
- The interface is the raw frozen map plus the derived arrays. No accessor functions until a second entry shape exists.
- `helloworld-rs` label: keep today's quirk. `dedup.mjs` `label()` reads the registry `label` and falls back to the raw id, so the note text is unchanged. A real label is a separate commit that also updates the pinned test.
- `sourceOf` reads `job.source` instead of parsing the note. The test helper in `test/processors.mjs` and the fixture in `test/legacy.mjs` gain a `source` field, and the test "reads the source id from the note" is replaced by one that reads `job.source` and returns empty when absent. No fallback to the note. Salary parsing from the note in `dedup.mjs` is left alone.
- Providers import their id from the registry instead of two string literals each.
- Tests pin ids, config keys, `primary_source_order` values and hosts as literals, not derived from the registry.
- `MS_PER_DAY`, `sleep` and the version string stay out of this change and go in a follow-up.

## Scope

- [x] Step 1: add `lib/sources.mjs` and tests pinning id order, id to `configKey` map, hosts and `manifest.allowedHosts`. No other change.
- [x] Step 2: `lib/config.mjs` derives `SOURCES`, `DEFAULT_SOURCES`, `CONFIG_KEYS`, `API_SOURCES` and the allowed order lengths from the registry. Replace literal `4`, `5` and the "four, five or all six" error text with a computed message (check `test/run.mjs` for message assertions first).
- [x] Step 3: `lib/processors/normalize.mjs` drops `SOURCE_HOSTS`, `VACANCY_PATHS` and its `API_SOURCES` copy.
- [x] Step 4: `lib/processors/dedup.mjs` and `paginate.mjs` use `label` and `stopOnAccessError`. `sourceOf` reads `job.source`; update the fixtures and the `sourceOf` test in the same commit.
- [x] Step 5: `lib/transport/queue.mjs` and `http.mjs` build from the registry. Remove the LEGACY duplicate-list comment.
- [x] Step 6: providers import their id instead of two string literals each.
- [x] Step 7: `scripts/health.mjs` derives `--source` choices and help text from `SOURCE_IDS`.
- [x] Step 8: tests use the registry where it improves clarity and keep pinned literals where a test guards a persisted string. Update `docs/providers/README.md`, `docs/providers/getmatch.md` and the layout line in [parser refactoring](parser-refactoring.md).

One commit per step. Run `npm test` and `npm run lint` after each.

## Acceptance criteria

1. Adding a seventh source needs one registry entry plus its provider file, adapter line and manifest host, and a missed manifest host fails a test.
2. No hand-kept copy of `API_SOURCES`, hosts, labels or config keys remains outside `lib/sources.mjs`.
3. `npm test` and `npm run lint` pass after every step, with no change to output for existing sources.
4. Source ids, YAML keys, `primary_source_order` values and manifest hosts are unchanged and pinned by literal test expectations.
5. `sourceOf` reads `job.source` and no longer depends on an id alphabet.
6. `node test/docs.mjs` passes.
