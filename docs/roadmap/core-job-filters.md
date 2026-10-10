# Shared seniority and technology filters in career-ops

Status: Planned
Date: 2026-10-10
Type: roadmap

Planned separately from the first release of the HelloWorld.rs adapter. Decisions were agreed on 2026-10-09; core filters are not implemented. In 0.7.0 the plugin and the combined patch already pass `employment` and `professional_role` through local-parser (checked by the test `test/core-patch.mjs`); settings for allowed and excluded values in core remain undone.

## Problem

Providers pass the explicitly stated seniority and technologies of a vacancy in shared optional Job fields. Career-ops applies user selection rules to these fields. This is a core extension for all compatible sources, not special filtering inside HelloWorld.

The current `skip_tiers` and `title_filter` read the title, and `content_filter` reads the description. They do not use separate seniority and technology labels. Confirmation and limitations of the existing consumers: [HelloWorld.rs research](../research/helloworld.md). Context of the adapter review that added the `employment` and `professional_role` fields: [provider-architecture-review.md](provider-architecture-review.md).

## Decisions

- A missing seniority or technologies does not exclude a vacancy: the corresponding new filter lets it through as a record with unknown data. Known fields are still checked, and other filters keep working.
- Further suitability assessment remains a task of the rank pipeline. The verified core `rank-pipeline.mjs` (sibling checkout, outside this repository) adds scores and explanations but does not remove or filter rows. Subsequent selection is a separate step; missing metadata does not guarantee rejection at rank.
- The first release of the HelloWorld.rs adapter does not depend on this stage being ready. Before it is implemented the shared fields may be passed, but support for filtering them is not claimed.
- Existing behaviour of filters and providers is preserved when the new settings are absent.
- An explicit source seniority uses the scale `intern / entry / mid / senior`, keeping source labels. For HelloWorld `Junior -> entry`, `Intermediate -> mid`, `Senior -> senior` are agreed. A missing or unrecognized seniority stays unknown; this differs from the current fallback of the title classifier to `mid`.
- All explicitly stated seniority levels and technologies are passed as lists. The proposed shape of the fields `seniority.levels`, `seniority.rawLabels`, `skills` is in the [HelloWorld plan](helloworld-provider.md); rules for filtering several values belong to this stage.
- Optional Job fields `employment` and `professional_role` are added (decision of the adapter review, section c). The plugin passes them immediately as additional fields, like `dataLevel` and `eligibility`; core starts using them only after this stage is implemented. The shape is like seniority and technologies: lists of strings keeping source labels, for example `employment: { values: [], rawLabels: [] }` and `professional_role: { values: [], rawLabels: [] }`. The exact shape is refined at the implementation stage and recorded in `_types.js`.
- The filtering contract of the new fields matches the rules above: an unknown value does not exclude a vacancy, a known one is checked independently of other fields, old configurations do not change. For `employment` and `professional_role` core receives allowed and excluded values; comparison uses normalized values, source labels stay for displaying reasons.
- The `experience`, `employment` and salary filters for HH are applied in core after selection over Job fields, not as server-side parameters; server-side HH parameters (`search_field`, `excluded_text`, `professional_role`, `only_with_salary`) are limited to the browser companion. Basis: a core convention, there are no server-side filters in core providers.
- All these fields pass through local-parser in one combined core patch together with injection flags and the fix of the `salary` shape; the patch is applied locally by the installer, and core updates may require reinstalling it (decision g in [provider-architecture-review.md](provider-architecture-review.md)).
- The local-parser route passes only the keys listed in it (`../career-ops/providers/local-parser.mjs:216-223`): for new fields the list has to be extended, otherwise they are dropped (as `skills` and `seniority` are now).

## Scope

- [ ] Support in core the optional seniority and technology lists from the [adapter plan](helloworld-provider.md), the agreed scale, source labels and the policy for missing data.
- [ ] Define the priority of an explicit source seniority relative to classification by title; do not mix an observed label with a heuristic.
- [ ] Add filtering settings to core: allowed/excluded seniority levels and technologies. Agree the matching rules for several values and the combination with existing filters.
- [ ] Check passing the shared fields through the direct plugin provider and the supported local-parser; document the contract and supported versions. Partially done: `employment`, `professional_role` pass through local-parser with the patch (0.7.0); `skills`, `seniority` do not yet.
- [ ] Show exclusion reasons and distinguish missing data from a mismatch of known values.
- [ ] Check compatibility of existing settings, absent/partial fields, several levels, technology matches and exclusions, conflict between the source label and the title.
- [ ] Check the end-to-end scenario HelloWorld -> Job -> core filters and add a configuration example.
- [ ] Describe `employment` and `professional_role` in `_types.js`, extend the local-parser key list and add to core the settings of allowed and excluded values with exclusion reasons. Done in the patch: `_types.js` and the local-parser key list; not done: filtering settings and exclusion reasons.

## Acceptance criteria

1. One core setting works with the same structured data from different providers.
2. A vacancy without seniority/technologies is not excluded merely because they are absent.
3. An unknown field does not cancel the check of another, known field.
4. Old configurations keep their previous behaviour.
5. Documentation distinguishes the availability of metadata from the readiness of filtering.
6. The `employment` and `professional_role` fields pass from the provider and through local-parser to core filters; a vacancy without these fields is not excluded.

## Open decisions

Open decisions of the separate core stage: settings schema, priority of the source seniority, rules for filtering several values and matching technologies. Representing seniority and technologies as lists is already agreed. Additionally open: the exact shape of `employment` and `professional_role` and the set of values the HH companion can extract from the listing.
