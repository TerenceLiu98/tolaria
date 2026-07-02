# ADR-0153: Paper-Local Marginalia Research Notes

## Status

Accepted

## Context

Phase 3B of `docs/NEW_PRD.md` requires the Paper Reader to connect reading to research note writing without introducing split-pane editing, AI, parser integration, a graph database, or another sidecar format. Paper annotations already live in `annotations.jsonl`, but free-form research thinking should remain ordinary Markdown so it participates in Tolaria's existing type, search, wikilink, Git, and editor behavior.

## Decision

Use a Paper-local Markdown note convention for marginalia:

```text
papers/<paper-slug>/notes/marginalia.md
```

The default Paper Reader action creates this note if it is missing and opens it if it already exists. The note frontmatter includes:

```yaml
---
type: ResearchNote
paper:
  - "[[papers/<paper-slug>/paper]]"
---
```

The initial body starts with `# Marginalia: <Paper title>` and the sections `Key Claims`, `Questions`, and `Notes`. When a SourceBlock is selected, the Reader may create the note with or append the canonical `@block[paper_id#block_id]` citation. The first implementation appends to the note through existing note-content commands instead of attempting cross-editor cursor insertion.

If the product later adds an explicit "Create New Paper Note" action, it should allocate `marginalia-2.md`, `marginalia-3.md`, and so on under the same `notes/` folder. The default action must remain create-or-open for `marginalia.md`.

## Consequences

- Marginalia notes are normal `ResearchNote` entries, so existing note browsing, editing, search, Git, and wikilink behavior applies.
- Paper bundles can contain user-authored notes without treating prose as parser output or sidecar state.
- The Paper Reader can append selected-block citations before split-pane editing exists.
- The convention keeps `source.pdf`, `paper.md`, `blocks.jsonl`, and `annotations.jsonl` immutable unless their dedicated workflows update them.

## Alternatives Considered

- Store marginalia in `annotations.jsonl`: rejected because annotations are structured marks, while research notes need full Markdown prose and existing note workflows.
- Store marginalia inside `paper.md`: rejected because the Paper note should stay focused on Paper metadata and source context.
- Create a generic vault-root ResearchNote: rejected because paper-local placement keeps imported source, sidecars, and reading notes discoverable together while frontmatter still provides semantic links.
