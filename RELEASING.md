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
   `update.sh` assets. The SHA is injected during publishing because a tracked
   file cannot contain its own commit SHA.
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
7. For an update, run the new release's `update.sh` from the career-ops directory.
   It removes the installed plugin and installs the new SHA with `--confirm`.
   Search parameters remain in `portals.yml`, outside this repository.

The release workflow does not open upstream issues/PRs or send messages.
Approval is granted by upstream maintainers after reviewing the pinned code.

The release installers also fetch `companion/scan-hh.mjs.txt` from the same pinned commit and install it as a standalone career-ops script. Review this executable separately from the plugin audit. Test its browser lifecycle in career-ops with `node --test tests/providers/hh-browser.test.mjs`. The `.txt` source is not a plugin module.

Release installers apply `companion/local-parser.patch` to career-ops after a clean `git apply --check`; already applied patches are detected. Incompatible local core edits stop installation. The patch is shipped as a release asset. Core system updates can replace this local extension; rerun the installer to restore it.
