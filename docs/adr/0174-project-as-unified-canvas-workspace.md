---
type: ADR
id: "0174"
title: "Project as a unified canvas workspace"
status: proposed
date: 2026-07-10
supersedes:
  - "0173"
---

# ADR 0174: Project as a Unified Canvas Workspace

## Context

ADR 0173 established Project Canvas as a local-first spatial organization layer over Notes, Papers, evidence, tasks, and relationships. It deliberately kept the normal Project Note and Project Canvas as separate coordinated views:

- `project.md` was the default linear Project Note
- `project.canvas.json` was an optional Canvas view
- Canvas nodes rendered bounded previews and navigated to separate Note or Paper surfaces
- full editors were not mounted inside Canvas nodes

That separation made the first implementation safe and kept Markdown as the source of truth, but it does not match the intended Project experience. A Project should be the place where research work happens. Users should be able to organize, read, and edit related Notes and Papers without repeatedly leaving the Project for separate document tabs.

The desired product model is:

```text
Project = one canvas-backed research workspace
```

It is not:

```text
Project = independent Project Note + optional Canvas tab
```

AFFiNE demonstrates the product value of combining document and edgeless work in one workspace. Sapientia should learn from that interaction model while retaining its existing Markdown, BlockNote, Paper sidecar, Git, and local-file architecture. Sapientia will not adopt BlockSuite or make Canvas JSON the source of truth for document bodies.

## Decision

Sapientia will represent a Project as one unified Canvas workspace.

Opening a `type: Project` entry always opens the Project Canvas. The current `Note | Canvas` mode switch is removed. The Project Markdown body remains available inside the Canvas through a required Project Overview node backed directly by `project.md`.

The user experiences one Project object and one save state. Internally, document content and spatial layout remain separate persistence concerns:

```text
projects/<project-id>/
  project.md
  project.canvas.json
```

- `project.md` stores Project identity, frontmatter, and the editable Project Overview body.
- `project.canvas.json` stores viewport, geometry, grouping, relationships, and references.
- referenced Notes and Papers keep their bodies in their own Markdown files.
- Paper evidence and comments remain in their existing sidecars.

These files are not exposed as two independent product surfaces. They are two persistence layers for one Project workspace.

## Superseded ADR 0173 Decisions

This ADR supersedes the following ADR 0173 decisions:

- the normal Project Note is the default Project surface
- Canvas is an optional tab or separate Project view mode
- clicking a Note or Paper card should normally leave Canvas and navigate to a separate editor
- Canvas nodes may never host an editable document surface

This ADR retains the following ADR 0173 decisions:

- Markdown files remain the source of truth for long-form content
- Canvas owns layout and relationships, not Note or Paper bodies
- Notes, Papers, Paper blocks, images, tasks, text, and groups remain first-class node kinds
- references degrade visibly when stale instead of corrupting the Canvas
- deleting a Canvas node does not delete the referenced file
- the storage remains local-first, inspectable, Git-friendly, and deterministic
- Project AI context remains bounded and evidence-oriented

## Unified Project Model

The logical model is:

```text
Project
├── Project Overview   -> project.md
├── Spatial layout     -> project.canvas.json
├── Note nodes         -> existing Markdown Notes
├── Paper nodes        -> existing editable Paper Notes
├── Evidence nodes     -> @block[...] citations
├── Image nodes        -> referenced local assets
├── Task nodes         -> canvas-local or future durable task objects
└── Relationships      -> project.canvas.json edges
```

The Project Overview is the root document of the workspace. It is not a separate page or tab. It appears as a normal editable document node on the Canvas and writes directly to `project.md`.

The Overview node:

- is created with every new Project
- can be moved, resized, collapsed, and focused
- cannot be removed from its Project Canvas
- uses the shared Note editing surface
- supports Markdown, formatting, wikilinks, math, images, backlinks, and selected-text AI context
- participates in Project-aware AI context as the Project's primary intent and narrative

## Project Creation Flow

Creating a Project should require only a title. An optional template may initialize useful nodes and relationships.

Initial templates:

- Blank
- Literature Review
- Experiment Planning

Creation writes `project.md` and `project.canvas.json`, then opens the unified Canvas immediately. The initial Canvas contains a Project Overview node and compact quick actions:

- New Note
- Add Existing Note
- Add Paper
- Add Evidence
- Add Task

There is no intermediate empty Project Note and no separate action required to create or enter Canvas mode.

