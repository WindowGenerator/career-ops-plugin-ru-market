# ru-market for career-ops

The plugin collects vacancies from SuperJob, Trudvsem (Work in Russia, API), Habr Career and GeekJob (public HTML listings), and from the optional getmatch and HelloWorld.rs. HH is collected by a separate browser companion (see below).

**Version 0.7.0, breaking change: the HH API adapter is removed.** The HH API answered `403` already on the first page. `hh` in `primary_source_order`, `source: hh` and `sources.hh` are now rejected with a `config` error that points to `local-parser`; the `HH_ACCESS_TOKEN` variable and the `api.hh.ru` host are no longer used. Default sources: `habr-career` and `geekjob`. The migration steps are in [RELEASE_NOTES.md](RELEASE_NOTES.md), the plan and decisions in the [roadmap](docs/roadmap/provider-architecture-review.md).

## Documentation

Start with the [documentation index](docs/README.md). Categories:

- [Providers](docs/providers/README.md): provider matrix and one page per provider (HH, Habr Career, GeekJob, SuperJob, Trudvsem, getmatch, HelloWorld.rs).
- [Architecture](docs/architecture/components.md): components and boundaries; [data flow](docs/architecture/data-flow.md).
- [Research](docs/research/getmatch.md): source studies (getmatch, HelloWorld.rs, Armenia ATS, Yandex Jobs).
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

CI substitutes the SHA of the release commit into `install.sh` and publishes a copy of it as `update.sh`. Both addresses install or update the plugin and enable it after installation. If the replacement fails, the previous plugin directory, `plugins.lock` and `config/plugins.yml` are restored. An already applied core patch and an updated companion remain; local edits of the companion still block the update. Do not run the installation at the same time as other commands that change plugins.

Add an entry from the [example](examples/portals.yml) to your `portals.yml` and replace the search queries. The source is selected through `ru_market.source`: `all`, `habr-career`, `geekjob`, `superjob`, `trudvsem`, `getmatch` or `helloworld-rs`. New sources are disabled by default; for `source: all` enable `sources.superjob.enabled` or `sources.trudvsem.enabled`. getmatch is enabled separately through `sources.getmatch.enabled: true`; the limitations of the experimental adapter are described in [the getmatch page](docs/providers/getmatch.md). HelloWorld.rs is enabled through `sources.helloworld_rs.enabled: true` and an explicit list of `queries`; see [configuration and limitations](docs/providers/helloworld-rs.md). For SuperJob set `SUPERJOB_API_KEY` in the `.env` of the career-ops application. HH access: [HH page](docs/providers/hh.md).

**SuperJob:** as of 30 September 2026 the developer console handles the OAuth2 flow incorrectly, so we have not yet managed to register an application normally and obtain a Secret key for a live check. For public vacancy search the plugin needs exactly the application's Secret key, not a user OAuth2 token ([API documentation](https://api.superjob.ru/)).

## Verification

```sh
npm test
CAREER_OPS_ROOT=../career-ops npm run test:integration
```

## Roadmap

- [ ] Add Serbian boards: Poslovi Infostud, HelloWorld.rs and Poslovi.rs ([plan](docs/roadmap/serbia-providers.md); HelloWorld.rs shipped in 0.6.0).
- [ ] Add shared seniority and technology filters to career-ops as a separate stage ([roadmap](docs/roadmap/core-job-filters.md)).

- [x] Add SuperJob and Trudvsem (Work in Russia) through public APIs.
- [x] Verify Trudvsem vacancy search on the live API.
- [x] Release version 0.3.0 with the new sources.
- [ ] Verify SuperJob on the live API with an application key.
- [x] Replace the HH API adapter with a browser companion (0.7.0) ([plan](docs/roadmap/provider-architecture-review.md)).
- [ ] Add availability monitoring for SuperJob and Trudvsem.

HH access terms: [API](https://github.com/hhru/api), [site terms](https://hh.ru/article/33205). The publication procedure and manual SHA-pinned installation are described in [RELEASING.md](RELEASING.md).

The HH browser search is installed separately into career-ops and runs through `provider: local-parser`, using Playwright from career-ops. Configuration and limitations: [companion/README.md](companion/README.md). This is the only HH transport and a separate tool outside the plugin's permissions.

### Connecting HH through the companion manually

The `install.sh` installer puts in the companion (`scripts/ru-market/scan-hh.mjs` and the shared module `scripts/ru-market/lib/untrusted.mjs`) and the core patch, but does not edit `portals.yml` ([companion/README.md](companion/README.md)). The entry is added manually:

1. Install the plugin and the companion with the command from the "Installation" section. Check the browser from the `career-ops` directory: `node scripts/ru-market/scan-hh.mjs --preflight --channel chrome`.
2. Copy the `HH browser` entry from [examples/hh-browser.yml](examples/hh-browser.yml) into your `portals.yml`. The `hh_browser` block (`queries`, `pages`, `area`, `search_field`, `excluded_text`, `professional_role`, `only_with_salary`, `timeout_ms`) is separate from `ru_market`; `ru_market.sources.hh` is not read. The block is re-read on every run, no reinstall is needed. The `parser.args` of the entry point to the entry itself (`--config portals.yml --entry "HH browser" --no-artifacts`).
3. Set `parser.timeout_ms`: by default core aborts the parser after 20 s, which is enough for one page at most. Keep `hh_browser.timeout_ms` (the companion deadline between pages) lower than `parser.timeout_ms` by about 60 s. On a block or a deadline the companion exits with code 0, returns the vacancies found and `sourceStatuses` with status `partial` or `failed`; the core summary and `--json` receipt show this as a source error of `hh`, and the scan does not fail.
4. Use `node scan.mjs --dry-run` first; core writes to the pipeline.

**Duplicates between entries.** Core deduplicates by the normalized URL, then by the key "company + role" (taking `company_aliases` into account), including against vacancies already accepted in this run and written to the pipeline and history. Entries are processed **in parallel** (`CONCURRENCY = 10` in `scan.mjs`), so with a duplicate the vacancy of the entry that finished first stays, not of the one first in the file. Browser collection is usually slower, so in one run the `ru-market` entry wins more often. To make sure the HH data stays, run HH as a separate scan earlier (`node scan.mjs --company "HH browser"`, then `node scan.mjs --company "Russian-language job boards"`): the second scan drops the duplicate (verified by an integration test). Alternative links of merged duplicates are lost. Different spellings of a company are unified through `company_aliases` in `portals.yml`, for example `company_aliases: {Яндекс: [Yandex, ООО Яндекс]}`.

Anonymous browser collection of HH remains a separate legal and technical risk: the HH terms require working through the API ([hh.ru/article/33205](https://hh.ru/article/33205)).

### Prompt injection protection

All source text (`title`, `company`, `location`, `note`, `description`, labels) passes through `lib/untrusted.mjs`: invisible Unicode, bidi characters, control characters and HTML comments are removed, the length is limited, and instruction patterns in English and Russian produce `injectionFlags`. Flagged vacancies are not dropped; the number of flagged ones goes into `sourceStatuses` (`injection_flagged`). With the core patch and `trust_filter` enabled a vacancy gets one flag `prompt-injection-suspected` and a `trustScore` lower by 30. The detector is heuristic (misses and false positives are possible); it does not protect the full vacancy text that core modes read.

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
The core contract patch preserves monthly/hourly/shift units and gross/net basis,
query diagnostics, listing completeness, `employment`/`professional_role`/`injectionFlags`
passthrough and the `{min,max,currency}` salary shape. DOM and isolated pipeline checks: `npm run test:dom`.
