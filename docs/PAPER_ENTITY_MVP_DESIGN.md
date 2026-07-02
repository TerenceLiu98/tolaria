# Paper Entity MVP Design

This note captures the Phase 1 command contract from `docs/NEW_PRD.md`.

## Import Command

`import_paper_pdf(vaultPath, sourcePath)` copies a selected PDF into the active vault and creates a Paper note.

Input:

- `vaultPath`: active vault root.
- `sourcePath`: user-selected PDF path, which may be outside the vault.

Output:

- `paperId`
- `title`
- `paperPath`
- `sourcePdfPath`
- `blocksPath`
- `annotationsPath`
- `createdFiles`
- `deduplicated`

Behavior:

- Create `papers/<paper-slug>/source.pdf`.
- Create `papers/<paper-slug>/paper.md`.
- Use a numeric suffix when the target paper folder already exists.
- Do not create block or annotation sidecars in Phase 1.
- Do not mutate the original selected PDF.

## Frontend Flow

The command palette exposes `Import Paper PDF`. The renderer opens the native PDF picker, invokes the Tauri command, reloads the vault, selects the `Paper` type section, and opens the created `paper.md`. PDF display continues through Tolaria's existing file preview path.

## SourceBlock Sidecar Contract

Phase 2A introduces the stable `blocks.jsonl` substrate without parser integration. Each non-empty line is one SourceBlock JSON object with these required fields:

- `id`: stable block id inside the paper.
- `paper_id`: parent Paper id.
- `kind`: block kind such as `title`, `paragraph`, `figure`, `table`, or `caption`.
- `page`: 1-indexed PDF page.
- `hash`: stable content or structure hash.

Optional fields include `text`, `caption`, `bbox`, `section`, `order`, `source_asset`, `confidence`, and `parser`. Unknown fields are accepted and preserved by the Rust reader so future parser metadata can be added without breaking older app versions.

Reader commands:

- `read_paper_blocks(vaultPath, paperId)`
- `read_paper_block(vaultPath, paperId, blockId)`
- `search_paper_blocks(vaultPath, paperId, query)`

Missing `blocks.jsonl` returns a `missing` state with no blocks. Empty sidecars return `empty`. Malformed JSONL or missing required fields returns structured line errors and does not mutate `source.pdf`, `paper.md`, or any sidecar.

## Block Citation Syntax

Phase 2B introduces durable Markdown citations for SourceBlocks:

```markdown
@block[paper_id#block_id]
@block[paper_id#block_id "Display label"]
```

The canonical parser lives in `src/paper/blockCitations.ts`. It preserves the raw token and source range, extracts `paper_id`, `block_id`, and optional label, skips fenced and inline code, and returns malformed tokens as recoverable parse results instead of throwing.

Validation is resolver-based so the app can check citations against `blocks.jsonl` without introducing a Paper database. The current frontend validator reports malformed syntax, missing Paper ids, and missing block ids. Rendering starts with a lightweight Markdown token path: valid citations become clickable block-citation links, malformed closed citations render with a warning state, and raw Markdown mode still shows the original `@block[...]` syntax unchanged.

Clicking a valid rendered citation records pending `{ paperId, blockId }` focus intent and opens the matching Paper entity when it is present in the vault index. The Phase 2C reader shell consumes that pending block focus to scroll/focus the matching SourceBlock row when the sidecar contains it.

## Paper Reader Shell

Phase 2C adds the first Paper Reader surface without changing the underlying files-first model. Opening a `type: Paper` entity renders `src/paper/PaperReaderShell.tsx` inside the existing editor content area instead of mounting the generic rich-note editor. Raw mode still shows the original `paper.md` Markdown unchanged.

The reader shell displays:

- Paper metadata parsed from `paper.md`.
- `source_pdf` status and the existing `FilePreview` view for the resolved source PDF path.
- `blocks.jsonl` load state: loading, missing, empty, ready, or error.
- Block count and current selected block id.
- A simple SourceBlock outline loaded through the Phase 2A `read_paper_blocks` command.

Block interaction remains intentionally minimal. Selecting a block only focuses the outline row, and the copy action uses the canonical Phase 2B formatter to write `@block[paper_id#block_id]` to the clipboard. Citation navigation consumes the pending `{ paperId, blockId }` request from `src/paper/blockCitationNavigation.ts`, opens the Paper entity, and scrolls/focuses the requested SourceBlock row when the sidecar has that id.

The Phase 2C reader does not write `source.pdf`, `paper.md`, or sidecars. Missing and empty sidecars render recoverable states; malformed sidecars render structured line errors from the existing sidecar reader. PDF page-coordinate overlays, parser integration, AI Ask, memory compilation, and graph UI remain out of scope for that phase.

## Annotation Sidecar Contract

Phase 3A introduces `annotations.jsonl` as the durable sidecar for user-created Paper Reader marks. Each non-empty line is one PaperAnnotation JSON object. Required fields are:

- `id`: stable annotation id.
- `paper_id`: parent Paper id.
- `kind`: one of `highlight`, `underline`, `question`, `comment`, or `bookmark`.
- `created_at`: ISO timestamp written by the client that created the annotation.

An annotation must target either a SourceBlock with `block_id` or a future PDF region with `page` plus `bbox`. Phase 3A only creates block-level annotations from the Reader UI; the model accepts coordinate targets so future PDF overlays can share the same sidecar without changing the file contract.

Initial semantic colors are `questioning`, `important`, `original`, `pending`, and `conclusion`. Optional fields include `color`, `text`, `note`, `updated_at`, and `deleted_at`; unknown fields are preserved by the Rust reader for forward compatibility.

Reader commands:

- `read_paper_annotations(vaultPath, paperId)`
- `save_paper_annotation(vaultPath, paperId, annotation)`
- `delete_paper_annotation(vaultPath, paperId, annotationId)`

`save_paper_annotation` creates or updates by id and rewrites `annotations.jsonl` after validating the existing sidecar. `delete_paper_annotation` uses the simplest durable v1 behavior: rewrite the file without the deleted record. Both commands stay inside the active-vault boundary and never modify `source.pdf`.

The Paper Reader shows annotation counts on annotated SourceBlocks. Selecting a block exposes minimal block-level actions for highlight, question, and comment; deleting an annotation removes it from the sidecar and refreshes the row markers. Missing and empty annotation sidecars are valid zero-annotation states. Malformed annotation sidecars render recoverable errors instead of hiding Paper content.
