# ADR 0172: Paper Comments JSONL Contract

Status: Accepted
Date: 2026-07-09

## Context

Earlier Paper Reader iterations stored user reading marks in `comments.jsonl`.
That model mixed several product concepts:

- comments
- highlights
- questions
- bookmarks
- underline marks
- semantic colors such as important, pending, or conclusion

Sapientia now uses the normal BlockNote editor surface for Paper notes. Inline
formatting and highlighting belong to the editor/Markdown document model, not to
a Paper sidecar. Paper sidecars should only store comment thread data that is
kept outside `paper.md`.

## Decision

New Paper comment writes use `comments.jsonl`.

The durable sidecar model is comment-only. Each line is one JSON object whose
allowed top-level comment semantics are:

- `kind: "comment"`
- thread replies
- reactions
- resolved/open state through `resolved_at`
- update/delete timestamps

The old comment-style kinds are no longer part of the current model:

- `highlight`
- `underline`
- `question`
- `bookmark`

Semantic comment colors are also removed from the Paper comment schema.
Records containing deprecated `color` fields or non-comment kinds are invalid in
the current reader/writer.

## Compatibility

The existing Tauri command names remain temporarily:

- `read_paper_comments`
- `save_paper_comment`
- `delete_paper_comment`
- `reset_paper_comments`

Those names are compatibility API names only. They now read and write
`comments.jsonl` and validate the comment-only schema. A future cleanup may
rename the commands and TypeScript helpers, but that rename is not required for
the storage contract.

Existing historical ADRs and docs may mention `comments.jsonl` because they
describe earlier decisions. Current implementation docs should describe
`comments.jsonl` as the active sidecar.

## Consequences

### Positive

- Paper comments are clearly separated from Paper text.
- BlockNote remains responsible for rich text formatting and highlighting.
- Comment threads can grow toward replies, reactions, and resolve state without
  carrying unused comment palette concepts.
- New sidecars have a simpler schema and fewer UI states.

### Negative

- Existing bundles with legacy `comments.jsonl` need an explicit migration or
  user-side cleanup if those comments should be preserved.
- Internal function names still contain comment terminology until a separate
  rename pass is done.

### Neutral

- `paper.md`, `source.pdf`, `blocks.jsonl`, and `metadata.json` are unchanged.
- Generic comments for ordinary Notes still need durable note anchors before
  being enabled outside Paper.
