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

Clicking a valid rendered citation records pending `{ paperId, blockId }` focus intent and opens the matching Paper entity when it is present in the vault index. Future Paper Reader work can consume the pending block focus to scroll or highlight the exact PDF/source block.