## Workspace Layout

The Project workspace reuses Sapientia's existing quiet, work-focused visual language:

```text
┌ Projects / Project title          Search  AI  Fit  More ┐
├──────────────┬─────────────────────────────┬──────────────┤
│ Project Nav  │                             │ Inspector    │
│              │      Infinite Canvas        │              │
│ Overview     │                             │ Project      │
│ Papers       │  [Overview] -> [Paper]      │ summary      │
│ Notes        │                    |        │              │
│ Evidence     │              [Evidence]     │ Node props   │
│ Tasks        │                    |        │ Comments     │
│              │              [Active Note]  │ Metadata     │
├──────────────┴─────────────────────────────┴──────────────┤
│ Select  Hand  Note  Paper  Evidence  Task  Connect       │
└───────────────────────────────────────────────────────────┘
```

The left Project navigator is a compact index over objects already present in the Project. It is not a second source of membership. Selecting an item focuses its Canvas node.

The right Inspector is contextual:

- no selection: Project summary and counts
- Project Overview or Note: properties, backlinks, Project membership, and document actions
- Paper: bibliographic metadata, source PDF, parse action, evidence, and comments
- evidence: source Paper, block id, page provenance, citation, and stale state
- task: completion state and related objects
- edge: relationship type, note, and deletion action

## Document Node Interaction States

Note, Paper, and Project Overview nodes use three rendering states.

### Overview State

At low zoom, a document node renders only lightweight identifying information:

- title
- type icon
- Paper author/year when relevant
- compact status indicators

This semantic zoom state avoids shrinking full document text into unreadable content.

### Preview State

At normal zoom, a document node renders a bounded, lightweight Markdown preview. It does not mount BlockNote. Images are lazy-loaded and long content is truncated or independently scrollable only when explicitly expanded.

### Edit State

Double-clicking a document node or pressing `Enter` activates in-place editing. The active node mounts the shared `NoteSurface`, including the normal BlockNote toolbar and document behaviors.

Only one Canvas document node mounts a live `NoteSurface` at a time. Other document nodes remain lightweight previews. This single-editor rule is a required performance and focus boundary, not merely an optimization.

`Escape` exits editing and returns to node selection. Pressing `Escape` again clears the selection.

## Canvas Editor Portal

The Canvas will use one shared editor portal rather than constructing one editor per document node.

Conceptual component boundaries:

```text
ProjectWorkspaceSurface
├── ProjectNavigator
├── ProjectCanvasViewport
│   ├── CanvasDocumentPreview
│   ├── CanvasEvidenceNode
│   ├── CanvasTaskNode
│   └── CanvasEditorPortal
├── ProjectWorkspaceInspector
└── ProjectWorkspaceToolbar
```

`CanvasEditorPortal` owns the only live editor instance and binds it to the active document reference. Changing the active document must use the existing editor content-swap and save boundaries rather than creating parallel BlockNote editors.

The portal must preserve:

- correct save-before-switch behavior
- editor focus and selection ownership
- Markdown round-trip behavior
- wikilink navigation
- image and attachment behavior
- inline math and toolbar behavior
- comment selection actions where enabled
- selected text and attachment context for AI
- bounded memory when a Canvas contains many documents

## Focus Mode

Long-form reading and editing can expand the active node into Focus Mode. Focus Mode fills the central workspace but remains inside the Project navigation context.

Closing Focus Mode restores the previous Canvas viewport and active node position. It does not open or close a separate Note tab.

On narrow windows, editing may enter Focus Mode automatically to avoid unusable nested surfaces.

## Canvas Navigation

Project navigation should keep the user inside the active Project whenever practical.

### Existing Canvas Target

When a wikilink, backlink, citation, search result, or Project navigator item points to an object already present on the Canvas, Sapientia pans to and selects that node. When the navigation includes a Paper block id, the Paper node enters its readable state and scrolls to the matching anchor.

### Target Not Yet In The Project

When the target is not present, Sapientia opens a temporary Peek node adjacent to the source node. A Peek node:

- can be read and edited through the same editor portal
- is visually marked as temporary
- does not mutate `project.canvas.json` until pinned
- can be pinned to add it permanently to the Project
- can be closed without deleting or modifying the underlying Note or Paper

Editing a Peek node still saves the underlying Markdown file. Temporary status applies only to Project membership and layout.

### Standalone Document Escape Hatch

