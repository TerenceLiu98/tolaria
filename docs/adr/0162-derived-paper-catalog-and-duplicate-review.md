# ADR 0162: Derived Paper Catalog and Duplicate Review

## Status

Accepted

## Context

Paper metadata now lives in `paper.md` frontmatter and `papers/<paper-slug>/metadata.json`. Tolaria needs a research-library surface for browsing, searching, and duplicate review, but the app should keep Markdown files and sidecars as the source of truth.

## Decision

The Paper catalog is a derived model rebuilt from vault scan results plus Paper sidecars. It is not a new database. Catalog commands may scan the active vault and return `PaperCatalogEntry[]`, and frontend Paper views may derive the same model from loaded `VaultEntry[]`.

Duplicate detection surfaces candidates only. Tolaria never auto-merges Paper bundles. User review decisions such as "not duplicate" are persisted as small vault-local review state in `papers/catalog-decisions.json`; those decisions suppress candidate warnings but do not rewrite Paper metadata or delete Paper bundles.

## Consequences

- The catalog can be rebuilt after app restart from ordinary vault files.
- Metadata search and duplicate detection remain inspectable and testable pure functions.
- Future richer catalog caches must stay invalidatable and derived.
- Duplicate/preprint/published-version linking can be added later without destructive merge behavior.
