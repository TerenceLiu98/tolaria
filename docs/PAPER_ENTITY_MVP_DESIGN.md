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

The command palette exposes `Import Paper PDF`. The renderer opens the native PDF picker, invokes the Tauri command, extracts Paper metadata first, then starts parsing when a parser provider is configured, reloads the vault, selects the `Paper` type section, and opens the created `paper.md`. PDF display continues through Tolaria's existing file preview path. The Reader exposes an explicit `Parse Paper` action for repair/development use and a `Paper metadata` entry for reviewing, editing, or refreshing metadata.

## Paper Markdown Projection

Paper-as-Note is the primary reading model. `paper.md` is not just metadata plus a PDF pointer; after a successful parse its Markdown body is the human-readable projection of the paper content. The parser owns that projected body and replaces it on successful reparse while preserving frontmatter. The stored Markdown keeps hidden `tolaria:block` comments for block identity, but shared display paths strip those comments before rendering, snippets, or previews so users read the paper rather than the machine anchors. Raw/source mode still shows the anchors because that mode is the filesystem truth.

Each parsed block is written as readable Markdown preceded by a hidden block anchor:

```markdown
<!-- tolaria:block id="b0001" page="1" kind="paragraph" hash="sha256:..." -->
Parsed paragraph text.
```

Headings, paragraphs, figures, tables, equations, and captions render as normal Markdown. Figure and table blocks with extracted assets render as Markdown images that point at `papers/<paper-slug>/assets/...`; missing figure assets degrade to caption text. Table blocks prefer parser-provided Markdown tables when no image asset is available and can normalize simple tabular text into Markdown table syntax. Equation blocks render as `$$` display math after stripping Tolaria's internal math sentinels and applying light LaTeX spacing cleanup. The anchor binds the visible Markdown section to a stable SourceBlock id, page, kind, and hash so citations, annotation counts, comment threads, and future repair tooling can attach to the note without writing user comments into the paper text.

`source.pdf` remains immutable provenance. `blocks.jsonl` remains the machine index for lookup/search/citation validation and must stay consistent with the anchors written into `paper.md`. `annotations.jsonl` remains the user comment sidecar. `metadata.json` remains the machine-readable bibliographic metadata sidecar. Long-form user synthesis is handled by ordinary Tolaria `Note` entries, connected to Paper through wikilinks, backlinks, and optional `@block[...]` citations.

## SourceBlock Sidecar Contract

Phase 2A introduces the stable `blocks.jsonl` substrate without parser integration. Each non-empty line is one SourceBlock JSON object with these required fields:

- `id`: stable block id inside the paper.
- `paper_id`: parent Paper id.
- `kind`: block kind such as `title`, `paragraph`, `figure`, `table`, or `caption`.
- `page`: 1-indexed PDF page.
- `hash`: stable content or structure hash.

Optional fields include `text`, `caption`, `bbox`, `section`, `order`, `source_asset`, `asset_path`, `confidence`, and `parser`. `source_asset` records provenance, usually `source.pdf`; `asset_path` is a bundle-relative renderable asset such as `assets/figure-0001.png`. Unknown fields are accepted and preserved by the Rust reader so future parser metadata can be added without breaking older app versions.

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

The common parse result is `PaperParseResult`: `paperId`, `provider`, `parser`, `parserVersion`, `parsedAt`, `paperPath`, `blocksPath`, `blocks`, `assets`, and `warnings`. `parse_paper(vaultPath, paperId, settings)` resolves `papers/<paper-slug>/paper.md`, `source.pdf`, and `blocks.jsonl` through the active-vault boundary. Successful parsing writes normalized SourceBlock JSONL, rewrites the parser-owned `paper.md` body as anchored Markdown, updates `paper.md` parse metadata (`parse_status`, `parser_provider`, `parser_version`, `parsed_at`), reloads the app index, and never mutates `source.pdf`.

Phase 4B implements the MinerU adapter behind that boundary. MinerU parsing uses a remote upload/poll/download flow: Tolaria requests a MinerU upload URL, uploads local `source.pdf` bytes, polls the batch result, downloads `content_list.json` or extracts it from the result ZIP, then normalizes entries into SourceBlocks. When MinerU returns a ZIP, Tolaria also extracts image files into `papers/<paper-slug>/assets/`, maps figure and table SourceBlocks to those files through `asset_path`, and appends fallback figure SourceBlocks for image assets MinerU did not reference in `content_list`, so every extracted image remains visible in the Note-surface Markdown projection. Supported normalized kinds are `title`, `heading`, `paragraph`, `figure`, `table`, `equation`, and `caption`; page numbers and bboxes are retained when present, and each block receives a stable `sha256:` hash. The configured MinerU value can be the API token itself or an environment variable name such as `MINERU_API_TOKEN`; it is installation-local and is not written to the vault.