An explicit action may open a Note or Paper in the ordinary standalone editor when the user intentionally wants to leave Project context. It is not the default behavior for Project navigation.

## Notes And Papers

Notes and Papers share the same editable Canvas document surface. `type: Paper` adds capabilities rather than a different editor:

- metadata
- source PDF
- parse or reparse
- source block evidence
- block citations
- Paper comments
- Paper-aware AI tools

Source PDF viewing is auxiliary. It should open in Focus Mode as a switchable or split source-verification view. PDF viewers must not remain mounted in every Paper node.

## Evidence Nodes

An `@block[...]` citation is a first-class Evidence node. It renders compact provenance:

- source Paper title
- exact source snippet
- page when available
- canonical citation
- stale or missing state

Activating an Evidence node focuses the corresponding Paper node and source block when that Paper is already in the Project. Otherwise it opens a temporary Paper Peek node at the correct source block.

Evidence can be connected to Notes, claims, tasks, and other evidence with relationships such as `supports`, `contradicts`, `related`, and `used_in_draft`.

## Comments

Comments remain outside Markdown and retain their file-backed source of truth.

When a Paper node is actively edited, text selection exposes the existing comment action. Comment markers render relative to the active editor only. Thread details may use the right Inspector so that comment UI is not clipped or incorrectly scaled by the Canvas transform.

Comment actions must never write comment text into `paper.md`, `project.md`, or an ordinary Note body.

## Membership And Deletion

Project membership is represented by presence in `project.canvas.json`, not by moving files into a Project-owned database.

- one Note or Paper may appear in multiple Projects
- adding an existing object creates a reference node
- removing a node removes only Project membership and layout
- deleting the underlying file remains a separate, explicit action
- adding the same stable reference again focuses the existing persistent node
- a Peek node may coexist temporarily without creating duplicate persistent membership

Notes created from inside a Project are ordinary Markdown Notes. Their default location may be project-scoped by convention, but the files remain normal vault objects and may be linked or mounted elsewhere.

## Save And Undo Semantics

The UI presents one Project save state even though persistence has separate domains:

- document edits save the referenced Markdown file
- geometry, grouping, edges, and viewport save `project.canvas.json`

Switching the active editor node must flush the current document before loading another document. Canvas layout saving must remain debounced and must not trigger document saves or editor remounts.

Undo and redo remain domain-aware:

- while editing, undo operates on document history
- while manipulating Canvas objects, undo operates on Canvas history
- focus determines the active history without requiring separate user-visible modes

## AI Context

The Project Canvas is the primary context boundary for Project-aware AI.

Default context remains compact:

1. active or selected node
2. connected one-hop nodes
3. Project Overview summary
4. referenced Paper metadata
5. exact selected Evidence snippets
6. task and stale-reference summaries

AI must use explicit tools before reading whole Notes or Papers. Generated research output should be created as a preview or temporary Note node so the user can review and pin it into the Project.

## Performance Guardrails

The unified workspace must support Projects with hundreds of nodes without mounting hundreds of editors or source viewers.

Required guardrails:

- at most one live BlockNote editor in the Canvas
- viewport culling or virtualization for offscreen nodes
- semantic zoom with overview cards at low zoom
- lightweight cached Markdown previews
- lazy-loaded images and Paper assets
- no persistent PDF viewer outside active Focus Mode
- debounced geometry and viewport persistence
- cached reference resolution keyed by stable path and modification identity
- no full-Paper or full-Note reads merely to render distant nodes

## Accessibility And Input Model

Primary interactions:

- single click: select node
- double click or `Enter`: edit document node
- `Escape`: exit editing, then clear selection
- `Space` plus drag: pan Canvas
- `Cmd/Ctrl+K`: add or find a Project object
- `Cmd/Ctrl+Enter`: enter or exit Focus Mode
- `Delete`: remove selected Canvas membership, not the underlying document
- explicit standalone-open command: leave Project context for the normal document editor

Mouse, trackpad, and keyboard paths must all be supported. Canvas zoom must not interfere with editor text selection, toolbar interaction, comment actions, or document scrolling.

## Data Contract Evolution

The existing `project-canvas/v1` contract can remain readable. A schema revision should add only the state necessary for the unified workspace, for example:

- a stable required Overview node identity
- document presentation state such as `overview`, `preview`, or `collapsed`
- optional Focus Mode restoration state
- optional Peek state kept in memory only, not persisted

Long-form Markdown, rendered snippets, editor JSON, and Paper bodies must not be copied into Canvas JSON.

