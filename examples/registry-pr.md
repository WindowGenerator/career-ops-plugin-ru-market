# Add ru-market provider

Adds one explicit-only career-ops provider for HH, Habr Career and GeekJob.
Aggregate mode keeps alternative posting URLs in notes before core deduplication.
Uses the existing provider API and Job contract; no changes to career-ops core.

- Required environment variables: none.
- Egress: api.hh.ru, career.habr.com, geekjob.ru via ctx.fetch helpers.
- HH uses only its public API. HTML boards use public listing pages only.
- No employer-site requests, OAuth, cookies, browser automation or applications.
- Independent host queues, bounded transient retries, structural empty/error
  distinction and partial-pagination warnings.
- Synthetic offline fixtures, guarded-context scanner integration, static plugin
  audit, and separate scheduled live health with status-only artifacts.

Live verification on 2026-09-27: Habr and GeekJob reachable; HH returned HTTP 403.
Current core does not expose Retry-After headers on errors. These limitations
and the platform-policy review are documented in README.

Before opening: generate registry JSON for the published exact SHA, link the
real registration issue, and include the relevant CI run links. Follow the
current upstream PR template.
