<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="demo/logo-dark.svg">
    <img alt="Sapientia" src="demo/logo-light.svg" width="120" height="120">
  </picture>

  <h1>Sapientia</h1>

  <p><strong>Human do Marginalia, AIs do Zettelkasten</strong></p>

  <p>
    Sapientia is a local-first desktop research workspace. PDFs become Markdown Paper notes, comments stay beside the text, citations keep block-level provenance, and ordinary notes remain plain files you can read outside the app.
  </p>
</div>

## What Sapientia Is

Sapientia builds on the Tolaria file-first desktop foundation and focuses it on research reading and writing:

- **Paper as Note**: imported PDFs parse into readable Markdown Paper notes, not a separate proprietary reader format.
- **Source provenance**: `source.pdf` remains immutable, while `paper.md`, `blocks.jsonl`, `annotations.jsonl`, and `metadata.json` keep derived state explicit and rebuildable.
- **Block citations**: `@block[paper_id#block_id]` gives notes durable references back to exact Paper blocks.
- **Comments outside source text**: comments attach to Paper block anchors and persist in `annotations.jsonl`; they do not rewrite the paper body.
- **Metadata-aware library**: Paper metadata is extracted into frontmatter and sidecars so Papers can be searched, filtered, and deduplicated.
- **AI with provenance**: paper-aware AI tools can search Papers, read exact blocks, and return compact evidence with citations.

## Philosophy

Sapientia keeps the parts of Tolaria that matter most:

- **Files are the source of truth**. Markdown, YAML frontmatter, JSON sidecars, PDFs, and attachments live in your vault.
- **Git is the sync/history layer**. Sapientia does not require a proprietary cloud service.
- **Types are lenses, not schemas**. Types help browse and filter notes without locking your knowledge into a database.
- **Research notes are normal notes**. Use ordinary `Note` files, wikilinks, backlinks, and block citations to connect ideas to Papers.

## Local Development

```bash
pnpm install
pnpm tauri dev
```

Useful checks:

```bash
pnpm lint
pnpm build
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
```

## Repository Layout

- `src/`: React frontend and shared TypeScript logic.
- `src-tauri/`: Tauri shell, Rust commands, parser/storage helpers, and bundled resources.
- `docs/`: architecture notes, ADRs, and product design notes.
- `site/`: public documentation site.
- `mcp-server/`: MCP tools for vault, Paper evidence, and Project Canvas-aware AI access.

## License And Upstream Attribution

Sapientia is licensed under **AGPL-3.0-or-later**, the same license used by Tolaria. The full license text is in [LICENSE](LICENSE), and upstream attribution is recorded in [NOTICE.md](NOTICE.md).

In practical terms, keep these obligations in mind when distributing Sapientia or modified versions:

- Preserve the AGPL license text and copyright/license notices.
- Make the corresponding source code available under AGPL-3.0-or-later when you distribute the app.
- If the software is modified and offered over a network, AGPL source-availability obligations still apply.
- Keep the upstream Tolaria attribution, but do not reuse Tolaria's name or logo as Sapientia branding.

This section is a practical engineering summary, not legal advice.