The Project and Canvas files should reference each other unambiguously so a partial or stale bundle produces a recoverable diagnostic rather than two apparently unrelated objects.

## Migration

Existing Project Notes and Canvas files remain valid.

Migration behavior:

1. Opening an existing Project enters the unified Canvas.
2. If no Canvas exists, create one without changing `project.md` content.
3. If no Project Overview node exists, add one referencing the current `project.md`.
4. Preserve all existing nodes, edges, geometry, and viewport state.
5. Remove the user-facing `Note | Canvas` switch.
6. Route searches and backlinks targeting the Project to its Overview node.
7. Keep a temporary standalone Project Note fallback only during migration and remove it after Canvas editing is stable.

No migration should copy `project.md` into Canvas JSON or rewrite referenced Note and Paper bodies.

## Implementation Phases

### Phase 1: Unified Project Shell

- replace `ProjectEditorSurface` mode switching with `ProjectWorkspaceSurface`
- always open Project entries in Canvas
- create and resolve the required Project Overview node
- route Project search and navigation to that node
- preserve current Canvas storage and card interactions

### Phase 2: Lightweight Document Previews

- introduce semantic zoom states
- render bounded Note and Paper Markdown previews without BlockNote
- virtualize or cull offscreen previews
- preserve stale-reference behavior

### Phase 3: Single Canvas Editor Portal

- mount one shared `NoteSurface` for the active Overview, Note, or Paper node
- implement flush-before-switch and correct selection ownership
- support in-place editing, resize, scroll, and save
- keep all inactive nodes as previews

### Phase 4: Focus And Source Workflows

- add Focus Mode
- add Paper source PDF and metadata actions
- retain Paper comments and citation navigation
- restore Canvas viewport when Focus Mode closes

### Phase 5: In-Canvas Navigation

- focus existing nodes for wikilinks, backlinks, and citations
- add temporary Peek nodes for external targets
- add pin and close behavior
- support exact Paper block navigation

### Phase 6: Project-Aware Output

- create AI-generated drafts as temporary Note nodes
- use selected nodes and relationships as bounded context
- preserve exact evidence citations
- require user review before pinning generated output

## Test Expectations

Focused tests should cover:

- creating a Project creates one unified workspace and Overview node
- opening a Project enters Canvas without a separate Note tab
- editing the Overview node updates `project.md`
- editing a Note or Paper node updates only its referenced Markdown file
- switching active nodes flushes the previous document before loading the next
- only one live `NoteSurface` is mounted
- Canvas geometry saves do not mutate Markdown bodies
- document saves do not rewrite Canvas layout
- deleting a Canvas node does not delete its target file
- existing wikilink targets focus existing nodes
- missing targets open temporary Peek nodes without persisting membership
- pinning a Peek node persists one deduplicated reference
- Paper block citations navigate to the correct Paper and anchor
- comments remain in their sidecar and do not mutate Markdown
- existing Project Canvas files migrate without losing nodes or edges
- large or zoomed-out Projects use lightweight previews rather than live editors

## Consequences

### Positive

- Project becomes the primary place for research work rather than another Note type.
- Users can organize, read, and edit Notes and Papers without leaving Project context.
- Project narrative and spatial organization feel like one product object.
- Markdown, Paper sidecars, backlinks, wikilinks, and Git remain intact.
- the single-editor portal provides an explicit memory and focus boundary.
- Project-aware AI can operate on the user's visible research structure.

### Negative

- editor focus, scrolling, Canvas gestures, and save ordering become more complex.
- temporary Peek nodes introduce transient state that must be clearly distinguished from persistent membership.
- a Project may become visually noisy without semantic zoom, grouping, search, and good defaults.
- Project Canvas schema and migration logic become more important.
- Focus Mode and source PDF behavior require careful portal and clipping management.

### Neutral

- two physical files remain because document content and layout have different storage needs.
- Notes and Papers remain usable outside Projects.
- one Note or Paper may be referenced by multiple Projects.
- the existing Paper Catalog and AI/MCP tools remain useful.

## Non-Decisions

This ADR does not decide:

- real-time collaboration
- replacing BlockNote or adopting BlockSuite
- a graph database
- mobile infinite-canvas editing
- Paper Market or Candidate nodes
- generic comments for all Notes
- whether project-created Notes must live under the Project directory
- automatic layout based on AI

Those concerns require separate decisions after the unified Project workspace is stable.
