---
type: ADR
id: "0169"
title: "Use upstream Tolaria as a reference, not a merge source"
status: active
date: 2026-07-08
---

# ADR 0169: Use Upstream Tolaria as a Reference, Not a Merge Source

## Context

Sapientia is based on Tolaria, but the product architecture has diverged materially:

- Paper is a first-class editable research note with source provenance.
- Paper sidecars, metadata, comments, catalog, and paper-aware AI tools are Sapientia-specific.
- Localization now follows ADR 0168: manual JSON catalogs, not Lara service synchronization.
- Branding, product language, and release artifacts are moving from Tolaria to Sapientia.
- The editor direction now keeps BlockNote behind Sapientia-owned seams and extends it through ADR 0166 and ADR 0167.

The upstream `refactoringhq/tolaria` repository continues to ship useful fixes and features. Recent upstream work includes editor serialization hardening, wikilink fixes, AI-agent additions, Git provider changes, HTML blocks, image import guards, localization changes, and test-harness improvements.

Directly merging upstream `main` would import changes that conflict with Sapientia decisions, including Lara files, Tolaria-facing product copy, older editor assumptions, and implementation details that no longer match Sapientia's Paper-as-Note architecture.

## Decision

Sapientia will treat upstream Tolaria as a reference implementation, not as a branch to merge directly.

When upstream contains valuable behavior, Sapientia will reimplement that behavior against the current Sapientia architecture. We may inspect upstream commits, tests, and docs to understand intent, but final changes must be authored in Sapientia's modules, naming, localization model, product language, and tests.

No direct merge of `refactoringhq/tolaria:main` into Sapientia `main` should be used for routine upstream adoption.

## Adoption Policy

Upstream changes should be triaged by capability, not by commit hash.

For each capability:

1. Identify the user-visible or architecture-visible behavior.
2. Decide whether the behavior fits current Sapientia ADRs.
3. Implement the behavior in Sapientia-owned modules.
4. Add Sapientia-specific tests.
5. Preserve Sapientia localization, branding, Paper, AI, and editor contracts.
6. Do not reintroduce dependencies or files that active Sapientia ADRs deprecated.

Cherry-picking or copying upstream code is only acceptable for small isolated fixes where the owning module and surrounding contracts are still materially identical. Even then, the result must be reviewed as Sapientia code and adjusted for current ADRs.

## Priority Order

### First Priority: Editor and Markdown Stability

Adopt upstream-inspired behavior that reduces editor data loss, reload failures, or Markdown corruption:

- BlockNote update-depth recovery
- empty fragment or editor-index recovery
- conservative Markdown delimiter parsing
- code block literal Markdown preservation
- prose parentheses preservation without unnecessary escaping
- path wikilink underscore preservation
- raw editor flush and cache refresh correctness
- editor undo and focus preservation

These changes should integrate with ADR 0166 and ADR 0167 rather than restoring older toolbar or editor structures.

### Second Priority: Wikilinks and Research Navigation

Adopt upstream-inspired behavior that improves link insertion, path targets, and cross-workspace references:

- `@` autocomplete inserting wikilinks correctly
- path target encoding that preserves underscores and formatting-sensitive characters
- cross-workspace link test coverage where mounted workspace behavior is already supported

These changes directly support Sapientia's Paper, research note, backlink, and `@block[...]` workflows.

### Third Priority: Media and Export Robustness

Adopt small, bounded robustness improvements:

- unsupported HEIC/HEIF import fallback
- uploaded image asset URL guards
- note PDF export fallback behavior

These should preserve Sapientia's Paper asset handling and source provenance rules.

### Fourth Priority: AI and Git Workflow Enhancements

Adopt larger workflow improvements only as separate scoped work:

- Git upstream branch sync semantics
- generated commit messages from diff
- WSL Git provider selection
- additional CLI AI agents such as Copilot

These areas touch Rust command boundaries, settings, status UI, tests, and product copy, so they should not be bundled into editor or Paper integration work.

### Deferred: Sandboxed HTML Blocks and Vault Expressions

Sandboxed HTML blocks and vault expressions are substantial editor-model features. They should not be imported incidentally during upstream adoption.

If Sapientia wants this capability, it needs its own ADR covering:

- durable Markdown syntax
- sandbox and CSP model
- vault expression scope
- raw-editor edit path
- interaction with Paper and AI context
- security and test expectations

### Rejected: Lara Service Reintroduction

Upstream localization changes that depend on Lara must not be adopted as-is.

ADR 0168 remains controlling:

- keep manual JSON catalog maintenance
- do not restore `@translated/lara-cli`
- do not restore `lara.yaml`
- do not restore `lara.lock`
- do not restore `pnpm l10n:translate` or `pnpm l10n:translate:force`

New upstream locale catalogs may be manually imported if they are converted to Sapientia's checked-in JSON catalog workflow and pass `pnpm l10n:validate`.

## Integration Workflow

For a batch of upstream-inspired work:

1. Create an integration branch or local checkpoint.
2. Record the upstream commits used as references in the implementation notes or commit message.
3. Implement one capability group at a time.
4. Prefer small commits with focused tests.
5. Run the relevant unit tests first, then full release gates before push.
6. Keep Paper and AI behavior from Sapientia `main` as the source of truth.

Avoid broad "sync with upstream" commits. They hide architecture choices and make regressions harder to review.

## Consequences

### Positive

- Sapientia can benefit from upstream fixes without undoing Sapientia architecture.
- Paper-as-Note, manual localization, and Sapientia branding remain protected.
- Upstream adoption becomes reviewable by behavior rather than by large merge conflicts.
- Tests can be written around Sapientia contracts instead of upstream assumptions.

### Negative

- Useful upstream features take longer to absorb.
- Some fixes may need to be re-derived rather than applied directly.
- The team must maintain an explicit upstream triage habit.

### Neutral

- Git history will not show upstream merge commits for routine adoption.
- Upstream commits can still be referenced in local notes, ADRs, or commit messages.
- Emergency security fixes may still justify a direct patch if the affected code has not diverged.

## Test Expectations

Upstream-inspired changes should include tests that assert Sapientia behavior, not merely upstream behavior.

For the first editor-stability batch, tests should cover:

- Markdown delimiter preservation
- literal code block serialization
- wikilink path encoding and underscore preservation
- raw/rich round-trip stability
- editor reload recovery for malformed or empty fragments

For localization adoption, `pnpm l10n:validate` must pass and no Lara files or commands may be restored.
