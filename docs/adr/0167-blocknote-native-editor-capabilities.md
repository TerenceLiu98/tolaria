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

Paper comments originally used `NoteSurface` overlay positioning based on DOM/block ids. The current implementation has moved the visible Paper comment marker into the BlockNote Side Menu through `TolariaCommentSideMenuButton`, and selected comment threads render through the shared editor floating portal. This is closer to BlockNote's block interaction model, but the thread anchor is still a Sapientia seam rather than a complete BlockNote-native comment experience.

Future comment UI should continue moving closer to BlockNote's block interaction model:

- use current block, selected block, or block-adjacent affordances consistently for comment markers
- show compact comment counts near the relevant block
- open the comment thread from that marker
- support selected-text comment creation when durable text-range anchors exist
- keep comment creation, editing, deletion, and citation actions provider-backed

Storage must continue to use Sapientia's `CommentProvider` boundary. Paper comments remain backed by `annotations.jsonl` and future `comments.jsonl`. Ordinary Note comments need a later durable note-block anchor decision.

Sapientia should not switch comment storage directly to BlockNote's CommentsExtension in this phase. BlockNote comments are built around a thread store, user resolution, and real-time collaboration assumptions, while Sapientia's source of truth is local files.

Concretely, Sapientia should not make BlockNote's official `CommentsExtension` the durable comment system until a future collaboration ADR decides to adopt its `ThreadStore`, `resolveUsers`, and real-time collaboration model.

### 2. Comment Experience Parity

Current Sapientia comments support create, edit, delete, and citation actions. They do not yet provide several higher-level comment-thread experiences visible in BlockNote's comments model:

- resolved/open state
- replies and thread activity
- reactions or emoji
- comment sidebar filtering and sorting
- selected-text comment composer

Sapientia may borrow these UX ideas, but should not adopt BlockNote's collaborative comments storage as the source of truth without a separate ADR.

BlockNote's official comments UI includes thread/reply/reaction affordances and a `ThreadsSidebar` with filtering and sorting. Sapientia should treat those as interaction references, not as a storage migration requirement.

### 3. Inline AI Editing

Sapientia already has an AI panel, selected context, Paper tools, and MCP/tool guidance. It does not yet provide BlockNote-style inline AI editing where the model proposes edits inside the editor and the user can accept, reject, or revise them in place.

Future AI editor work should add an inline suggestion seam:

- selected text or selected blocks can be sent to AI
- AI can propose an insert, replace, rewrite, or summarize operation
- output appears as an editor-local suggestion
- user can accept, reject, or modify before writing to the note
- AI suggestions can stream progressively when the provider supports streaming
- editor AI operations can expose clear custom commands rather than only free-form chat
- AI operations should remain transparent and citation-aware when Paper evidence is involved

This should extend the existing AI architecture rather than replace it with a standalone editor-only AI product. The target interaction is editor-in-place generation or rewriting of selected blocks, not only answering in the AI panel.

### 4. File Panel And Media Blocks

Sapientia supports media previews, Paper assets, image selection context, and file/path actions. Media interactions remain more custom than native BlockNote media UX.

Future media work should study and reuse BlockNote File Panel patterns where they fit:

- replace file/image action
- caption editing where durable in Markdown
- media metadata actions
- consistent selected media controls
- Paper/MinerU image asset operations
- media block actions that feel attached to the selected file/image block rather than a separate app-level panel

Sapientia should continue to keep Markdown and vault files as source of truth.

Current audited state:

- media toolbar buttons still use BlockNote's formatting toolbar as the interaction surface for selected file/image/audio/video blocks
- selected media block detection, portable display-path resolution, caption patch construction, and replacement request/patch construction live in `src/components/formatting/mediaToolbarModel.ts` with focused tests
- the React button layer remains responsible for opening files, copying paths, editing captions, and invoking the injected media replacement handler
- caption and replacement mutations recover stale selected media blocks through the shared rich-editor transform recovery path, so reload churn is treated as editor recovery rather than a user-visible media replacement failure

### 5. Table Handles And Table Editing

Sapientia can render and edit tables, but Paper/MinerU table import, captions, table-as-image fallbacks, and table editing polish are not yet systematically aligned with BlockNote's table and floating UI patterns.

Future table work should audit:

- table handles and resizing behavior
- whether table handles are routed through the same floating UI and portal strategy as other editor overlays
- keyboard navigation
- copy/paste fidelity
- Markdown round-trip for imported tables
- Paper captions and source provenance
- table-image fallback behavior for parser outputs

