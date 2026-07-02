# ADR-0150: Paper Vault Entity Model

## Status

Accepted

## Context

`docs/NEW_PRD.md` defines the research edition as a Tolaria-native layer, not a port of Sapientia's web backend. Papers need to be first-class vault entities while preserving Tolaria's files-first, Git-first, Markdown-frontmatter model.

Tolaria already treats Type documents as root Markdown files and supports ordinary nested vault files, including PDFs, through the existing scanner and file preview architecture.

## Decision

Represent each research paper as a Markdown Paper note at:

```text
papers/<paper-slug>/paper.md
```

The Paper note owns the durable metadata:

```yaml
---
type: Paper
paper_id: <paper-slug>
title: <paper title>
status: imported
parse_status: unparsed
source_pdf: source.pdf
blocks: blocks.jsonl
annotations: annotations.jsonl
---
```

The original PDF is copied into the same folder as `source.pdf` and is never modified. A root `paper.md` Type document defines the Paper sidebar section, icon, color, new-note template, and list chips.

## Consequences

- Paper rows use the existing Type section/list behavior instead of a custom collection.
- Paper metadata remains human-readable and Git-diffable.
- Importing a PDF creates ordinary vault files, so Git status and existing file previews work without a new storage layer.
- Folder location identifies the paper bundle convention, but `type: Paper` remains the semantic source of truth.

## Alternatives Considered

- Store papers in an app database: rejected because the PRD requires vault files as source of truth.
- Treat PDFs alone as Paper entities: rejected because PDFs cannot hold Tolaria metadata, notes, sidecar pointers, or type behavior.
- Put all Paper notes at vault root: rejected for imported PDFs because paper-local sidecars need a clear folder boundary.
