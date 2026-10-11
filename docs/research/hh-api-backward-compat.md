# HH API backward compatibility audit

Status: Reference
Date: 2026-10-12
Type: research

## Question

The HH integration is now the Playwright browser companion (output contract 3, `companion/scan-hh.mjs.txt:14`). The hh.ru API route is closed for the owner and there are no other users. Which remnants of the old HH API adapter, older companion contract versions (2 and earlier) and legacy configuration keys remain in the repository, and which of them can be deleted without breaking the current companion?

Scope: `lib/`, `index.mjs`, `test/`, `fixtures/`, `scripts/`, `companion/`, `install.sh`, `docs/`, `README.md`, `RELEASE_NOTES.md`, `RELEASING.md`, `skill.md`, `manifest.json`, `examples/`, `.github/`. Method: grep for `hh`, `hh.ru`, `api.hh`, `HH_ACCESS_TOKEN`, `hhRemoved`, `sources.hh`, `removed`, `legacy`, `contract`, `compat`, `migrat`, `deprecated`, `0.6`, `0.7`; every hit was read in context.

## Findings

Category (a) is compatibility for the removed HH API (verdict: remove). Category (b) is what the current companion needs (verdict: keep). Category (c) is historical records (verdict: keep, not compatibility).

No HH API code is left in `lib/`, `index.mjs`, `scripts/`, `install.sh`, `.github/`, `manifest.json` or `fixtures/`. `lib/hh.mjs` and `fixtures/hh` are gone (`RELEASE_NOTES.md:19`), `manifest.json:9-16` lists no `api.hh.ru` and `optionalEnv` is only `SUPERJOB_API_KEY` (`manifest.json:8`), and `fixtures/` holds only `fixtures/hh-browser/salaries.html`, which the current companion tests use (`test/browser.sh:14`). The single code remnant is the `hhRemoved` check in `lib/config.mjs`.

### (a) Compatibility for the removed HH API (remove)

| file:line | what it is | verdict | why |
| --- | --- | --- | --- |
| `lib/config.mjs:50-56` | `hhRemoved()` helper: throws a `config` error "the HH API adapter was removed in 0.7.0 ... local-parser" | remove | Migration message only. |
| `lib/config.mjs:122-123` | `validateOrder`: `order.includes('hh')` calls `hhRemoved` | remove | Without it `hh` falls into the generic invalid-order check at `lib/config.mjs:124-128` (`SOURCES` no longer contains `hh`, `lib/config.mjs:9-10`) and still fails with a `config` error. |
| `lib/config.mjs:262` | `parseConfig`: `if (source === 'hh') hhRemoved('source')` | remove | `lib/config.mjs:263-264` already throws `Unsupported source: hh`. |
| `lib/config.mjs:267` | `parseConfig`: `if ('hh' in supplied) hhRemoved('sources.hh')` | remove | `lib/config.mjs:268-271` already throws `Unsupported source config: hh`. |
| `test/run.mjs:656-681` | Test "hh configuration is rejected with a migration hint and removed hosts are gone": asserts the `local-parser` and `0.7.0` text, `!('hh' in adapters)`, `jobUrl(..., 'hh')`, `api.hh.ru` rejected, manifest has no `api.hh.ru` or `HH_ACCESS_TOKEN` | remove (or shrink to one generic "unknown source `hh` is rejected" case) | Exercises the migration message (`test/run.mjs:668-669`) and the removed-adapter negatives. |
| `test/run.mjs:406` | `https://api.hh.ru/vacancies` in the list of URLs `assertRequestUrl` must reject | remove | It is one of many arbitrary forbidden URLs; no HH-specific rule exists in `lib/transport`. |
| `test/run.mjs:513` | `enqueue('api.hh.ru', ...)` expected to throw `Unsupported request host` | replace with a neutral host | Same reason; `example.com` is already used the same way at `test/transport.mjs:275`. |
| `test/run.mjs:691-692` | `['hh', ...]` and `[..., 'hh']` as invalid `primary_source_order` values | replace `hh` with an arbitrary unknown id | `hh` is only a stand-in for "unknown source" here. |
| `test/run.mjs:702-713` | Test "all-source scan makes no HH requests" | remove | Guards against the removed adapter coming back. |
| `test/helloworld.mjs:196` | `['hh', ...SOURCES].slice(0, n)` as invalid lengths 3 and 7 | replace `hh` with an arbitrary unknown id | Stand-in for an unknown source. |
| `test/transport.mjs:280-289` | `api.hh.ru` negative asserts inside "legacy: queue host list is a second copy ..." | replace with a neutral host | The legacy aspect is the duplicated host list, not HH; `test/legacy.mjs:1-3` says legacy tests pin pipeline behaviour. |
| `README.md:7` | Paragraph "Since 0.7.0 the HH API adapter is removed: `hh` ... rejected with a `config` error ... `HH_ACCESS_TOKEN` ... `api.hh.ru`" | remove the sentence about rejection, keep "Default sources" | Migration notice. |
| `README.md:71` | "`ru_market.sources.hh` is not read" | remove the clause | Refers to the legacy key. |
| `skill.md:22-23` | "HH has no adapter in this plugin since 0.7.0: `hh` in `ru_market` is rejected with a migration error" | rewrite to "HH is collected only by the companion" | Migration message; `skill.md:34` already says the same positively. |
| `companion/README.md:5` | "the plugin no longer has an HH API adapter, and `hh` in `ru_market` configuration is rejected with a migration error" | reword to "the only HH transport" | Migration message; keep the rest of the paragraph (anonymous context, risk). |
| `docs/providers/hh.md:9` | Status paragraph naming `lib/hh.mjs`, `HH_ACCESS_TOKEN`, `api.hh.ru` | shorten | History of the removed adapter. |
| `docs/providers/hh.md:18-22` | Section "Migration from 0.6.x" (remove `hh`, drop token, move `sources.hh.queries`, reinstall) | remove | Migration guide for users who do not exist. |
| `docs/providers/README.md:21` | Last sentence: "`hh` in `primary_source_order`, `source: hh` or `sources.hh` fails with a `config` error pointing to `local-parser`"; also "(lengths 2, 4, 5, 6 since 0.7.0)" | remove the sentence and the "since 0.7.0" tag | Migration message. |
| `docs/providers/README.md:48` | "the repository does not record the full set of HH API parameters" | unsure | Refers to HH offers in the matrix; not compat code, review wording only. |
| `docs/architecture/components.md:95` | "Source separation" row: "`hh` ... is rejected with a migration error" | rewrite | Describes the removed check. |
| `examples/registry-pr.md:3-9,16` | Registry PR text: provider for HH, "Egress: api.hh.ru", "HH uses only its public API", "HH returned HTTP 403" | remove the HH lines (or unsure whether the file is still needed) | Describes the removed API adapter; stale against `manifest.json:9-16`. No script reads the file (`scripts/registry-entry.mjs` has no HH text). |

