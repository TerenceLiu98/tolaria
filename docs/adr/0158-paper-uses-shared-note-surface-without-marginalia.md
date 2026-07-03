# ADR-0158: Paper Uses Shared Note Surface Without Marginalia

## Status

Accepted

Supersedes [ADR-0153](./0153-paper-local-marginalia-research-notes.md) for the Paper Reader product workflow. It also narrows the Paper-local marginalia consequences in [ADR-0156](./0156-paper-markdown-projection.md) and [ADR-0157](./0157-note-editor-comment-seam-for-paper.md): Reading View switches only between Markdown and PDF, and long-form notes are ordinary `ResearchNote` entries instead of a special Reader workflow.

## Context

Tolaria's core product model is a local-first Markdown note vault. After PDF parsing, a Paper should feel like a parsed Markdown note with provenance sidecars, not like a separate reader application. The Paper Reader had accumulated a Paper-local marginalia workflow with a dedicated `marginalia.md` template, in-shell preview, and append-selected-block actions. That duplicated ordinary note behavior and made Paper reading feel less native to Tolaria.

Paper still needs Paper-specific sidecars:

- `source.pdf` remains immutable provenance.
- `blocks.jsonl` remains the machine index for citations, outline, search, and repair.
- `annotations.jsonl` remains the durable comment/highlight/question sidecar.

Long-form synthesis does not need a Paper-specific command path. Users can create ordinary `ResearchNote` notes and cite Paper blocks with `@block[paper_id#block_id]`.

## Decision

Remove the Marginalia product workflow from Paper Reader:

- no Marginalia mode;
- no Marginalia pane;
- no Create/Open Marginalia action;
- no Add Selected Block to Marginalia action;
- no Paper-specific `marginalia.md` template or helper module.

Mount Paper Markdown through the shared note surface:

- ordinary notes continue to use `NoteSurface` as an editable `SingleEditorView` wrapper;
- Paper Markdown mode uses the same `NoteSurface` in read-only/comment mode;
- `PaperReaderShell` remains a thin wrapper for Paper metadata, parse status, heading outline, search, Markdown/PDF mode switching, source PDF actions, selected block state, and Paper annotation wiring.

Paper comments continue to persist through `annotations.jsonl` via the Paper comment provider. Comment create/edit/delete actions must not write comments into parser-owned `paper.md`.

## Consequences

- Paper Reading View reuses ordinary Tolaria note rendering, including wikilinks, math, citations, theme behavior, and future note-surface improvements.
- The Paper shell is smaller and Paper-specific UI is limited to Paper metadata, outline, PDF mode, parse status, and sidecar-backed comments.
- ResearchNotes remain generic notes. Users can create them anywhere in the vault and include block citations manually or through future generic citation insertion commands.
- Generic comments for ordinary notes are still deferred until Tolaria has durable anchors for user-authored Markdown notes.

## Alternatives Considered

- Keep Marginalia as a Paper-local workflow: rejected because it duplicates normal note creation and keeps Paper feeling like a separate reader app.
- Write user synthesis into `paper.md`: rejected because `paper.md` body is parser-owned and can be replaced by reparse.
- Enable comments for all notes immediately: rejected because normal notes still lack stable durable anchors comparable to parsed Paper block anchors.
