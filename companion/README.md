# Standalone HH browser tool

`scan-hh.mjs.txt` is the source of a separately installed executable, **not a plugin module**. The suffix keeps the companion source out of the community plugin module audit; it does not confer plugin permission to execute it. Review this source separately before running the release installer.

Release `install.sh` / `update.sh` download this file from the pinned commit into `career-ops/scripts/ru-market/scan-hh.mjs`. It imports the existing career-ops Playwright package, never installs its own dependencies, and runs outside `ctx.fetch` / manifest host restrictions. It uses an anonymous browser and stops on access challenges. Updating refuses unmanaged or locally modified files. Removing the API plugin does not remove this tool.

Requires the extended career-ops `local-parser` for `salary`, `note`, `description`, and `sourceStatuses`. Older versions keep only the basic fields. API ru-market remains a separate provider; automatic API/browser fallback is not implemented.

Add this entry to `portals.yml` manually (installers do not edit user configuration):

```yaml
job_boards:
  - name: HH browser
    provider: local-parser
    careers_url: https://hh.ru/search/vacancy
    parser:
      command: node
      script: scripts/ru-market/scan-hh.mjs
      args: [--query, Senior Python, --pages, '2', --channel, chrome]
      timeout_ms: 150000
      max_buffer_bytes: 2000000
```

Use `--channel chromium` for career-ops's Playwright Chromium instead of installed Chrome. Increase the process timeout when increasing the page limit (up to 60 seconds per page plus startup). JSON goes to stdout; progress goes to stderr. A failure after a successful page returns partial results and diagnostics. A failure on the first page exits nonzero. Only unambiguous monthly salary amounts are structured; original salary text stays in `note`.

Local preview: `node scripts/ru-market/scan-hh.mjs --query 'Senior Python' --pages 2`; scanner preview: `node scan.mjs --dry-run`.

Release installers apply `companion/local-parser.patch` to career-ops after a clean `git apply --check`; already applied patches are detected. Incompatible local core edits stop installation. The patch is shipped as a release asset. Core system updates can replace this local extension; rerun the installer to restore it.
