# ru-market for career-ops

The plugin collects vacancies from SuperJob, Trudvsem (Work in Russia, API), Habr Career and GeekJob (public HTML listings), and from the optional getmatch and HelloWorld.rs. HH is collected by a separate browser companion (see below).

**Version 0.8.0, breaking change: the plugin no longer patches career-ops core.** The installer, the plugin and the companion work with stock upstream career-ops (a commit that contains upstream PR #4697, which lets `local-parser` pass extra job fields through). Core behaviour is never changed: no patches, no source status channel, no trust-score rule. The companion output is contract 3; see [RELEASE_NOTES.md](RELEASE_NOTES.md) for the breaking changes and cleanup steps for an already patched core.

HH is not a `ru_market` source: it is collected only by the browser companion through `local-parser` (see [docs/providers/hh.md](docs/providers/hh.md)). Default sources: `habr-career` and `geekjob`. The plan and decisions are in the [roadmap](docs/roadmap/provider-architecture-review.md); the study behind 0.8.0 is [hh-companion-alternatives](docs/research/hh-companion-alternatives.md).

## Documentation

Start with the [documentation index](docs/README.md). Categories:

- [Providers](docs/providers/README.md): provider matrix and one page per provider (HH, Habr Career, GeekJob, SuperJob, Trudvsem, getmatch, HelloWorld.rs).
- [Architecture](docs/architecture/components.md): components and boundaries; [data flow](docs/architecture/data-flow.md).
- [Research](docs/research/getmatch.md): source studies (getmatch, HelloWorld.rs, Armenia ATS, Yandex Jobs, Poslovi Infostud).
- [Roadmap](docs/roadmap/provider-architecture-review.md): plans and decisions, including [core job filters](docs/roadmap/core-job-filters.md) and [Serbian providers](docs/roadmap/serbia-providers.md).

## Installation

From the `career-ops` directory, install the plugin from the latest release:

```sh
curl -LsSf https://github.com/WindowGenerator/career-ops-plugin-ru-market/releases/latest/download/install.sh | sh
```

To update, repeat the same command: `install.sh` detects by itself whether the plugin is installed. The old update address also works:

```sh
curl -LsSf https://github.com/WindowGenerator/career-ops-plugin-ru-market/releases/latest/download/update.sh | sh
```

CI substitutes the SHA of the release commit into `install.sh` and publishes a copy of it as `update.sh`. Both addresses install or update the plugin and enable it after installation. If the replacement fails, the previous plugin directory, `plugins.lock` and `config/plugins.yml` are restored. The installer never modifies core files; local edits of the companion still block the update. Do not run the installation at the same time as other commands that change plugins.

Add an entry from the [example](examples/portals.yml) to your `portals.yml` and replace the search queries. The source is selected through `ru_market.source`: `all`, `habr-career`, `geekjob`, `superjob`, `trudvsem`, `getmatch` or `helloworld-rs`. New sources are disabled by default; for `source: all` enable `sources.superjob.enabled` or `sources.trudvsem.enabled`. getmatch is enabled separately through `sources.getmatch.enabled: true`; the limitations of the experimental adapter are described in [the getmatch page](docs/providers/getmatch.md). HelloWorld.rs is enabled through `sources.helloworld_rs.enabled: true` and an explicit list of `queries`; see [configuration and limitations](docs/providers/helloworld-rs.md). For SuperJob set `SUPERJOB_API_KEY` in the `.env` of the career-ops application. HH access: [HH page](docs/providers/hh.md).

**SuperJob:** as of 30 September 2026 the developer console handles the OAuth2 flow incorrectly, so we have not yet managed to register an application normally and obtain a Secret key for a live check. For public vacancy search the plugin needs exactly the application's Secret key, not a user OAuth2 token ([API documentation](https://api.superjob.ru/)).

## Verification

```sh
npm test
npm run lint        # Biome: lint and format check (CI runs the same)
npm run check       # Biome: apply safe fixes and formatting
CAREER_OPS_ROOT=../career-ops npm run test:integration
```

`CAREER_OPS_ROOT` must point to a stock, unpatched career-ops checkout; CI pins the upstream commit (see [RELEASING.md](RELEASING.md)).

## Roadmap

- [ ] Add Serbian boards: Poslovi Infostud, HelloWorld.rs and Poslovi.rs ([plan](docs/roadmap/serbia-providers.md); HelloWorld.rs shipped in 0.6.0).
- [ ] Add shared seniority and technology filters to career-ops as a separate stage ([roadmap](docs/roadmap/core-job-filters.md)).

- [x] Add SuperJob and Trudvsem (Work in Russia) through public APIs.
- [x] Verify Trudvsem vacancy search on the live API.
- [x] Release version 0.3.0 with the new sources.
- [ ] Verify SuperJob on the live API with an application key.
- [x] Replace the HH API adapter with a browser companion (0.7.0) ([plan](docs/roadmap/provider-architecture-review.md)).
- [ ] Add availability monitoring for SuperJob and Trudvsem.
- [x] Drop the core patches; the companion works with stock career-ops (0.8.0) ([study](docs/research/hh-companion-alternatives.md)).

HH access terms: [API](https://github.com/hhru/api), [site terms](https://hh.ru/article/33205). The publication procedure and manual SHA-pinned installation are described in [RELEASING.md](RELEASING.md).

The HH browser search is installed separately into career-ops and runs through `provider: local-parser`, using Playwright from career-ops. Configuration and limitations: [companion/README.md](companion/README.md). This is the only HH transport and a separate tool outside the plugin's permissions.

### Connecting HH through the companion manually

The `install.sh` installer puts in the companion (`scripts/ru-market/scan-hh.mjs` and the shared module `scripts/ru-market/lib/untrusted.mjs`) and does not touch core or edit `portals.yml` ([companion/README.md](companion/README.md)). The entry is added manually:

1. Install the plugin and the companion with the command from the "Installation" section. Check the browser from the `career-ops` directory: `node scripts/ru-market/scan-hh.mjs --preflight --channel chrome`.
2. Copy the `HH browser` entry from [examples/hh-browser.yml](examples/hh-browser.yml) into your `portals.yml`. The `hh_browser` block (`queries`, `pages`, `area`, `search_field`, `excluded_text`, `professional_role`, `only_with_salary`, `timeout_ms`) is separate from `ru_market`; the block is re-read on every run, no reinstall is needed. The `parser.args` of the entry point to the entry itself (`--config portals.yml --entry "HH browser" --no-artifacts`).
3. Set `parser.timeout_ms`: by default core aborts the parser after 20 s, which is enough for one page at most. Keep `hh_browser.timeout_ms` (the companion deadline between pages) lower than `parser.timeout_ms` by about 60 s. On a block or a deadline the companion exits with code 0 and returns the vacancies found; the reason is written to stderr and, in batch mode, to `queries-summary.json` and `checkpoint.json`. Core does not receive a status, so a partial run looks like a smaller result in the scan summary.
4. Use `node scan.mjs --dry-run` first; core writes to the pipeline.

**Duplicates between entries.** Core deduplicates by the normalized URL, then by the key "company + role" (taking `company_aliases` into account), including against vacancies already accepted in this run and written to the pipeline and history. Entries are processed **in parallel** (`CONCURRENCY = 10` in `scan.mjs`), so with a duplicate the vacancy of the entry that finished first stays, not of the one first in the file. Browser collection is usually slower, so in one run the `ru-market` entry wins more often. To make sure the HH data stays, run HH as a separate scan earlier (`node scan.mjs --company "HH browser"`, then `node scan.mjs --company "Russian-language job boards"`): the second scan drops the duplicate (verified by an integration test). Alternative links of merged duplicates are lost. Different spellings of a company are unified through `company_aliases` in `portals.yml`, for example `company_aliases: {Яндекс: [Yandex, ООО Яндекс]}`.

Anonymous browser collection of HH remains a separate legal and technical risk: the HH terms require working through the API ([hh.ru/article/33205](https://hh.ru/article/33205)).

### Prompt injection protection

All source text (`title`, `company`, `location`, `note`, `description`, labels) passes through `lib/untrusted.mjs`: invisible Unicode, bidi characters, control characters and HTML comments are removed, the length is limited, and instruction patterns in English and Russian produce `injectionFlags`. Flagged vacancies are not dropped and `injectionFlags` stays on the job as information; core does not read it (there is no trust-score rule). The agent instructions in [skill.md](skill.md) tell the model to treat vacancy text as untrusted data. The detector is heuristic (misses and false positives are possible); it does not protect the full vacancy text that core modes read.

### Reproducible HH browser batches

The separate companion now collects configured queries, merges provenance, checkpoints
progress, and generates an HH-only cache import config. From career-ops:

```sh
node scripts/ru-market/scan-hh.mjs --config portals.yml --entry NAME --artifact-dir data/scan-output/hh-run --scan --dry-run
```

See [the batch workflow and compensation contract](companion/README.md),
[standalone configuration](examples/hh-browser.yml) and
[cache provider example](examples/hh-browser-cache.yml). Browser health is
`node scripts/ru-market/scan-hh.mjs --preflight`; version is `--version`.
Core reads only the `salary` field of the output, and `salary` is the midpoint of a complete RUB monthly range; everything else is only in `compensation`, which core ignores. The extra fields reach core through `local-parser` unchanged (upstream PR #4697). DOM checks against stock career-ops: `npm run test:dom`.
