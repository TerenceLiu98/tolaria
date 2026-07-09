---
type: ADR
id: "0171"
title: "Move comments to an editor-independent margin note layer"
status: proposed
date: 2026-07-09
---

# ADR 0171: Move Comments to an Editor-Independent Margin Note Layer

## Context

Sapientia currently has a working comment seam for Paper notes through `CommentProvider` and Paper-backed annotations. Recent implementation moved comment affordances closer to BlockNote's side-menu interaction model, but that introduced a product and lifecycle mismatch:

- BlockNote's side menu is hover-driven and should stay focused on add, drag, and block-local editor controls.
- Comment threads are user-authored marginal notes and should stay open even when hover, cursor, or selected block changes.
- A comment does not always need to attach to a parsed source block. Users may want comments on selected text, images, paragraphs, or the document as a whole.
- Paper comments need source provenance when available, but provenance is not the same thing as UI anchoring.

ADR 0167 remains valid for editor-native formatting, media, table, math, and AI surfaces, but its BlockNote-side-menu direction for comments is superseded by this ADR.

## Decision

Sapientia comments should move toward a margin note layer that is independent from BlockNote's side-menu lifecycle.

The editor remains responsible for exposing selection, caret, image, and optional block context. The comment system owns anchoring, persistence, margin markers, thread state, and comment composition.

## Product Model

Comments are margin notes over a normal editable Note:

- Comments may target a source block when a durable `paper_id + block_id` exists.
- Comments may target selected text using quote/context anchors.
- Comments may target an image or file attachment using asset path or attachment identity.
- Comments may target a nearby note position when no exact selection is available.
- Comments may remain document-level when the user wants a general note.

Block provenance is optional metadata, not the only valid anchor.

## Storage Model

The current `CommentProvider` boundary remains the source of truth for comment operations.

Preferred future anchor shape:

```json
{
  "anchor_id": "stable-anchor-id",
  "target": {
    "kind": "source_block | text_quote | image | note_position | document",
    "paper_id": "optional-paper-id",
    "block_id": "optional-source-block-id",
    "path": "optional-note-or-asset-path",
    "quote": "optional-selected-text",
    "prefix": "optional-text-before-quote",
    "suffix": "optional-text-after-quote"
  }
}
```

Paper comments can continue reading and writing `annotations.jsonl` until a dedicated `comments.jsonl` migration is implemented. A future sidecar migration may add `comments.jsonl`, but this ADR does not require it.

## Task List

### Phase A: Remove SideMenu Coupling

- Keep BlockNote SideMenu focused on add, drag, collapse, and direct block editing controls.
- Remove comment-thread lifecycle from `tolariaBlockNoteSideMenu.tsx`.
- Remove SideMenu-specific comment geometry helpers such as `sideMenuCommentPosition`; comment thread placement belongs to the margin layer.
- Ensure opening a comment thread locks the chosen anchor and does not follow hover changes.
- Keep any selected block or selected text discovery behind the editor adapter boundary.

### Phase B: Add Margin Note Layer

- Add a dedicated comment margin rail next to the editable note surface.
- Render persistent markers only for anchors that already have comments.
- Render a lightweight `+ comment` affordance only for the active selection, hovered text region, focused image, or caret-nearby note position.
- Reposition visible markers on scroll and resize without measuring every document block on every frame.
- Clamp thread popovers within the editor viewport and avoid overlapping primary editor controls.

### Phase C: Generalize Anchors

- Support source-block anchors for existing Paper comments and block citations.
- Add selected-text quote anchors with prefix/suffix context.
- Add image/attachment anchors based on copied asset path or attachment identity.
- Add note-position/document-level anchors for comments that are not tied to a specific block.
- Preserve source provenance when available, but degrade gracefully when block/page metadata is missing.

### Phase D: Improve Comment UX

- Allow create, edit, delete, resolve/reopen, and reply operations through the margin thread UI.
- Keep comment composition compact; do not show block ids, page numbers, or internal anchor details by default.
- Show source/citation details only behind a secondary details action.
- Keep keyboard escape/click-outside behavior predictable so users can close a thread without creating a comment.
- Ensure comments never mutate `paper.md` or ordinary note Markdown body content.

### Phase E: Performance And Memory

- Do not render one gutter component per block.
- Track only:
  - anchors with existing comments
  - the active selection/hover/caret target
  - the currently open thread anchor
- Batch DOM measurement through one layout pass per animation frame.
- Avoid long-lived observers over every BlockNote block.
- Add debug counters for marker count, measured anchor count, and layout cost in development builds if useful.

### Phase F: Tests

- Comment markers remain stable while the mouse moves across other blocks.
- Opening a thread locks the selected anchor until the user closes or switches it.
- Empty `+ comment` affordance appears for active selection/caret/image only.
- Selected-text comments persist without writing into Markdown.
- Image comments persist using attachment identity/path.
- Existing Paper source-block comments remain readable.
- Missing block/page provenance does not break comment rendering.
- Ordinary notes without comments do not pay a large margin-layer rendering cost.

## Non-Goals

- Do not adopt BlockNote's official collaborative `CommentsExtension` as the durable source of truth in this phase.
- Do not require real-time collaboration, user resolution, or a remote thread store.
- Do not make comments block-only.
- Do not write comments into `paper.md` or ordinary note Markdown bodies.
- Do not replace BlockNote as the editor.

## Consequences

Positive:

- Comments behave like research margin notes rather than editor block controls.
- Comment threads can stay open without being tied to hover-driven side-menu state.
- The same comment model can later support ordinary Notes, Papers, images, and selected text.
- Rendering can be cheaper because only commented anchors, the active target, and the open thread need live UI.

Negative:

- The margin layer needs its own positioning and anchoring contract.
- Text quote anchoring requires careful stale-context behavior when users edit notes.
- Some BlockNote-native comment affordances must be borrowed as UX references rather than adopted directly.

## Relationship To Prior ADRs

- Supersedes the comment-specific SideMenu direction in ADR 0167.
- Keeps ADR 0166's editor adapter boundary.
- Keeps ADR 0157's `CommentProvider` storage seam.
- Keeps Paper sidecar comments/annotations as local-first files.
