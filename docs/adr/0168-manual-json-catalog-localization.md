---
type: ADR
id: "0168"
title: "Manual JSON catalog localization"
status: active
date: 2026-07-07
supersedes: "0087"
---

# ADR 0168: Manual JSON Catalog Localization

## Context

Sapientia uses an app-owned localization runtime in `src/lib/i18n.ts` and flat JSON catalogs in `src/lib/locales/*.json`.

ADR 0087 added Lara CLI synchronization around those JSON catalogs. That external service dependency is no longer desirable:

- local development should not require Lara credentials
- UI-copy changes should be reviewable as ordinary source diffs
- placeholder and product-name correctness should be explicit in the repository
- release gates should not depend on a remote translation service

## Decision

Sapientia will keep JSON locale catalogs and deprecate Lara CLI/service-based synchronization.

The active localization workflow is:

1. Add or update the English source string in `src/lib/locales/en.json`.
2. Manually update every checked-in target catalog in `src/lib/locales/*.json`.
3. Run `pnpm l10n:validate`.

`pnpm l10n:validate` is the localization gate. It verifies that checked-in catalogs share the English keyset and remain flat string catalogs.

The repository should not depend on `@translated/lara-cli`, `lara.yaml`, `lara.lock`, `pnpm l10n:translate`, or `pnpm l10n:translate:force`.

## Consequences

### Positive

- Localization works without external credentials.
- Pull requests show every translation change directly.
- Placeholder validation remains local and deterministic.
- The app stays local-first in its development workflow.

### Negative

- Manual translation effort increases.
- Translation quality depends on reviewer discipline.
- Large copy changes require more careful batching.

### Neutral

- `src/lib/i18n.ts` remains the runtime abstraction.
- `en.json` remains the canonical source catalog.
- English fallback behavior remains unchanged.
- Existing locale files remain one file per locale.

## Migration

- Remove Lara CLI package dependency.
- Remove Lara package scripts.
- Remove `lara.yaml` and `lara.lock`.
- Update contributor and architecture docs to describe manual catalog maintenance.
- Keep `pnpm l10n:validate`.

## Test Expectations

- `pnpm l10n:validate` passes after copy changes.
- TypeScript callers continue using `translate()` / `createTranslator()`.
- New UI copy does not ship with missing locale keys.