### (b) Needed by the current companion (keep)

| file:line | what it is | verdict | why |
| --- | --- | --- | --- |
| `companion/scan-hh.mjs.txt:13-14` | `TOOL_VERSION`, `CONTRACT_VERSION = 3` | keep | Current contract identity. |
| `companion/scan-hh.mjs.txt:180` | `envelope()` writes `contractVersion` and `toolVersion` | keep | Output of contract 3 (`RELEASE_NOTES.md:8`). |
| `companion/scan-hh.mjs.txt:296` | `--resume` rejects a checkpoint whose `contractVersion !== CONTRACT_VERSION` | keep | Generic fail-closed guard, not a shim: it compares against the current version, so contract 2 is rejected only as a side effect. |
| `companion/scan-hh.mjs.txt:358` | `readCache` (`--import-cache`) rejects any `contractVersion !== CONTRACT_VERSION` with "regenerate the cache" | keep | Same guard. A cache is a file on disk read by an executable that trusts its shape; a version check stops it from silently importing a different shape. It does not translate or accept old data, so it is not compat code. `RELEASE_NOTES.md:8` already says "there is no compatibility shim". |
| `companion/scan-hh.mjs.txt:359-361` | Shape and URL validation of the cache | keep | Needed regardless of version. |
| `companion/browser-tests.mjs.txt:199-203` | Test writes a contract-2 cache with `sourceStatuses` and expects "contract version 2 ... regenerate the cache" | keep, reword fixture | Tests the guard; change `contractVersion: 2` to any non-current value (for example 99) and drop `sourceStatuses: []` so the test no longer mentions contract 2. |
| `companion/browser-tests.mjs.txt:54,160` | Assertions of contract 3 and tool version | keep | Current behaviour. |
| `companion/scan-hh.mjs.txt:106,112,179` | Output `source: 'hh'`, `transport: 'playwright'` | keep | Job fields of the companion, not the API. |
| `examples/hh-browser.yml:10`, `examples/hh-browser-cache.yml`, `README.md:71` | `hh_browser` block in its own `local-parser` entry | keep | Current configuration; the companion does not read `ru_market` (no `ru_market` or `sources` reference in `companion/scan-hh.mjs.txt`). |
| `test/browser.sh:5-17`, `test/companion-install.sh`, `test/integration.sh:74-105`, `fixtures/hh-browser/salaries.html` | Companion, installer and dedup tests and fixture | keep | Exercise contract 3 only. `source: 'hh'` at `test/integration.sh:77` is companion output. |
| `install.sh:19-80`, `.github/workflows/release.yml:37-41` | Install and release of `scan-hh.mjs` | keep | Current companion delivery. No migration or API code found. |
| `docs/providers/hh.md:25-48`, `companion/README.md:45-47` | Current configuration, cache import, resume ("Changed parameters/contracts are rejected") | keep | Current behaviour. |