Parse metadata supports `unparsed`, `parsing`, `parsed`, and `failed`. Failed MinerU parses update `parse_status: failed` and `parse_error` but do not overwrite a previous valid `blocks.jsonl`. Once a Paper is marked `parsed`, default parse calls refuse to run again; the Reader's explicit `Parse Paper` action asks for confirmation and then passes `force: true` so intentional reparses can replace parser-owned `paper.md` and `blocks.jsonl`.

## Paper Metadata

Phase 4H adds `metadata.json` as the Paper metadata sidecar. The sidecar stores canonical bibliographic values, provider sources, candidates, confidence, resolver errors, and update timestamps. `paper.md` frontmatter mirrors only fields users should see and edit: `title`, `authors`, `year`, `venue`, `venue_short`, `venue_type`, `publication_date`, `publication_stage`, `doi`, `arxiv_id`, `metadata_status`, and `metadata_confidence`.

Metadata extraction starts locally from PDF document metadata and parsed `paper.md` text. DOI and arXiv IDs are extracted with deterministic regexes and treated as high-confidence identifiers. OpenAlex is the primary remote resolver: exact DOI matches query OpenAlex works by DOI, while Papers without a DOI can use OpenAlex title search and keep lower-confidence matches as review candidates. Crossref-shaped and arXiv-shaped normalization remains available for compatible records, but provider failures stay recoverable and are stored in `metadata.json` instead of blocking Paper reading.

The Paper shell keeps normal metadata state out of the header. Successful extraction is reflected through ordinary Paper frontmatter and Properties rather than persistent status chips. The header's `Paper metadata` entry opens a bounded, scrollable metadata dialog where users can review candidates, manually edit visible metadata, refresh provider-derived metadata, or keep the current values and mark them reviewed. Candidate apply and manual save both rewrite `metadata.json`, update mirrored frontmatter, clear the review state, and leave `source.pdf`, `blocks.jsonl`, and `annotations.jsonl` untouched.

Paper Reader keeps `Parse Paper` in the header and keeps metadata repair inside the `Paper metadata` dialog. `Parse Paper` runs directly for unparsed or failed Papers; if parsed content already exists, it asks before forcing a reparse. Metadata refresh asks before replacing existing provider-derived fields and candidates. After parsing succeeds, the Reader reloads SourceBlocks from the sidecar and keeps PDF preview behavior unchanged.

## Paper Catalog

Phase 4I adds a derived catalog over existing Paper notes. `PaperCatalogEntry` is rebuilt from `paper.md` frontmatter, optional `metadata.json` provider identifiers, and sidecar file presence; it is not a new source-of-truth database. The Papers type list uses the derived catalog for compact research-library controls: metadata search, venue and venue-type filters, parse/metadata status filters, and duplicate-candidate filtering.

Duplicate detection is review-only. Exact candidates come from matching DOI, arXiv id, OpenAlex id, or Semantic Scholar id. Fuzzy candidates come from normalized title plus year or first author. Tolaria does not auto-merge bundles. If a user marks a candidate as not duplicate, only that review decision is persisted in `papers/catalog-decisions.json`.

Phase 5A makes the existing AI context and MCP tools Paper-aware without adding an Ask Paper surface. When the active note is a Paper, the context snapshot includes compact bibliographic metadata, sidecar names, parse/metadata status, and `@block[...]` citations found in the active note. MCP Paper tools derive catalog entries and SourceBlocks from `paper.md`, `metadata.json`, and `blocks.jsonl` at tool-call time. Search tools return compact snippets with provenance; read tools require an explicit Paper id and block ids or a range. Every block result includes `paperId`, title, vault identity, page when available, wikilink, and canonical `@block[paper_id#block_id]` syntax.

Phase 5B makes that context visible and easier for agents to use. The existing AI panel can show a compact Paper context indicator when the active note is a Paper, when the active note contains resolvable `@block[...]` citations, when it wikilinks to Papers, or when mounted Paper Vaults are available. The indicator remains intentionally small; detailed active Paper metadata, cited block ids, related Papers, and read-only mounted vault information live in the hover preview/context payload rather than occupying permanent chat width. Selected text from the shared note surface can be included through an explicit composer icon, which adds a compact `selectedContext` field to the next AI context without modifying the note. Agent prompt guidance and MCP tool descriptions steer models to discover Papers with `search_papers`, verify bibliographic claims with `read_paper_metadata`, use block search/read tools for evidence, cite exact `@block[...]` targets, avoid whole-paper dumps, and treat mounted Paper Vaults as read-only. Clicking a block citation opens the Paper in Reading View by default and scrolls the shared Markdown note surface to the matching parsed block; PDF page/bbox focus remains the alternate PDF-mode foundation.

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
- Parsed paper-structure state: loading, not parsed, empty, parsed, or error. The backing artifact is still `blocks.jsonl`, but the normal Reader UI describes it as parsed paper structure instead of exposing the sidecar filename.
- Block count and current selected block id.

Phase 4C turns parsed SourceBlocks into the first readable paper view. Titles and headings render as headings, paragraphs render as prose, and figures, tables, equations, and captions get distinct visual treatment while retaining page and section metadata. Later Paper-as-Note work removed the standalone outline/search column so the Paper surface behaves more like an ordinary Tolaria note instead of a separate PDF tool.

