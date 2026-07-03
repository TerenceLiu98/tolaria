# ADR-0159: Paper Reader Without Outline Column

## Status

Accepted

Supersedes the Paper Reader layout portion of ADR-0157 and ADR-0158. Those ADRs still define the comment seam, shared Note surface, and removal of marginalia-specific workflows.

## Context

The Paper implementation has moved from a standalone reader toward Tolaria's normal note model. Parsed PDFs become anchored Markdown in `paper.md`, and the Markdown reading mode mounts through the shared `NoteSurface`.

The previous Paper Reader layout kept a dedicated Paper Outline column beside the Reading View. That made sense while the reader was block-list centered, but it now competes with the note surface and keeps Paper feeling like a special PDF tool instead of a parsed Markdown note.

## Decision

Remove the standalone Paper Outline column from `PaperReaderShell`.

Paper Reader now keeps only:

- Metadata, parse status, and Markdown/PDF mode controls.
- Markdown Reading View backed by the shared `NoteSurface` in read/comment mode.
- PDF mode backed by the existing `FilePreview` path for `source.pdf`.
- Paper-specific comment wiring through `annotations.jsonl`.

`blocks.jsonl` remains a machine sidecar for citations, comments, validation, and block-focus lookup, but it is not presented as a user-facing outline panel.

## Consequences

- Paper reads more like a normal Tolaria note.
- The UI no longer spends horizontal space on a second navigation surface.
- Parser failure and missing-structure recovery still appear in the Reading View.
- Native PDF outline/bookmark display is deferred until there is a clear user-facing need that does not reintroduce a separate Paper app model.

## Alternatives Considered

- Keep a collapsible outline column: rejected because collapsed state still preserves a Paper-specific layout model.
- Move outline into the Note surface: deferred because ordinary Tolaria notes already have their own table-of-contents affordances.
- Remove `blocks.jsonl`: rejected because citations, comments, validation, and parser repair still need stable block ids.
