---
type: ADR
id: "0166"
title: "Keep BlockNote behind a Sapientia editor adapter boundary"
status: active
date: 2026-07-07
---

# ADR 0166: Keep BlockNote behind a Sapientia editor adapter boundary

## Context

Sapientia inherited Tolaria's BlockNote-based rich editor. ADR 0022 remains the current decision for the runtime rich editor. Recent Paper, AI selected context, image, citation, and comment work showed that the problem is not only which editor package is mounted. The larger problem is that application features can become coupled to a specific editor runtime.

We explored a direct Novel/Tiptap migration, but that path introduced significant dependency and parity risk before proving clear product value. That prototype is stopped. Novel/Tiptap may be revisited later, but it is not the current migration plan.

The product constraints are:

- Markdown files remain the source of truth.
- Paper and ordinary notes share the same editing surface.
- Wikilinks, comments, citations, images, raw mode, table of contents, and AI selected context remain stable.
- Editor package details should not leak into Paper, AI, catalog, comment, or citation product code.

## Decision

Sapientia will keep the existing BlockNote editor mounted and introduce an internal `EditorAdapter` boundary at the Note surface.

This ADR amends ADR 0022; it does not supersede it. BlockNote remains the active editor implementation until a future ADR replaces it.

The adapter represents Sapientia-owned editor capabilities:

```text
focus()
getMarkdown()
replaceDocument(markdown)
loadMarkdown(path, markdown)
insertMarkdown(markdown)
insertPlainText(text)
insertWikilink(target)
getSelectionContext()
getSelectedAttachmentContext()
setEditable(editable)
```

`NoteSurface` is the product boundary for note editing. It renders BlockNote today. Callers should move toward the adapter instead of reaching into editor-package internals.

## Current Implementation

The current implementation keeps BlockNote as the runtime editor and exposes a thin adapter around existing BlockNote methods. This preserves current user behavior while creating a migration seam.

The direct Novel/Tiptap prototype is not part of the current product path and should not continue accumulating feature work.

## BlockNote-Native Product Extensions

Sapientia should use BlockNote's extension surfaces before adding parallel editor UI. This includes:

- custom inline content for wikilinks, inline math, citations, and future durable inline anchors
- custom blocks for display math, Mermaid, tldraw, media, and Paper-derived source artifacts
- style specs for Markdown-durable inline formatting such as highlight
- formatting toolbar and side-menu extension points for contextual actions
- BlockNote selection, cursor, and block id APIs for AI selected context, attachment context, and block-level commands

The goal is not to expose BlockNote as the product boundary. The goal is to make Sapientia-owned features feel native inside the current editor while keeping the adapter boundary stable.

### Comments

Sapientia should not adopt BlockNote collaboration comments as the source of truth in this phase. BlockNote's native comments model is collaboration/thread-store oriented, while Sapientia comments are local-first sidecars.

Paper comments should continue to persist through the `CommentProvider` boundary backed by `annotations.jsonl` and future `comments.jsonl`. The UI should move closer to BlockNote's block interaction model:

- resolve comment anchors from BlockNote/Paper block ids
- show compact block-adjacent markers or side-menu affordances instead of a separate reader-style comment column
- open comment threads as local popovers/panels
- keep create, edit, delete, and citation actions provider-backed
- avoid writing comments into `paper.md`

Future generic Note comments need a separate durable note-block anchor decision. That decision is outside this ADR.

### Math and LaTeX

Inline LaTeX should use BlockNote custom inline content, not DOM post-processing. Display LaTeX should use a custom block. The desired behavior is:

- `$...$` round-trips as inline math
- `$$...$$` round-trips as display math
- toolbar actions can insert inline or display math at the current selection
- inline math can be edited through a lightweight popover
- display math can be edited through its block editor
- parser sentinels or provider artifacts are normalized before reaching the user-facing editor

Math rendering remains Markdown-durable: saved Markdown should contain ordinary `$...$` and `$$...$$` forms where possible.

## Consequences

### Positive

- Avoids a large editor rewrite before parity is proven.
- Keeps current BlockNote behavior available.
- Gives Paper, AI, comments, citations, and attachment work a stable application-level seam.
- Preserves optionality for a future editor replacement without making replacement the current goal.

### Negative

- BlockNote-specific code still exists below the adapter.
- Some adapter methods are initially thin wrappers and do not yet cover every editor behavior.
- Future work is needed to move callers from direct BlockNote APIs to the adapter.

## Migration Guidance

Near-term editor work should:

1. Keep BlockNote mounted as the default editor.
2. Route new product code through `NoteSurface` and `EditorAdapter` where possible.
3. Avoid adding new direct BlockNote dependencies outside existing editor internals.
4. Do not continue the stopped Novel/Tiptap prototype.
5. Treat any future editor replacement as a separate ADR and implement it behind the same adapter first.
6. Prefer BlockNote schema, toolbar, selection, and side-menu extension points over external DOM overlays.
7. Expand `EditorAdapter` with Sapientia-owned capabilities as product needs become clear, such as selected text context, selected attachment context, selected blocks, math insertion, and comment-thread opening.

## Non-Decisions

This ADR does not decide:

- whether Novel will be adopted later
- whether Tiptap will be adopted directly
- whether BlockNote will be removed
- how generic note comments will be implemented
- how all existing BlockNote-specific hooks will be migrated

## Test Expectations

Tests should cover:

- `NoteSurface` still mounts the existing editor path.
- `NoteSurface` exposes the adapter handle.
- Adapter methods delegate to the current editor without changing user behavior.
- Existing note rendering, saving, selection, and Paper behavior continue to pass.
