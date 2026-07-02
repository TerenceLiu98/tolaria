# ADR-0152: Block Citation Markdown Syntax

## Status

Accepted

## Context

Phase 2B of `docs/NEW_PRD.md` requires notes to cite stable blocks from Paper sidecars without depending on a future Paper Reader, parser integration, or editor-only schema nodes. Citations must survive Markdown round-trips and remain inspectable in ordinary vault files.

## Decision

Use `@block[paper_id#block_id]` as the canonical durable syntax, with an optional quoted display label:

```markdown
@block[vaswani-2017-attention#b0023]
@block[vaswani-2017-attention#b0023 "Transformer parallelization claim"]
```

The TypeScript parser in `src/paper/blockCitations.ts` owns parsing, formatting, raw range preservation, and resolver-based validation against Paper block sidecars. Rendering may decorate valid citations as clickable tokens, but raw Markdown mode and saved files keep the literal `@block[...]` text.

Citation clicks record pending Paper/block focus intent and open the matching Paper entity when the vault index contains it. Exact PDF scroll/highlight behavior remains a later Paper Reader responsibility.

## Consequences

- Notes can cite Paper blocks before the full reader, parser, annotations, or AI features exist.
- Broken syntax and unresolved targets are recoverable validation issues instead of editor corruption.
- The syntax remains independent from wikilinks and does not require changing the current BlockNote schema in this phase.
- Future reader work can consume the pending block focus contract without changing saved notes.

## Alternatives Considered

- Store citations as wikilinks to Paper notes: rejected because wikilinks do not address stable source blocks.
- Store citations as editor inline schema nodes only: rejected because raw Markdown and external tools would lose the source reference.
- Store citations in frontmatter: rejected because citations belong at the prose location where the claim is made.
