---
type: ADR
id: "0166"
title: "Use an editor adapter boundary before choosing a replacement editor"
status: active
date: 2026-07-07
supersedes:
  - "0022"
---

# ADR 0166: Use an editor adapter boundary before choosing a replacement editor

## Context

Sapientia inherited Tolaria's BlockNote-based rich editor. Recent Paper, AI selected context, image, citation, and comment work showed that the problem is not only which editor package is mounted. The larger problem is that application features can become coupled to a specific editor runtime.

We explored a direct Novel/Tiptap migration, but that path introduced significant dependency and parity risk before proving clear product value. Novel remains a useful candidate because it is based on Tiptap/ProseMirror, but it should not be treated as the goal by itself.

The product goal is still:

- Markdown files remain the source of truth.
- Paper and ordinary notes share the same editing surface.
- Wikilinks, comments, citations, images, raw mode, table of contents, and AI selected context remain stable.
- The app can eventually replace BlockNote if the replacement proves better.

## Decision

Sapientia will keep the existing BlockNote editor mounted for now and introduce an internal `EditorAdapter` boundary at the Note surface.

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

`NoteSurface` is the product boundary for note editing. It may render BlockNote today and a different editor later, but callers should move toward the adapter instead of reaching into editor-package internals.

## Current Implementation

The current implementation keeps BlockNote as the runtime editor and exposes a thin adapter around existing BlockNote methods. This preserves current user behavior while creating a migration seam.

The direct Novel prototype is not part of the current product path and should not continue accumulating feature work.

## Consequences

### Positive

- Avoids a large editor rewrite before parity is proven.
- Keeps current BlockNote behavior available.
- Gives Paper, AI, comments, citations, and attachment work a stable application-level seam.
- Makes a future Novel/Tiptap migration incremental instead of all-or-nothing.

### Negative

- BlockNote-specific code still exists below the adapter.
- Some adapter methods are initially thin wrappers and do not yet cover every editor behavior.
- Future work is needed to move callers from direct BlockNote APIs to the adapter.

## Migration Guidance

Near-term editor work should:

1. Keep BlockNote mounted as the default editor.
2. Route new product code through `NoteSurface` and `EditorAdapter` where possible.
3. Avoid adding new direct BlockNote dependencies outside existing editor internals.
4. Treat Novel/Tiptap as a candidate replacement only after adapter parity is proven.
5. If a future replacement is attempted, implement it behind the same adapter first.

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
