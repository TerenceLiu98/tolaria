---
type: ADR
id: "0173"
title: "Project Canvas as a research organization layer"
status: proposed
date: 2026-07-09
---

# ADR 0173: Project Canvas as a Research Organization Layer

## Context

Sapientia is moving toward a Note-first research workspace:

- ordinary Notes hold user-authored thinking and writing
- Papers are editable Notes with source provenance, metadata, evidence blocks, and citations
- comments live outside Markdown bodies
- AI context should be assembled from the user's active research surface, not from an unrelated global dump

This leaves one missing product layer: a Project should organize research intent, papers, notes, claims, tasks, and evidence spatially. A linear Project note can describe the project, but it is not ideal for sensemaking across many Papers, Notes, and block citations.

We reviewed several infinite-canvas references:

- [Void](https://github.com/190km/void): a native Rust/wgpu infinite canvas terminal emulator with workspaces, panels, minimap, keyboard-first navigation, panel persistence, and viewport math.
- [tldraw](https://github.com/tldraw/tldraw): a React SDK for infinite canvas apps with custom shapes, tools, bindings, runtime editor API, images/video, snapping, collaboration primitives, and AI-oriented canvas patterns.
- [Excalidraw](https://github.com/excalidraw/excalidraw): a virtual whiteboard centered on sketching and hand-drawn diagrams.
- [AFFiNE](https://github.com/toeverything/AFFiNE): a local-first knowledge workspace combining document and edgeless/canvas thinking through BlockSuite.
- [JSON Canvas](https://jsoncanvas.org/): an open, readable, extensible `.canvas` format originally created for Obsidian and intended for long-lived user-owned infinite canvas data.

These references point to a common architecture: an infinite canvas should store spatial layout and references, not become the only source of truth for all content.

## Decision

Sapientia will treat Project Canvas as a research organization layer.

Project Canvas is not a replacement for Notes, Papers, the editor, or the Paper Catalog. It is a spatial view over existing local-first objects:

```text
Project = research workspace and intent
Canvas  = layout and relationship layer
Note    = user-authored content
Paper   = external evidence note with provenance
Block   = citeable source evidence
```

Each Project may have a canvas file. Canvas nodes reference existing objects whenever possible:

- ordinary Note
- Paper Note
- Paper block citation
- selected quote or comment anchor
- task
- short project card
- future Paper Candidate

The canvas owns position, size, grouping, viewport, and relation edges. It does not own long-form Markdown bodies.

## File Model

The preferred model is:

```text
projects/<project-id>/
  project.md
  project.canvas.json
```

For projects represented as a single Markdown file, an adjacent canvas file is also valid:

```text
projects/<project-id>.md
projects/<project-id>.canvas.json
```

`project.md` remains the primary editable Project Note. It holds project frontmatter and linear writing.

`project.canvas.json` stores spatial layout and relationships. It should remain local-first, Git-friendly, inspectable, and rebuildable enough that broken references degrade instead of corrupting user content.

## Canvas Data Contract

The Sapientia canvas format should stay close to JSON Canvas where practical, with Sapientia-specific metadata under an extension namespace.

Example:

```json
{
  "version": 1,
  "project": "projects/kan-autoencoders/project.md",
  "viewport": {
    "x": 0,
    "y": 0,
    "zoom": 1
  },
  "nodes": [
    {
      "id": "node_note_1",
      "type": "note",
      "ref": "notes/kan-research-question.md",
      "x": 120,
      "y": 80,
      "width": 360,
      "height": 220
    },
    {
      "id": "node_paper_1",
      "type": "paper",
      "ref": "papers/kan-autoencoders/paper.md",
      "x": 560,
      "y": 80,
      "width": 360,
      "height": 180
    },
    {
      "id": "node_block_1",
      "type": "paper_block",
      "ref": "@block[kan-autoencoders#b0042]",
      "x": 560,
      "y": 320,
      "width": 360,
      "height": 140
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "from": "node_block_1",
      "to": "node_note_1",
      "kind": "supports"
    }
  ],
  "sapientia": {
    "schema": "project-canvas/v1"
  }
}
```

Long-form content should be stored in a Note or Paper. Short labels, grouping names, and temporary cards may live in the canvas, but they are not a substitute for durable Notes when the user is writing research output.

## Product Behavior

Opening a Project may offer multiple coordinated views:

- Canvas: spatial research map
- Note: normal editable `project.md`
- Papers: related Paper Catalog subset
- Tasks: project-local or linked tasks

Canvas nodes can reference:

- a whole Note
- a whole Paper
- a Paper block citation such as `@block[paper_id#block_id]`
- a selected quote anchor
- a comment thread
- a future Paper Candidate from Paper Market

Edges express project-level relationships:

- `supports`
- `contradicts`
- `depends_on`
- `related`
- `needs_reading`
- `used_in_draft`
- `follow_up`

The relationship vocabulary should begin small and extensible. Users should be able to create unlabeled edges when classification is unnecessary.

## AI Context

Project Canvas should become a first-class AI context source.

When the active surface is a Project Canvas, AI context should prefer:

- selected node
- nearby connected nodes
- Paper metadata for referenced Papers
- snippets for cited Paper blocks
- linked Notes
- project frontmatter and project summary

AI should not read every node's full content by default. It should assemble compact, citation-safe context and then use Paper/Note tools for explicit deeper reads.

## Implementation Guidance

Sapientia should not start by copying Void's native Rust/wgpu renderer. Void is valuable for its viewport model, workspace persistence, minimap, panel lifecycle, and keyboard-first philosophy, but Sapientia already has a React/Tauri application and an existing tldraw-based whiteboard surface.

Near-term implementation should:

1. Define the Project Canvas file contract.
2. Reuse existing React canvas technology where possible.
3. Treat canvas nodes as references to existing Note/Paper/citation objects.
4. Persist viewport, node geometry, grouping, and edge metadata.
5. Keep Markdown Notes as the long-form content source of truth.
6. Keep Paper `blocks.jsonl` as the evidence source of truth.
7. Make missing references non-fatal and visibly stale.
8. Keep the storage format simple enough to diff in Git.

## Reference Lessons

### Void

Void demonstrates that an infinite canvas needs explicit viewport math, workspace state, panel persistence, minimap navigation, command palette integration, and keyboard-first controls. Its native GPU stack is not Sapientia's first implementation path, but its separation between canvas, panels, state, shortcuts, and command registry is a useful boundary model.

### tldraw

tldraw is the best near-term implementation reference for Sapientia because it is React-native and designed for custom shapes, bindings, tools, UI components, and runtime editor control. Sapientia should evaluate custom shapes for Note, Paper, Paper block, Candidate, and Task nodes before building a custom renderer.

### Excalidraw

Excalidraw is stronger as a sketching/diagramming reference than as the primary Project Canvas architecture. Sapientia should learn from its lightweight drawing UX, but Project Canvas needs durable object references more than hand-drawn diagram primitives.

### AFFiNE

AFFiNE validates the product direction of combining document and edgeless thinking in one knowledge workspace. Sapientia should learn from the document/canvas relationship, but avoid adopting a database/CRDT-heavy architecture unless collaboration becomes a priority.

### JSON Canvas

JSON Canvas is the strongest storage reference. Sapientia should stay close enough to JSON Canvas concepts that future import/export is plausible, while preserving Sapientia-specific object references and evidence citation metadata.

## Non-Goals

- Do not replace the normal Note editor with a canvas.
- Do not store long-form Paper or Note bodies inside the canvas file.
- Do not introduce a graph database.
- Do not implement real-time multiplayer collaboration in the first Project Canvas phase.
- Do not make every vault note part of a global canvas.
- Do not replace Paper Catalog or Paper Market with canvas-only UI.
- Do not build a native Rust/wgpu renderer before validating the product model.
- Do not remove Markdown, sidecars, wikilinks, backlinks, or `@block[...]` citations.

## Consequences

Positive:

- Projects become a natural organization layer for Notes, Papers, comments, tasks, and evidence.
- Paper and Note workflows converge without making Paper a separate reader app.
- AI context can be assembled from the user's actual research map.
- The storage remains local-first and inspectable.
- Sapientia gains a differentiated research workspace model beyond a file list or PDF reader.

Negative:

- Project Canvas adds another file format and stale-reference surface.
- Canvas performance needs careful limits for large projects.
- Custom node rendering can become complex if it tries to embed full editors or PDFs.
- A canvas can become visually noisy without good defaults, grouping, filtering, and search.

Neutral:

- Notes remain the main writing surface.
- Papers remain editable Notes with provenance.
- Paper sidecars remain useful for metadata, evidence, comments, and AI tools.
- Existing tldraw whiteboard work can inform the implementation but does not automatically become Project Canvas.

## Execution Plan

Project Canvas should be implemented as a sequence of small, reviewable slices. The important constraint is commit separation: stabilization work for Paper/comments/editor must land before Project Canvas work starts, and later Paper Market or AI recommendation work must not be mixed into the Canvas MVP.

### Commit Boundaries

Use separate commits for:

1. Current worktree stabilization: Paper comments, `comments.jsonl`, editor cleanup, MCP hardening, and documentation alignment.
2. Project Canvas data model and file commands.
3. Minimal Project Canvas view.
4. Add-to-Project entry points.
5. Relationship editing.
6. Project-aware AI context.
7. Future Paper Market integration.

Do not combine Paper parser, comment storage, AI panel, editor toolbar, or Git-provider changes with Project Canvas commits unless the change is strictly required for the current Canvas slice.

### Recommended Build Order

1. Stabilize the current Paper/comment/editor baseline.
2. Add pure data contracts first: TypeScript types, Rust structs, JSON schema expectations, and read/write tests.
3. Add command boundaries without UI: create/read/save/resolve canvas files.
4. Add a minimal Project Canvas view using existing React canvas technology.
5. Add node reference resolution and broken-reference rendering.
6. Add add-to-project flows from Notes, Papers, and `@block[...]` citations.
7. Add relationship edges and a compact inspector.
8. Add compact Project Canvas AI context only after the canvas is useful without AI.
9. Defer Paper Market candidate nodes until Paper Market exists.

### Technical Spike Checklist

Before coding Phase 2, do a short spike to decide:

- whether the existing tldraw surface can host durable Note/Paper/citation node shapes without fighting the current whiteboard feature set
- whether Project Canvas should be a separate view mode or a tab inside Project notes
- how node previews should be bounded so full editors, full PDFs, and full Paper bodies are not mounted inside every node
- how canvas viewport state should be saved without triggering excessive note saves
- whether JSON Canvas import/export compatibility should be explicit in the first schema version or deferred

The spike should produce a small decision note or update to this ADR before the full UI implementation starts.

### Data Model First Definition Of Done

Phase 1 is complete only when:

- a canvas file can be created for a Project
- the same file can be read back with stable ordering
- Note, Paper, Paper block, text, task, and group nodes round-trip
- relationship edges round-trip
- references resolve to existing vault entries when possible
- missing references produce structured stale-reference diagnostics
- no UI implementation depends on ad hoc JSON parsing outside the model layer

### UI MVP Definition Of Done

Phase 2 and Phase 3 together are the UI MVP. They are complete only when:

- a Project can open its canvas from the normal Project note surface
- a user can add a Note, Paper, and `@block[...]` citation to the canvas
- a user can move and resize nodes and see layout persist after reload
- clicking a node opens the referenced object through normal Sapientia navigation
- broken references render visibly without crashing the canvas
- the canvas does not mount full Note editors or PDF previews inside every node
- demo-vault QA data is cleaned before commit

### Performance Guardrails

The first implementation should assume large Projects can contain hundreds of nodes. Guardrails:

- render compact node previews, not full editors
- virtualize or otherwise avoid expensive previews when zoomed far out
- cache resolved metadata/snippets by stable reference
- debounce geometry saves
- avoid storing derived snippets inside the canvas file unless explicitly needed as a stale fallback
- keep Paper block reads bounded and provenance-rich

### AI Guardrails

Project Canvas AI context should be compact and evidence-oriented:

- selected node first
- nearby connected nodes second
- referenced Paper metadata before Paper bodies
- referenced block snippets before whole Paper reads
- explicit tools for deeper reads
- no automatic full-vault or full-paper dump
- exact `@block[...]` provenance for paper-grounded claims where possible

## Follow-Up Phases

### Phase 0: Stabilize The Current Worktree

Do not start Project Canvas implementation while Paper comments, comment sidecar naming, editor cleanup, MCP hardening, or Paper rename work is still half-finished.

Before starting Project Canvas:

1. Finish the active `comments.jsonl` / Paper comment cleanup.
2. Run the focused frontend and Rust tests for the touched Paper/comment paths.
3. Commit a clean checkpoint.
4. Keep Project Canvas commits separate from Paper, AI, and editor stabilization commits.

### Phase 1: Canvas Data Model

Goal: define the file format and command boundary before building UI.

Implement:

- `ProjectCanvas` TypeScript and Rust models.
- Canvas file discovery for both:
  - `projects/<project-id>/project.canvas.json`
  - adjacent `project.canvas.json` next to a Project Markdown note
- Node types:
  - `note`
  - `paper`
  - `paper_block`
  - `text`
  - `task`
  - `group`
- Edge types:
  - `related`
  - `supports`
  - `contradicts`
  - `depends_on`
  - `needs_reading`
- Commands:
  - `read_project_canvas`
  - `save_project_canvas`
  - `create_project_canvas`
  - `resolve_project_canvas_refs`

Tests:

- read/write round trip
- stable JSON ordering for Git diffs
- missing references degrade instead of failing the whole canvas
- canonical and adjacent canvas file discovery

### Phase 2: Minimal Canvas View

Goal: a Project can open a canvas, show referenced objects, and persist layout.

Implement:

- a Project Canvas tab or view mode on Project notes
- compact node cards:
  - Note: title and snippet
  - Paper: title, authors/year, and metadata state if available
  - Paper block: `@block[...]` citation and source snippet
  - Text/task: short editable card content
- pan and zoom
- drag node
- resize node
- persist viewport and node geometry
- click node to open referenced Note/Paper/block target
- stale/broken reference state

Avoid in this phase:

- full editor embedded inside nodes
- PDF preview inside nodes
- real-time collaboration
- graph database
- complex auto-layout

### Phase 3: Add To Project Flows

Goal: Notes, Papers, and evidence blocks can naturally enter a Project Canvas.

Entry points:

- Note context menu: Add to Project
- Paper context menu: Add to Project
- Paper block/citation action: Add block to Project
- AI panel result or cited answer: Add to Project

Implement:

- Project picker
- automatic canvas creation when the target Project lacks one
- default placement near the current viewport center
- duplicate handling: focus an existing node for the same ref instead of creating duplicates

Tests:

- add Note to Project Canvas
- add Paper to Project Canvas
- add `@block[...]` to Project Canvas
- duplicate add focuses the existing node

### Phase 4: Relationship UX

Goal: make the canvas useful for research reasoning, not just spatial bookmarks.

Implement:

- edge creation between nodes
- optional edge kind selector
- default unlabeled edge
- edge inspector with:
  - source node
  - target node
  - relationship kind
  - optional note
- delete edge
- delete node without deleting the referenced Note/Paper/block

The relationship vocabulary should remain small and extensible. Do not force users to classify every edge.

### Phase 5: Project-Aware AI Context

Goal: AI should understand the active research map without reading the entire vault.

Add Project Canvas to AI context assembly:

- active Project id
- selected canvas node
- nearby connected nodes
- referenced Paper metadata
- referenced `@block[...]` snippets
- linked Note snippets or summaries

Add debug/context visibility:

- Project canvas context included
- selected node
- referenced Papers count
- cited blocks count
- stale references count

Add or extend tools:

- `read_project_canvas`
- `search_project_canvas`
- `read_project_context`
- `add_node_to_project_canvas`

Rules:

- keep context compact by default
- do not read every Paper body automatically
- paper-grounded claims should still cite exact block provenance when available
- mounted Paper vaults remain read-only unless another ADR changes write scope

### Phase 6: Paper Market Integration

Goal: later Paper discovery should feed into Projects without auto-importing everything.

When Paper Market exists:

- Paper Candidates can appear as `candidate` nodes
- user can import, save, dismiss, or link a candidate to a Project question/claim
- AI recommendations can explain why a candidate belongs on a Project Canvas
- dismiss/import decisions should remain durable signals for future recommendations

This phase should not be part of the initial Project Canvas MVP.

## Minimal MVP Acceptance Criteria

The first Project Canvas implementation is complete when:

- a Project can have a `.canvas.json` file
- the canvas can contain Note, Paper, and Paper block nodes
- clicking a node opens the underlying object
- moving/resizing nodes persists layout
- the canvas does not store long-form Note or Paper bodies
- broken references are visible but non-fatal
- AI can see selected node plus compact referenced Paper/block context
