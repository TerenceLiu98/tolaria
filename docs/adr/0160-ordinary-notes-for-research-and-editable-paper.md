---
type: ADR
id: "0160"
title: "Ordinary notes for research and editable Paper Markdown"
status: active
date: 2026-07-03
---

# ADR-0160: Ordinary Notes for Research and Editable Paper Markdown

## Context

Paper has been realigned with Tolaria's files-first note model. Uploaded PDFs parse into `paper.md`, which now reads through the shared Note surface with PDF provenance and sidecars for block index and comments. Earlier Paper phases introduced a distinct ResearchNote/Marginalia direction for long-form synthesis, but that creates a special type and workflow where Tolaria's ordinary Note plus wikilink/backlink model is enough.

## Decision

**Long-form research notes are ordinary `type: Note` entries, and Paper Markdown is editable through the shared Note surface.**

Users connect research notes to Paper with existing wikilinks/backlinks and use `@block[paper_id#block_id]` only when they need exact block-level evidence. Paper comments remain stored in `annotations.jsonl` and are presented as ordinary comment threads on the shared Note surface.

## Options considered

- **Ordinary Note entries** (chosen): uses the existing note creation, backlink, search, and editing model without adding a dedicated research-note type.
- **Dedicated ResearchNote type**: rejected because it adds product taxonomy without distinct behavior after Marginalia was removed.
- **Paper-local Marginalia notes**: rejected by ADR-0158 because it duplicates ordinary note workflows and makes Paper feel like a separate reader app.
- **Read-only Paper Markdown**: rejected because Paper should behave like a parsed Markdown note once imported; `source.pdf` remains immutable provenance.

## Consequences

- There is no default `ResearchNote` Type document or Paper-specific research-note command.
- Users write research synthesis in normal Notes and link back to Paper with wikilinks/backlinks.
- Paper Markdown editing uses the same Note surface as ordinary notes, while comments remain sidecar-backed and do not write into `paper.md`.
- `blocks.jsonl` remains the durable machine index for citation/comment lookup even if a user edits the rendered Paper Markdown.
