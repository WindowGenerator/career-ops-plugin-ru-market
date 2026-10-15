# ru-market for career-ops

Collect vacancies from Habr Career, GeekJob, SuperJob, Trudvsem, getmatch, and HelloWorld.rs. Habr Career and GeekJob are enabled by default. HH uses a separate browser companion included by the installer.

Version 0.8.0 works with stock career-ops containing upstream PR #4697 and does not patch core. If you used an earlier version with core patches, follow the cleanup steps in [RELEASE_NOTES.md](RELEASE_NOTES.md).

## Install and configure

Run this from your `career-ops` directory. Use the same command to update:

```sh
curl -LsSf https://github.com/WindowGenerator/career-ops-plugin-ru-market/releases/latest/download/install.sh | sh
```

The installer enables the plugin and installs the HH companion. It leaves `portals.yml` for you to configure and restores the previous installation if replacement fails. Local companion edits block updates. Avoid running other plugin changes during installation.

Copy an entry from [examples/portals.yml](examples/portals.yml) into your `portals.yml` and edit the queries. Choose a source with `ru_market.source`, or use `all` for enabled sources.

Optional sources need configuration:

- SuperJob and Trudvsem: enable `sources.superjob.enabled` or `sources.trudvsem.enabled` when using `all`. SuperJob also needs the application's Secret key in `SUPERJOB_API_KEY`, set in career-ops's `.env`. Live SuperJob verification is still pending.
- getmatch: set `sources.getmatch.enabled: true`. The adapter is experimental.
- HelloWorld.rs: set `sources.helloworld_rs.enabled: true` and provide explicit `queries`.

See the [provider guides](docs/providers/README.md) for access requirements and limitations.

## HH browser companion

Copy the entry from [examples/hh-browser.yml](examples/hh-browser.yml) into `portals.yml`, then check the browser from your `career-ops` directory:

```sh
node scripts/ru-market/scan-hh.mjs --preflight --channel chrome
node scan.mjs --dry-run
```

HH runs through `local-parser`. Set `parser.timeout_ms` above the default 20 seconds for longer scans, keeping `hh_browser.timeout_ms` about 60 seconds lower. Partial runs return the jobs collected so far; check stderr for failures.

The [companion guide](companion/README.md) covers configuration, batches, cache imports, and salary handling. Read the [HH access limitations](docs/providers/hh.md) before use: HH's terms require programmatic access through its API.

## Development

```sh
npm test
npm run lint        # Biome: lint and format check (CI runs the same)
npm run check       # Biome: apply safe fixes and formatting
CAREER_OPS_ROOT=../career-ops npm run test:integration
```

Integration tests require a stock, unpatched career-ops checkout.

See the [documentation index](docs/README.md) for architecture, research, and roadmap, or [RELEASING.md](RELEASING.md) for release instructions and SHA-pinned installation.