Current audited state:

- table header-row and header-column toggles remain in the BlockNote side-menu drag-handle menu because they mutate the selected table block directly
- table header toggles re-resolve the live BlockNote block before mutation, so stale side-menu controls after note reloads do not mutate disappeared blocks
- row/column header state mapping is centralized in `src/components/tableHeaderModel.ts` instead of hardcoding `headerRows` and `headerCols` selection logic in the JSX path
- the table header model has focused tests for table-content extraction, row/column key mapping, and toggle patch construction
- deeper table-handle resizing, imported Paper table captions, and table-image fallback polish remain future work under this ADR

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

Current audited state:

- `src/components/formatting/blockCoverageModel.ts` now records the executable coverage contract for BlockNote built-ins and Sapientia custom blocks
- the block type select exposes Markdown-durable paragraph, heading, quote, bullet list, numbered list, checklist, and code block transformations
- the slash menu keeps the same Markdown-durable defaults plus Sapientia media, math, diagram, and whiteboard commands
- BlockNote heading 5/6 slash commands plus toggle-heading and toggle-list slash commands remain filtered as Markdown-unstable until their parse, serialize, reopen, and raw-mode behavior is proven end to end
- toggle-like collapsing for headings and list items remains a Sapientia editor interaction, not a persisted BlockNote toggle block type
- focused tests assert that toolbar block types, filtered slash keys, and media file block handling stay aligned with the coverage contract

### 7. Portal And Clipping Strategy

Sapientia has previously hit clipping and layering issues around AI panels, toolbar UI, comment popovers, and math popovers. BlockNote exposes portal targets for floating UI so menus and panels can avoid overflow clipping and stacking-context bugs.

Future editor UI should standardize portal strategy:

- define a consistent portal target for BlockNote floating UI
- audit BlockNoteView `portalElements` usage where supported by the installed BlockNote version
- route toolbar, link toolbar, side menu, comment popovers, and math popovers through that strategy where practical
- reduce local CSS workarounds for overflow and z-index issues
- test behavior inside the existing app panes, Paper view, inspector, and AI panel

Current audited state:

- the installed BlockNote React package does not expose a `portalElements` prop in its shipped types or runtime bundle, so Sapientia cannot yet wire BlockNoteView directly to the documented portal target API
- `SingleEditorView` owns a stable `editor-floating-portal` overlay inside the editor container and outside the BlockNote view
- Sapientia-owned floating surfaces such as the formatting toolbar and Paper comment thread use that shared overlay through `EditorFloatingPortalProvider`
- the overlay deliberately does not receive `.bn-container`, because BlockNote's container class carries full-surface layout and background styles that would cover the note
- side-menu comment-thread placement is calculated by `src/components/sideMenuCommentPosition.ts` with focused tests, so portal clipping and right-edge clamping rules do not live as ad hoc geometry inside the React hook

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

## Current Cleanup Backlog

The recent BlockNote-native work intentionally favored getting behavior back under BlockNote's own interaction surfaces. Several implementation seams are now functional but too concentrated or too workaround-heavy. These are not separate architecture decisions, but they are cleanup requirements under this ADR.

The concrete repair queue that motivated this section is:

- `src/components/tolariaEditorFormatting.tsx`: keep decomposing toolbar rendering, block type selection, media actions, inline math, selected-text AI context, inline AI suggestions, and floating positioning into focused formatting modules.
- `src/components/tolariaBlockNoteSideMenu.tsx`: keep scroll preservation centralized instead of scattering timeout ladders, nested animation frames, and editor DOM queries through side-menu features.
- `src/components/editorSchema.tsx`: keep inline math and custom editor UI copy localized; do not reintroduce hardcoded labels such as "Inline math", "Cancel", "Save", or dynamic English aria labels.
- `src/components/Editor.css`: keep BlockNote theme variables shared between the real editor container and floating toolbar scope; avoid duplicating CSS variable blocks.
- Paper docs: keep `docs/PAPER_ENTITY_MVP_DESIGN.md`, `docs/ABSTRACTIONS.md`, `docs/ARCHITECTURE.md`, and `docs/NEW_PRD.md` aligned with the editable Paper Note contract.
- `src/components/editorAdapter.ts`: grow the adapter around real product-level editor capabilities, not as a thin permanent stub and not as a generic helper dump.
- `src/paper/PaperReaderShell.tsx`: keep extracting metadata, parse, comments, PDF, Markdown surface, and bridge responsibilities so the shell remains orchestration only.
- Branding and sidecar naming: audit remaining Tolaria/Laputa product-facing strings separately from compatibility identifiers, and keep `annotations.jsonl` as the current comment write target until a dedicated `comments.jsonl` migration exists.

