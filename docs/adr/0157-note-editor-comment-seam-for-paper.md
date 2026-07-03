# ADR-0157: Note Editor Comment Seam for Paper

## Status

Accepted

Supersedes the standalone Paper-only comment UI direction from ADR-0156 for the comment surface. ADR-0156 still defines the Paper Markdown projection and sidecar file model.

## Context

Tolaria's core reading and writing surface is the Markdown note. The Paper implementation now parses PDFs into anchored `paper.md` Markdown, but the first rendered Paper comment UI was embedded directly in `PaperReaderShell`. That made block comments work for Papers, but it kept the UI model too Paper-specific and made it harder to later add comments to ordinary notes.

Paper comments also have stricter storage needs than future generic note comments:

- Paper anchors already exist through parser-owned `tolaria:block` comments.
- Paper comment persistence must continue to use `annotations.jsonl`.
- Normal notes do not yet have a durable generic block-anchor contract.

## Decision

Introduce a generic frontend comment seam:

- `CommentProvider` defines listing, creating, updating, deleting, and resolving comments by anchor id.
- `CommentGutter`, `CommentThreadPanel`, and `CommentComposer` are reusable UI components that know about comment display and interaction, not Paper sidecar files.
- `PaperCommentProvider` adapts `PaperAnnotation` records from `annotations.jsonl` into generic comments keyed by parsed Paper block ids.

For this phase, only Paper uses the seam. Paper Markdown mode renders anchored `paper.md` as a continuous note-like surface, attaches generic gutter markers to block anchors, and delegates persistence back to the existing annotation helpers. The source `paper.md` text is read/comment-only in this surface; comment creation, edits, and deletes never write comments into `paper.md`.

The Paper Reader layout is now two-pane at the top level: Paper Outline plus Reading View. The outline is derived from heading blocks. Reading View can show the anchored Markdown note projection, the source PDF preview, or the marginalia preview/actions without showing all three panes at once.

## Consequences

- Paper comments are no longer hardcoded as a one-off Reader widget; the UI and provider boundary can be reused by future note comments.
- `annotations.jsonl` remains the Paper comment storage contract, preserving source/user separation.
- Generic note comments are intentionally deferred until Tolaria has a durable anchor model for normal notes.
- PDF preview remains an alternate reading mode instead of a permanent third pane.

## Alternatives Considered

- Keep Paper comments fully embedded in `PaperReaderShell`: rejected because it blocks reuse for normal note comments.
- Write comments into `paper.md`: rejected because parser-owned source projection and user marginalia must stay separate.
- Enable comments for all notes immediately: rejected because normal notes do not yet have stable durable block anchors comparable to parsed Paper blocks.
