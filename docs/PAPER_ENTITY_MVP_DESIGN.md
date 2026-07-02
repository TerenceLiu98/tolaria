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

## Parser Provider Boundary

Phase 4A introduces the parser-provider boundary that can produce `blocks.jsonl` without hard-wiring a production parser into the Reader. Parser choice is installation-local app settings, not vault state:

- `none`: parsing is disabled and `parse_paper` returns a clear `missing_provider` error.
- `dev-fixture`: writes a deterministic sample `blocks.jsonl` for local testing and development vaults.
- `mineru`: resolves a configured API token directly or from an environment variable name, sends `source.pdf` to MinerU through the remote parser flow, and normalizes the returned content list into canonical SourceBlocks.

The common parse result is `PaperParseResult`: `paperId`, `provider`, `parser`, `parserVersion`, `parsedAt`, `paperPath`, `blocksPath`, `blocks`, `assets`, and `warnings`. `parse_paper(vaultPath, paperId, settings)` resolves `papers/<paper-slug>/paper.md`, `source.pdf`, and `blocks.jsonl` through the active-vault boundary. Successful parsing writes normalized SourceBlock JSONL, updates `paper.md` parse metadata (`parse_status`, `parser_provider`, `parser_version`, `parsed_at`), reloads the app index, and never mutates `source.pdf`.

Phase 4B implements the MinerU adapter behind that boundary. MinerU parsing uses a remote upload/poll/download flow: Tolaria requests a MinerU upload URL, uploads local `source.pdf` bytes, polls the batch result, downloads `content_list.json` or extracts it from the result ZIP, then normalizes entries into SourceBlocks. Supported normalized kinds are `title`, `heading`, `paragraph`, `figure`, `table`, `equation`, and `caption`; page numbers and bboxes are retained when present, and each block receives a stable `sha256:` hash. The configured MinerU value can be the API token itself or an environment variable name such as `MINERU_API_TOKEN`; it is installation-local and is not written to the vault.

Parse metadata supports `unparsed`, `parsing`, `parsed`, and `failed`. Failed MinerU parses update `parse_status: failed` and `parse_error` but do not overwrite a previous valid `blocks.jsonl`. Successful reparses may replace `blocks.jsonl`; the result includes a warning when existing blocks were replaced.

The Paper Reader missing-blocks state exposes "Parse Paper" or "Parse with MinerU" depending on the selected provider and explains that the PDF is available while the paper outline required for citations needs parsing first. After parsing succeeds, the Reader reloads SourceBlocks from the sidecar and keeps PDF preview behavior unchanged. If the last parse failed, the Reader shows a recoverable retry state with the provider error detail while preserving any old outline that still loads.

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
- PDF readiness and the existing `FilePreview` view for the resolved source PDF path.
- Parsed paper-structure state: loading, not parsed, empty, parsed, or error. The backing artifact is still `blocks.jsonl`, but the normal Reader UI presents it as the paper outline instead of exposing the sidecar filename.
- Block count and current selected block id.
- A collapsible SourceBlock outline loaded through the Phase 2A `read_paper_blocks` command.

Block interaction remains intentionally minimal. Selecting a block only focuses the outline row, and the copy action uses the canonical Phase 2B formatter to write `@block[paper_id#block_id]` to the clipboard. Citation navigation consumes the pending `{ paperId, blockId }` request from `src/paper/blockCitationNavigation.ts`, opens the Paper entity, and scrolls/focuses the requested SourceBlock row when the sidecar has that id.

The Phase 2C reader does not write `source.pdf`, `paper.md`, or sidecars. Missing and empty parsed-structure artifacts render recoverable states; malformed sidecars render structured line errors from the existing sidecar reader. PDF page-coordinate overlays, parser integration, AI Ask, memory compilation, and graph UI remain out of scope for that phase.

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
- `reset_paper_annotations(vaultPath, paperId)`

`save_paper_annotation` creates or updates by id and rewrites `annotations.jsonl` after validating the existing sidecar. `delete_paper_annotation` uses the simplest durable v1 behavior: rewrite the file without the deleted record. `reset_paper_annotations` rewrites only `annotations.jsonl` to an empty sidecar so missing or malformed annotation states can recover without touching `paper.md`, `blocks.jsonl`, or `source.pdf`. All commands stay inside the active-vault boundary and never modify `source.pdf`.

The Paper Reader shows annotation counts on annotated SourceBlocks. Selecting a block exposes a compact annotation composer with all five kinds and all five semantic colors. Existing block-level annotations can edit kind, color, and note text inline; saving rewrites the sidecar record with `updated_at`, and deleting an annotation removes it from the sidecar and refreshes the row markers. Missing and empty annotation sidecars are valid zero-annotation states. Malformed annotation sidecars render recoverable errors with an explicit reset action instead of hiding Paper content.

## Marginalia ResearchNote Workflow

Phase 3B connects Paper reading to note writing without adding split-pane editing or a Paper database. The default paper-local note path is:

```text
papers/<paper-slug>/notes/marginalia.md
```

The Paper Reader action "Create/Open Marginalia Note" creates that file through the existing note-content command boundary, or opens it when it already exists. The default template is a normal Tolaria Markdown note with `type: ResearchNote` and a vault-relative wikilink back to the Paper:

```yaml
---
type: ResearchNote
paper:
  - "[[papers/<paper-slug>/paper]]"
---
```

The note body starts with `# Marginalia: <Paper title>` and the sections `Key Claims`, `Questions`, and `Notes`. The Reader also exposes "Add Selected Block to Marginalia"; when a SourceBlock is selected, the action creates the default marginalia note with the canonical `@block[paper_id#block_id]` citation or appends that citation to the existing note. The first implementation appends safely rather than attempting cross-surface cursor insertion.

If a future explicit "Create New Paper Note" action is added, the fallback naming convention is `marginalia-2.md`, `marginalia-3.md`, and so on under the same `papers/<paper-slug>/notes/` directory. The default action must continue to open existing `marginalia.md` rather than duplicating it.

## Paper Reader Marginalia Mode

Phase 3C adds a Paper Reader mode switch without mounting a second full editor instance. Read mode preserves the Phase 2C/3A reader surface: SourceBlock outline plus source PDF preview. Marginalia mode replaces the PDF pane with a paper-local marginalia preview pane while keeping the block outline available for reading and selection.

The marginalia pane reads `papers/<paper-slug>/notes/marginalia.md` through the existing note-content command boundary and reports ready, missing, loading, or error states without creating the file during preview. The pane can create the default marginalia note, open it in the normal editor path, and append the selected block citation; after append it refreshes the displayed note content in place. This intentionally avoids cross-surface cursor insertion and avoids mounting two rich editors until the main editor architecture explicitly supports that safely.

The split layout stacks on narrow widths and uses a two-pane grid on wide screens. Selected SourceBlock state is shared across Read and Marginalia modes so a block chosen while reading remains selected when adding a citation to the marginalia note.