### Formatting Toolbar Decomposition

`src/components/tolariaEditorFormatting.tsx` previously owned too many responsibilities in one file:

- toolbar rendering
- block type select
- media open, copy path, caption edit, and replace actions
- inline math insertion
- selected-text attachment for AI context
- inline AI suggestion UI
- floating portal positioning and viewport clamping

The first decomposition pass extracted these responsibilities without changing behavior:

- `src/components/formatting/BasicTextButtons.tsx`
- `src/components/formatting/MediaToolbarButtons.tsx`
- `src/components/formatting/InlineMathButton.tsx`
- `src/components/formatting/InlineAiSuggestion.tsx`
- `src/components/formatting/SelectedTextContextButton.tsx`
- `src/components/formatting/BlockTypeSelect.tsx`
- `src/components/formatting/blockTypeSelectModel.ts`
- `src/components/formatting/toolbarBlocks.ts`
- `src/components/formatting/toolbarSelection.ts`
- `src/components/formatting/toolbarPositioning.ts`
- `src/components/formatting/inlineAiSuggestionModel.ts`

The extracted basic text buttons, block type select labels, custom slash-menu commands, and generated Mermaid placeholder text now use locale catalog keys for user-facing labels, groups, tooltips, and default inserted content instead of carrying English copy constants inside the formatting modules.

Block type select matching, prop-schema construction, toolbar media bridge id detection, and update-patch construction now live in `blockTypeSelectModel.ts` with focused tests. `BlockTypeSelect.tsx` remains responsible for BlockNote live-block revalidation, stale-reference recovery, and Mantine/BlockNote menu rendering.

Inline AI target resolution and draft state transitions now live in `inlineAiSuggestionModel.ts` with focused tests, while `InlineAiSuggestion.tsx` remains the BlockNote toolbar integration and rendering layer.

Further cleanup can still move more live editor mutation orchestration into focused helpers when it becomes reusable, but the BlockNote toolbar should remain the integration point. Product-specific Paper, AI, and media behavior should not move above the editor boundary.

### Side Menu Scroll Preservation

`src/components/tolariaBlockNoteSideMenu.tsx` previously preserved scroll position with fragile timing workarounds, including multiple delayed restores and nested animation frames. It also discovered editor and scroll elements with DOM selectors such as `.editor-scroll-area` and `.bn-editor`.

That behavior has been consolidated into `src/components/editorScrollPreservation.ts` with focused tests. The desired end state remains:

- one reusable utility for capturing and restoring the active editor scroll container
- fewer raw DOM queries in Side Menu components
- no scattered timeout ladder in feature components
- behavior tests that cover side-menu add/collapse/comment actions without scroll jumps

The Side Menu now uses the same preservation wrapper for add-block, drag-handle delete, and table header toggle actions. The tests cover slash-menu insertion, deletion, and table-header mutation so future side-menu features do not reintroduce one-off scroll repair paths.

If the installed BlockNote version exposes a better side-menu or portal lifecycle hook, prefer that over local timing repairs.

### Inline Math UI Localization

`src/components/editorSchema.tsx` used to contain user-facing hardcoded strings in the inline math popover, including labels such as "Inline math", "Cancel", "Save", and dynamic aria text such as `Math: ...`.

These strings have moved into locale catalogs. Inline math should keep using BlockNote custom inline content, and the editing popover must continue to follow the same localization rules as the rest of the editor.

### Shared BlockNote Theme Variables

`src/components/Editor.css` previously duplicated the same BlockNote CSS variable mapping for the main editor container and the floating toolbar portal scope:

- `.editor__blocknote-container .bn-container`
- `.editor__floating-blocknote-scope`

This duplication came from fixing portal clipping and toolbar styling. The current CSS uses a shared selector for the theme variables so future theme changes do not need to be applied in two places. The full-screen floating portal host must remain transparent and must not receive `.bn-container`, because `.editor__blocknote-container .bn-container` gives that class full width, full height, and an editor background.

### Paper Contract Documentation Alignment

Paper documentation previously contained obsolete parser-owned language in places such as:

