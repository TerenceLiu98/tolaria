# 0161: Paper metadata sidecar and provenance

## Status

active

## Context

Paper bundles need reliable bibliographic metadata before AI, memory, search ranking, and citation-oriented workflows can be built on top of them. Some fields are user-facing and should be visible on the Paper note, while provider provenance, candidates, confidence, and resolver errors are machine-oriented and should not clutter normal Markdown reading.

## Decision

Paper bundles store canonical metadata in `papers/<paper-slug>/metadata.json`.

`metadata.json` owns:

- canonical metadata values
- provider sources and identifiers
- candidate matches that need review
- confidence values
- resolver errors
- update timestamps

`paper.md` frontmatter mirrors only clean user-facing fields:

- `title`
- `authors`
- `year`
- `venue`
- `venue_short`
- `venue_type`
- `publication_date`
- `publication_stage`
- `doi`
- `arxiv_id`
- `metadata_status`
- `metadata_confidence`

Local extraction runs from `source.pdf` document metadata and parsed `paper.md`/parser text. DOI and arXiv exact matches can become high-confidence metadata. Fuzzy title/author matches remain candidates unless confidence is high or the user explicitly applies the candidate. Provider failures are recorded as recoverable errors and do not block Paper reading.

## Consequences

- Paper metadata can be refreshed without mutating `source.pdf`.
- Ambiguous provider results can be reviewed before frontmatter is overwritten.
- `paper.md` stays readable and editable as a normal Tolaria note.
- Future AI/memory flows can use `metadata.json` provenance instead of trusting display frontmatter alone.
