# ADR-0151: Paper Sidecar Files

## Status

Accepted

## Context

The PRD requires parsed paper blocks, annotations, graph data, Ask traces, and research memory to remain portable vault artifacts. These artifacts should be inspectable and versionable, but they should not turn caches or parser output into Tolaria's knowledge source of truth.

## Decision

Paper-local artifacts live beside the imported PDF and Paper note:

```text
papers/<paper-slug>/
  source.pdf
  paper.md
  blocks.jsonl
  annotations.jsonl
  ask-traces.jsonl
  graph.json
  memory.md
```

Phase 1 only creates `source.pdf` and `paper.md`. It records the canonical future sidecar filenames in frontmatter and exposes path helpers for `blocks.jsonl` and `annotations.jsonl`. Later phases may create the sidecars when parsing or annotation actions run.

## Consequences

- Sidecars are ordinary files that can be reviewed in Git and repaired by agents.
- Missing sidecars are valid for an unparsed/imported Paper.
- Parser caches, embeddings, and temporary files remain outside the vault unless a later ADR explicitly promotes a result to a durable artifact.
- The first import command can stay small: copy PDF, create `paper.md`, return canonical paths.

## Alternatives Considered

- Write empty JSONL sidecars during import: rejected because empty sidecars imply parsing or annotation work happened.
- Store parsed blocks inside `paper.md`: rejected because block output can be large and needs stable line-oriented updates.
- Store annotations in the PDF: rejected because `source.pdf` must remain immutable.