- `docs/PAPER_ENTITY_MVP_DESIGN.md`
- `docs/ABSTRACTIONS.md`
- `docs/ARCHITECTURE.md`
- older Paper ADRs that are now superseded

The current contract is:

- `paper.md` is an editable Paper Note in the normal editor path.
- `type: Paper` adds source provenance, metadata, evidence, comments, catalog, and AI capabilities.
- `blocks.jsonl` remains the source evidence index.
- comments remain sidecar-backed and are not written into `paper.md`.
- parse/reparse behavior must be documented consistently with the current product decision.

Current implementation docs should describe older Paper Reader phases as historical or superseded when they conflict with the current NoteSurface contract. When updating ADRs, prefer pointing older ADRs to superseding ADRs rather than rewriting historical decisions.

### Adapter Boundary Completion

`src/components/editorAdapter.ts` is intentionally thin, but it should own product-level editor capabilities that must survive future editor changes. The first concrete pass moved selected text, selected attachment context, and block focus/navigation behind this adapter instead of leaving those methods as `null` stubs or letting Paper code call BlockNote internals directly.

Future editor work should continue moving selected block, insert, replace, focus, and Markdown round-trip behavior behind this adapter instead of calling BlockNote APIs from unrelated product surfaces. The adapter should grow only around product-owned capabilities that need to survive future editor changes. It should not become a dumping ground for every BlockNote helper.

### Paper Reader Shell Decomposition

`src/paper/PaperReaderShell.tsx` remains a Paper orchestration file, but the highest-churn responsibilities have been split out. Paper comment-thread rendering has been split into `src/paper/PaperCommentThread.tsx`, the metadata header/editor/confirmation UI has been split into `src/paper/PaperMetadataPanel.tsx`, the PDF alternate-view shell has been split into `src/paper/PaperPdfPanel.tsx`, block/citation/comment-anchor bridge helpers have been split into `src/paper/paperReaderBridge.ts`, the Markdown reading surface composition has been split into `src/paper/PaperMarkdownNoteSurface.tsx`, and parse/metadata command orchestration has been split into `src/paper/paperReaderActions.ts` with direct hook tests.

The shell should stay responsible for composing Paper-specific affordances around the shared Note surface, not for duplicating editor behavior.

### Branding And Legacy Naming Audit

Tolaria and Laputa names remain in internal protocols, tests, docs, and app-facing surfaces. Some names are compatibility identifiers and should not be renamed casually, such as `tolaria:block`, existing MCP server ids, storage keys, or test bridges. Product-facing docs, README text, and user-visible copy should consistently use Sapientia where the rebrand intends it.

Future cleanup should classify each remaining `Tolaria` / `Laputa` occurrence as one of:

- compatibility identifier to keep
- internal implementation name that can wait
- product-facing string to rename
- test fixture text

### Comment Sidecar Naming

The implementation primarily writes Paper comments through `annotations.jsonl`, while newer product docs discuss a future `comments.jsonl`. The current implementation contract should be explicit:

- `annotations.jsonl` remains the active Paper comment sidecar.
- `comments.jsonl` is a future preferred name, not yet the only write target.
- readers may support both only after a dedicated compatibility/migration change.

Until that migration exists, UI and architecture docs should avoid implying that new comments already write to `comments.jsonl`.

Current UI state:

- Paper comment threads expose comment terminology to users even though the durable sidecar and Tauri command names still use `annotation` for compatibility.
- The old highlight/question/color annotation controls are no longer part of the Paper comment thread UI.
- Chinese locale catalogs translate the newer comment filter, sort, resolve, reply, and reaction labels instead of falling back to English.
- Paper comment thread mutation rules for filtering, sorting, resolve/reopen, replies, and reactions live in `src/paper/paperCommentThreadModel.ts` with focused tests, keeping `PaperCommentThread.tsx` closer to a view layer.

## References

- BlockNote custom schemas: <https://www.blocknotejs.org/docs/features/custom-schemas>
- BlockNote React components: <https://www.blocknotejs.org/docs/react/components>
- BlockNote built-in blocks: <https://www.blocknotejs.org/docs/features/blocks>
- BlockNote comments: <https://www.blocknotejs.org/docs/features/collaboration/comments>
- BlockNote collaboration: <https://www.blocknotejs.org/docs/features/collaboration>
- BlockNote AI: <https://www.blocknotejs.org/docs/features/ai>