### (c) Historical records (keep, not compatibility)

| file:line | what it is | verdict | why |
| --- | --- | --- | --- |
| `RELEASE_NOTES.md:15-33` | 0.7.0 entry: removal of the API adapter, migration steps | keep | Release record. |
| `RELEASE_NOTES.md:1-13` | 0.8.0 entry: contract 3, "`--import-cache` rejects contract 2 caches", patches removed | keep | Release record. |
| `RELEASE_NOTES.md:60-161` | 0.1.0-0.6.0 entries mentioning the API and `HH_ACCESS_TOKEN` (for example `RELEASE_NOTES.md:141`) | keep | Release records. |
| `README.md:58,60` | Checked roadmap items "Replace the HH API adapter ... (0.7.0)" | keep | Record. |
| `docs/roadmap/provider-architecture-review.md:29,70,79-81,142-144` | Roadmap file with Status Implemented, describes the removal | keep | Roadmap files stay in place after implementation (`docs/README.md`, Status definitions). |
| `docs/research/hh-companion-alternatives.md:9-22` | Study of the removed core patches and `sourceStatuses` | keep | Fixed-in-time research. |
| `RELEASING.md:13` | `update.sh` copy "for compatibility with existing release URLs" | keep, out of scope | Release-URL compatibility, unrelated to the HH API. |
| `index.mjs:35`, `test/legacy.mjs:1-3` | `LEGACY(parser-pipeline)` marker and test file | keep, out of scope | Pins parser-pipeline behaviour, not HH. |

### Tests and fixtures that exercise the compat paths

- `test/run.mjs:656-681`: migration test, fails once `hhRemoved` is gone (`test/run.mjs:668-669` expect `local-parser` and `0.7.0`).
- `test/run.mjs:406`, `test/run.mjs:513`, `test/run.mjs:691-692`, `test/run.mjs:702-713`: HH-named negatives; they keep passing after the code change but should be neutralised or removed.
- `test/helloworld.mjs:196`, `test/transport.mjs:283-288`: same, still pass.
- `companion/browser-tests.mjs.txt:199-203`: contract-2 cache; passes unchanged because the guard stays, only the wording should change.
- Fixtures: none exercise the removed API (`fixtures/hh` is deleted, `RELEASE_NOTES.md:19`).

### Side effect to expect

After removing the three `hhRemoved` calls, `hh` still fails with `config` errors (`Unsupported source: hh`, `Unsupported source config: hh`, invalid `primary_source_order`), but without the `local-parser` hint.

## Sources

- [lib/config.mjs](../../lib/config.mjs)
- [index.mjs](../../index.mjs)
- [manifest.json](../../manifest.json)
- [companion/scan-hh.mjs.txt](../../companion/scan-hh.mjs.txt)
- [companion/browser-tests.mjs.txt](../../companion/browser-tests.mjs.txt)
- [companion/README.md](../../companion/README.md)
- [test/run.mjs](../../test/run.mjs), [test/helloworld.mjs](../../test/helloworld.mjs), [test/transport.mjs](../../test/transport.mjs), [test/legacy.mjs](../../test/legacy.mjs), [test/integration.sh](../../test/integration.sh), [test/browser.sh](../../test/browser.sh)
- [README.md](../../README.md), [skill.md](../../skill.md), [RELEASE_NOTES.md](../../RELEASE_NOTES.md), [RELEASING.md](../../RELEASING.md)
- [docs/providers/hh.md](../providers/hh.md), [docs/providers/README.md](../providers/README.md), [docs/architecture/components.md](../architecture/components.md)
- [docs/roadmap/provider-architecture-review.md](../roadmap/provider-architecture-review.md), [docs/research/hh-companion-alternatives.md](hh-companion-alternatives.md)
- `examples/registry-pr.md` (deleted), [examples/hh-browser.yml](../../examples/hh-browser.yml)

## Conclusion

The only runtime compat code is `hhRemoved` and its three callers (`lib/config.mjs:50-56,122-123,262,267`); deleting them is safe because the generic validation at `lib/config.mjs:124-128,263-264,268-271` still rejects `hh`. The matching migration test (`test/run.mjs:656-681`) must go, and HH-named negatives in `test/run.mjs`, `test/helloworld.mjs` and `test/transport.mjs` should become neutral. The migration prose should be removed from `README.md:7`, `skill.md:22-23`, `companion/README.md:5`, `docs/providers/hh.md:9,18-22`, `docs/providers/README.md:21`, `docs/architecture/components.md:95`, and the stale `examples/registry-pr.md`.

Rejecting contract 2 in `--import-cache` (`companion/scan-hh.mjs.txt:358`) is a needed guard, not compat: it compares with the current `CONTRACT_VERSION` and accepts nothing old. Keep it (and the checkpoint check at line 296); only make its test fixture version-neutral. Release notes, the 0.7.0 roadmap file and the companion study are records and stay.