Block interaction remains intentionally local to the Reader. Selecting a block opens the block's comment thread, keeps citation actions available, and records a PDF focus request when the block has a page number. The current PDF preview seam does not yet support reliable direct page navigation, so the Reader surfaces the requested block/page as UI state and leaves coordinate overlays for a later phase. Citation navigation consumes the pending `{ paperId, blockId }` request from `src/paper/blockCitationNavigation.ts`, opens the Paper entity, and focuses the requested SourceBlock when the sidecar has that id. The copy action uses the canonical Phase 2B formatter to write `@block[paper_id#block_id]` to the clipboard.

Phase 4D makes the parsed Paper note the primary reading surface. The Reader prefers anchored sections from `paper.md` and uses `blocks.jsonl` as the supporting index for citation, comment, repair, and block-focus lookup. SourceBlocks still provide stable anchors, but the central readable prose comes from the Markdown projection whenever anchors are present. A compact gutter shows the count of attached comments and opens the block comment thread. The thread creates, edits, and deletes ordinary comments through the existing sidecar helpers, and exposes copy-citation actions. User comments remain `annotations.jsonl` records and are not written into `paper.md` or merged into parsed paper text.

Phase 4E extracts the comment surface into a generic Note Editor seam while keeping Paper as the only consumer. `src/comments/commentProvider.ts` defines the provider contract, `src/components/comments/CommentUI.tsx` owns the reusable gutter/thread/composer UI, and `src/paper/paperCommentProvider.ts` maps Paper annotations into generic comment threads by block anchor.

Phase 4F mounts Paper Markdown through the shared Note surface. `PaperReaderShell` is now a thin Paper wrapper: it owns metadata, parse status, Markdown/PDF mode, source PDF actions, selected block state, and Paper-specific annotation wiring. The Markdown Reading View uses the same editable `NoteSurface`/`SingleEditorView` path as ordinary notes with the Paper comment provider attached. Reading View switches only between Markdown and PDF. Paper-specific long-note modes, panes, commands, templates, append actions, and the standalone Paper structure column are removed.

The Phase 2C reader does not write `source.pdf`, `paper.md`, or sidecars. Missing and empty parsed-structure artifacts render recoverable states; malformed sidecars render structured line errors from the existing sidecar reader. PDF page-coordinate overlays, parser integration, AI Ask, memory compilation, and graph UI remain out of scope for that phase.

## Annotation Sidecar Contract

`annotations.jsonl` is the durable sidecar for user-created Paper comments. Each non-empty line is one PaperAnnotation JSON object. Required fields are:

- `id`: stable annotation id.
- `paper_id`: parent Paper id.
- `kind`: `comment` for newly created Paper comments.
- `created_at`: ISO timestamp written by the client that created the annotation.

An annotation must target either a SourceBlock with `block_id` or a future PDF region with `page` plus `bbox`. The current Reader UI only creates block-level comments from the comment gutter; the model accepts coordinate targets so future PDF overlays can share the same sidecar without changing the file contract.

Optional fields include `text`, `note`, `updated_at`, and `deleted_at`; unknown fields are preserved by the Rust reader for forward compatibility. Older sidecars may still contain legacy `color` values or non-comment kinds from earlier Paper Reader experiments. Tolaria preserves those records but no longer exposes kind/color controls in the comment UI.

Reader commands:

- `read_paper_annotations(vaultPath, paperId)`
- `save_paper_annotation(vaultPath, paperId, annotation)`
- `delete_paper_annotation(vaultPath, paperId, annotationId)`
- `reset_paper_annotations(vaultPath, paperId)`

`save_paper_annotation` creates or updates by id and rewrites `annotations.jsonl` after validating the existing sidecar. `delete_paper_annotation` uses the simplest durable v1 behavior: rewrite the file without the deleted record. `reset_paper_annotations` rewrites only `annotations.jsonl` to an empty sidecar so missing or malformed annotation states can recover without touching `paper.md`, `blocks.jsonl`, or `source.pdf`. All commands stay inside the active-vault boundary and never modify `source.pdf`.

The Paper Reader shows comment counts in the rendered block gutter. Selecting a block or clicking its gutter marker opens a compact thread with a block-level comment composer. Existing block-level comments can edit note text inline; saving rewrites the sidecar record with `updated_at`, and deleting a comment removes it from the sidecar and refreshes the gutter markers. Missing and empty annotation sidecars are valid zero-comment states. Malformed annotation sidecars render recoverable errors with an explicit reset action instead of hiding Paper content.

## Long-Form Notes

Paper no longer owns a special long-note workflow or a dedicated research-note type. Users create ordinary `Note` entries anywhere in the vault, link them to Paper with Tolaria's existing wikilink/backlink behavior, and use durable `@block[paper_id#block_id]` citations when they need exact evidence. This keeps long-form synthesis inside Tolaria's normal note model while leaving Paper comments in `annotations.jsonl`.
