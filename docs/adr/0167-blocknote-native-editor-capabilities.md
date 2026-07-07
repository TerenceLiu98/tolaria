---
type: ADR
id: "0167"
title: "Use BlockNote-native editor capabilities before parallel UI"
status: active
date: 2026-07-07
---

# ADR 0167: Use BlockNote-native editor capabilities before parallel UI

## Context

ADR 0166 keeps BlockNote as Sapientia's active rich editor while putting editor-specific implementation behind a Sapientia-owned adapter boundary. That decision avoids a premature editor replacement, but it also creates a follow-up obligation: Sapientia should use BlockNote's extension surfaces well instead of rebuilding editor-adjacent features as separate reader panels, fixed gutters, or DOM overlays.

Recent Paper, comment, math, media, table, and AI work shows several places where Sapientia has working behavior but not yet the most native BlockNote interaction model.

BlockNote documentation exposes extension points and UI components for custom schemas, formatting toolbar, side menu, suggestion menus, link toolbar, file panel, table/floating UI, comments, collaboration, and AI. Sapientia should borrow the extension and interaction patterns that fit the local-first product model, while keeping file-backed storage and avoiding real-time collaboration dependencies unless a future ADR chooses them.

## Decision

Sapientia will prefer BlockNote-native editor extension points and interaction surfaces for future editor polish before adding parallel editor UI.

This decision complements ADR 0166. ADR 0166 defines the editor adapter boundary; this ADR defines the near-term BlockNote-native capability roadmap under that boundary.

## Capability Roadmap

### 1. Block-Adjacent Comment UX

Current Paper comments use `NoteSurface` overlay positioning based on DOM/block ids. This works, but it is still a separate overlay layer that guesses placement from rendered blocks.

Future comment UI should move closer to BlockNote's block interaction model:

- use Side Menu, current block, selected block, or block-adjacent affordances for comment markers
- show compact comment counts near the relevant block
- open the comment thread from that marker
- keep comment creation, editing, deletion, and citation actions provider-backed

Storage must continue to use Sapientia's `CommentProvider` boundary. Paper comments remain backed by `annotations.jsonl` and future `comments.jsonl`. Ordinary Note comments need a later durable note-block anchor decision.

Sapientia should not switch comment storage directly to BlockNote's CommentsExtension in this phase. BlockNote comments are built around a thread store, user resolution, and real-time collaboration assumptions, while Sapientia's source of truth is local files.

### 2. Comment Experience Parity

Current Sapientia comments support create, edit, delete, and citation actions. They do not yet provide several higher-level comment-thread experiences visible in BlockNote's comments model:

- resolved/open state
- replies and thread activity
- reactions or emoji
- comment sidebar filtering and sorting
- selected-text comment composer

Sapientia may borrow these UX ideas, but should not adopt BlockNote's collaborative comments storage as the source of truth without a separate ADR.

### 3. Inline AI Editing

Sapientia already has an AI panel, selected context, Paper tools, and MCP/tool guidance. It does not yet provide BlockNote-style inline AI editing where the model proposes edits inside the editor and the user can accept, reject, or revise them in place.

Future AI editor work should add an inline suggestion seam:

- selected text or selected blocks can be sent to AI
- AI can propose an insert, replace, rewrite, or summarize operation
- output appears as an editor-local suggestion
- user can accept, reject, or modify before writing to the note
- AI operations should remain transparent and citation-aware when Paper evidence is involved

This should extend the existing AI architecture rather than replace it with a standalone editor-only AI product.

### 4. File Panel And Media Blocks

Sapientia supports media previews, Paper assets, image selection context, and file/path actions. Media interactions remain more custom than native BlockNote media UX.

Future media work should study and reuse BlockNote File Panel patterns where they fit:

- replace file/image action
- caption editing where durable in Markdown
- media metadata actions
- consistent selected media controls
- Paper/MinerU image asset operations

Sapientia should continue to keep Markdown and vault files as source of truth.

### 5. Table Handles And Table Editing

Sapientia can render and edit tables, but Paper/MinerU table import, captions, table-as-image fallbacks, and table editing polish are not yet systematically aligned with BlockNote's table and floating UI patterns.

Future table work should audit:

- table handles and resizing behavior
- keyboard navigation
- copy/paste fidelity
- Markdown round-trip for imported tables
- Paper captions and source provenance
- table-image fallback behavior for parser outputs

### 6. Built-In Block Coverage

BlockNote's built-in block model includes paragraph, heading, toggle heading, quote, bullet list, numbered list, checklist, toggle list item, code block, table, file, image, video, audio, styled text, and links.

Sapientia already covers many of these, but should explicitly audit parity for:

- toggle heading
- toggle list item
- file/image/video/audio embeds
- code block language behavior
- table Markdown round-trip
- link and styled text round-trip
- Paper-derived blocks and assets

The audit should focus on behavior users can observe and Markdown durability, not on matching BlockNote internals for their own sake.

### 7. Portal And Clipping Strategy

Sapientia has previously hit clipping and layering issues around AI panels, toolbar UI, comment popovers, and math popovers. BlockNote exposes portal targets for floating UI so menus and panels can avoid overflow clipping and stacking-context bugs.

Future editor UI should standardize portal strategy:

- define a consistent portal target for BlockNote floating UI
- route toolbar, link toolbar, side menu, comment popovers, and math popovers through that strategy where practical
- reduce local CSS workarounds for overflow and z-index issues
- test behavior inside the existing app panes, Paper view, inspector, and AI panel

## Non-Decisions

This ADR does not decide:

- replacing BlockNote
- adopting Novel or Tiptap directly
- adopting Yjs real-time collaboration
- adopting BlockNote CommentsExtension as the comment source of truth
- implementing generic comments for ordinary Notes
- replacing Sapientia's AI panel or MCP/tool architecture
- changing the Markdown file source-of-truth model

## Consequences

### Positive

- Editor features should feel more native and less bolted on.
- Comment, media, table, math, and AI interactions can reuse existing BlockNote extension surfaces.
- The adapter boundary remains useful while still allowing BlockNote-specific polish below it.
- Sapientia can avoid duplicated panels and layout-specific UI that becomes hard to maintain.

### Negative

- Some implementation will remain BlockNote-specific under the adapter.
- BlockNote-native UI surfaces may require careful portal, z-index, and pane integration.
- Borrowing BlockNote comment/AI UX without adopting its collaboration storage requires deliberate adaptation.

### Neutral

- `CommentProvider` remains the storage boundary for comments.
- Markdown files remain the durable source of truth.
- BlockNote remains the active editor implementation under ADR 0166.

## Implementation Guidance

Near-term work should:

1. Move Paper comment markers from generic `NoteSurface` overlay toward Side Menu or selected/current block affordances.
2. Keep comment storage provider-backed.
3. Add a portal strategy for BlockNote floating UI.
4. Audit built-in block coverage and Markdown round-trip behavior.
5. Improve media/File Panel style interactions.
6. Improve table editing and Paper table import polish.
7. Design AI inline suggestions as accept/reject editor operations.

## References

- BlockNote custom schemas: <https://www.blocknotejs.org/docs/features/custom-schemas>
- BlockNote React components: <https://www.blocknotejs.org/docs/react/components>
- BlockNote built-in blocks: <https://www.blocknotejs.org/docs/features/blocks>
- BlockNote comments: <https://www.blocknotejs.org/docs/features/collaboration/comments>
- BlockNote collaboration: <https://www.blocknotejs.org/docs/features/collaboration>
- BlockNote AI: <https://www.blocknotejs.org/docs/features/ai>
