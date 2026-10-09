# Fixture provenance

Reduced public listing HTML observed 2026-10-09, retaining real field markup:

- `normal.html`: four cards from `https://www.helloworld.rs/oglasi-za-posao?q=Data%20Engineer`; includes the actual Data Engineering Tech Lead listing with Intermediate and Senior labels.
- `last.html`: one card from the same page, wrapped as an exhausted page for pagination tests.
- `salary.html`: first card from `https://www.helloworld.rs/oglasi-za-posao?salary=on`.
- `empty.html`: observed zero-results heading/message from a nonsense keyword query, with one representative newest-job recommendation. The live page supplied 30 unrelated recommendations.
- `broken.html`, `access.html`: synthetic failure pages.

Surrounding navigation, analytics, ratings, ads and irrelevant content are omitted.
Heading/count wrappers for nonempty fixtures are simplified. Test-only mutations
cover missing/unknown labels, malformed links, repeated pagination and ambiguous
multi-city labels; they are not claims about additional observed source formats.
