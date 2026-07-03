# ADR-0156: Paper Markdown Projection

## Status

Accepted

Supersedes the "Store parsed blocks inside `paper.md`" alternative in [ADR-0151](./0151-paper-sidecar-files.md).

## Context

Tolaria's core model is a files-first Markdown vault where the main user-visible artifact is a note. The first Paper implementation imported PDFs into Paper bundles and stored parsed structure in `blocks.jsonl`, then rendered those blocks through a dedicated Paper Reader. That kept parser output machine-stable, but it made the reading surface feel like a separate PDF/block-list tool instead of a Tolaria note.

The Paper workflow needs both properties:

- researchers should open a Paper and read normal Markdown content in `paper.md`;
- citations, annotations, search, and parser repair still need stable block ids and machine-readable parser metadata.

## Decision

Successful parsing writes two durable artifacts:

```text
papers/<paper-slug>/paper.md       # canonical human-readable Paper note
papers/<paper-slug>/blocks.jsonl   # machine index for block lookup/citations
```

`paper.md` remains the canonical Paper entity. The parser replaces the Markdown body after frontmatter with a readable projection of normalized SourceBlocks. Each projected block is preceded by a hidden HTML comment anchor:

```markdown
<!-- tolaria:block id="b0001" page="1" kind="paragraph" hash="sha256:..." -->
Parsed paragraph text.
```

The anchor binds the rendered Markdown block to its SourceBlock id, page, kind, and stable hash. `blocks.jsonl` stays as the line-oriented lookup/index sidecar used by citation validation, search, outline generation, annotations, and future repair tooling. The two artifacts must be consistent after a successful parse.

`source.pdf` remains immutable provenance. `annotations.jsonl` stores user comments, highlights, questions, bookmarks, and underline marks by block id. Paper-local marginalia remains a separate Markdown `ResearchNote` under `papers/<paper-slug>/notes/`. User comments are never written into `paper.md`.

## Consequences

- Opening a parsed Paper can feel like opening a normal Tolaria note while preserving block-addressable citation and annotation semantics.
- Git diffs show both the human-readable parsed Paper note and the machine-readable block index.
- Reparse replaces parser-owned `paper.md` body content, so user-authored long-form notes must live in marginalia or other ResearchNotes, not inside parser-owned Paper body text.
- The Paper Reader should prefer anchored `paper.md` sections for the central reading surface and use `blocks.jsonl` as supporting index data.
- Missing or malformed `blocks.jsonl` remains recoverable, but a parsed `paper.md` with anchors is now useful reading material even when the sidecar needs repair.

## Alternatives Considered

- Keep `paper.md` as metadata only and render `blocks.jsonl` directly: rejected because it makes Paper reading feel unlike Tolaria's note model.
- Store comments inline in `paper.md`: rejected because user marginalia must remain distinguishable from source paper text and parser-owned projection.
- Remove `blocks.jsonl`: rejected because citations, validation, search, and repair need a stable machine index that does not depend on Markdown parsing.
