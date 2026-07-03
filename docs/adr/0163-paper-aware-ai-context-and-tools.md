# ADR 0163: Paper-Aware AI Context and Tools

## Status

Accepted

## Context

Paper entities are now normal Markdown notes with durable sidecars: `metadata.json` for bibliographic provenance, `blocks.jsonl` for parsed SourceBlocks, and `annotations.jsonl` for comments. Tolaria already exposes vault notes to AI agents through the existing context snapshot and MCP server. Adding a separate "Ask Paper" product surface would duplicate that architecture and make Paper behavior diverge from ordinary notes.

## Decision

Tolaria extends the existing AI context and MCP tool boundary instead of creating a new Paper AI surface.

- `src/utils/ai-context.ts` adds compact Paper context when the active note is a Paper, including paper id, bibliographic fields, sidecar names, parse/metadata status, related Paper summaries, and resolved `@block[...]` citation targets.
- `mcp-server/tool-service.js` exposes read-only Paper tools backed by `mcp-server/paper-tools.js`.
- Paper MCP tools derive their state from Markdown frontmatter and sidecars at tool-call time. No catalog database is introduced.
- Tool output is compact by default and includes provenance: `paperId`, Paper title, vault/workspace label, note path, page number, wikilink, and `@block[...]` citation where applicable.
- Reading blocks requires an explicit Paper id and block ids or range. Search returns snippets rather than full paper bodies.
- Writes continue to use the existing note-creation/editing boundaries. Paper tools do not write into mounted vaults.

## Consequences

AI agents can search Papers, read exact SourceBlocks, and cite them without loading full `paper.md` by default. Mounted workspace reads follow the existing MCP active-vault scope and require `vaultPath` when identifiers are ambiguous. Future Paper Ask or memory features can build on these tools without changing the files-first storage model.
