# Release procedure

1. Update `manifest.json`, `package.json` and `lib/http.mjs` User-Agent version
   together. Record parser/access changes and current health in RELEASE_NOTES.md.
2. Run `npm test`, `npm run test:integration`, and
   `node ../career-ops/plugin-audit.mjs .`. Run plugin health separately; distinguish
   parser failures from access restrictions. Review linked platform policies.
3. Commit the reviewed tree. Push the commit and matching `v<version>` tag to
   `WindowGenerator/career-ops-plugin-ru-market`. The release workflow verifies the
   tag/version, runs offline tests and publishes a GitHub release with the exact
   release commit SHA in its notes, pinned registry entry, and `install.sh` /
   `update.sh` assets. CI injects the SHA into the maintained `install.sh`, then
   copies it to `update.sh` for compatibility with existing release URLs. The release
   also attaches `untrusted.mjs` (the companion's shared module, installed to
   `scripts/ru-market/lib/`) next to `scan-hh.mjs`. The SHA
   is injected during publishing because a tracked file cannot contain its own commit SHA.
   Offline/integration CI and scheduled health are separate jobs.
4. Run the published `install.sh` from the career-ops directory, or install the
   exact SHA manually:

   ```sh
   node plugins.mjs add WindowGenerator/career-ops-plugin-ru-market --sha <40-hex-commit> --confirm
   ```

5. Prepare registry metadata for that exact commit:

   ```sh
   node scripts/registry-entry.mjs <40-hex-commit> > /tmp/ru-market.json
   ```

6. Follow the upstream career-ops Plugin registration issue process. In a separate
   fork/branch, add the generated file as `plugins-registry/ru-market.json` and
   include `registrationIssue` pointing to the real issue. Use the upstream
   `plugin-registry.md` PR template. Do not invent an issue number or pin a tag
   name as a SHA. An initial PR description is in `examples/registry-pr.md`.
7. For an update, rerun the new release's `install.sh` from the career-ops directory.
   It detects the installed plugin and replaces it with the new SHA using `--confirm`.
   The `update.sh` release asset is an identical copy and accepts fresh installs too.
   Failed replacements restore the plugin directory, lock and plugin configuration;
   companion updates remain. The installer never modifies core. Do not run other plugin
   management commands concurrently with the installer.
   Search parameters remain in `portals.yml`, outside this repository.

The release workflow does not open upstream issues/PRs or send messages.
Approval is granted by upstream maintainers after reviewing the pinned code.

The release installers also fetch `companion/scan-hh.mjs.txt` from the same pinned commit and install it as a standalone career-ops script. Review this executable separately from the plugin audit. Test its browser lifecycle in career-ops with `node --test tests/providers/hh-browser.test.mjs`. The `.txt` source is not a plugin module.

Since 0.8.0 there are no core patches: release installers do not touch career-ops core, and no patch is shipped as a release asset. CI runs the integration and browser tests against stock upstream career-ops pinned in `.github/workflows/test.yml` to one commit that contains upstream PR #4697 (`local-parser` passes extra job fields through); `health.yml` tracks upstream HEAD. When bumping the pin, check that the commit exists in `career-ops-hq/career-ops` and descends from the PR merge commit.
