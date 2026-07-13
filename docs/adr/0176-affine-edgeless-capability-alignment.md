---
type: ADR
id: "0176"
title: "AFFiNE Edgeless capability alignment without storage convergence"
status: proposed
date: 2026-07-13
---

# ADR 0176: AFFiNE Edgeless Capability Alignment Without Storage Convergence

## Context

ADR 0174 makes every Project one unified Canvas workspace. ADR 0175 introduces a
Sapientia-owned Canvas engine whose responsibility boundaries are inspired by
AFFiNE. Those decisions establish a sound engine and product shell, but they do
not establish feature parity with AFFiNE Edgeless.

The distinction matters. AFFiNE describes documents, Canvas, and tables as a
merged experience and supports rich text, sticky notes, embedded pages,
databases, linked pages, shapes, and slides on its Canvas. Its current graphics
packages include brush, connector, group, link, mind map, note, pointer, shape,
template, text, and turbo-renderer modules. Its block packages additionally
include attachments, bookmarks, databases, embeds, frames, images, LaTeX, and
tables.

Primary reference snapshot, reviewed on 2026-07-13:

- [AFFiNE repository](https://github.com/toeverything/AFFiNE)
- [AFFiNE graphics modules](https://github.com/toeverything/AFFiNE/tree/canary/blocksuite/affine/gfx)
- [AFFiNE block modules](https://github.com/toeverything/AFFiNE/tree/canary/blocksuite/affine/blocks)
- [BlockSuite graphics framework](https://github.com/toeverything/AFFiNE/tree/canary/blocksuite/framework/std/src/gfx)

Sapientia intentionally has a different source-of-truth model:

- Markdown files own Project Overview, Note, and Paper bodies.
- BlockNote owns rich-document editing behind the editor adapter boundary.
- Paper sidecars own metadata, source blocks, and comments.
- `project.canvas.json` owns spatial membership, geometry, relationships, and
  viewport state.
- Git-friendly files, rather than a shared CRDT document, are the durable
  collaboration and history substrate.

Consequently, "follow AFFiNE" cannot mean copying BlockSuite, adopting Yjs, or
moving document bodies into Canvas JSON. It must mean an explicit capability
comparison with intentional adaptations and divergences.

## Decision

**Sapientia will use AFFiNE Edgeless as the capability and interaction reference
for Project Canvas, while preserving Sapientia's Markdown, BlockNote, Paper, and
Git ownership contracts. Alignment will be tracked per capability rather than
claimed for the product as a whole.**

ADR 0176 extends ADR 0175; it does not supersede it. ADR 0175 continues to own
the engine boundaries. This ADR decides which AFFiNE capabilities should be
matched, adapted, kept intentionally different, or deferred to a separate
product decision.

No implementation may be described as "AFFiNE parity", "full Edgeless parity",
or equivalent while any relevant capability remains partial or deferred.

## Classification

| Class | Meaning | Acceptance rule |
|---|---|---|
| `ALIGN` | Match the observable Edgeless interaction or quality bar | Browser and native tests demonstrate equivalent outcomes for Sapientia objects |
| `ADAPT` | Provide the same user outcome through Sapientia-owned architecture | Tests demonstrate the outcome and protect the Sapientia ownership boundary |
| `DIFFER` | Preserve an intentional product or storage difference | Regression tests ensure future parity work does not erase the difference |
| `DEFER` | Valuable reference capability, but not part of the current Project Canvas commitment | Requires a separate product/architecture decision before implementation |

`DEFER` does not mean "silently planned". It means the capability is visible in
the comparison but does not block acceptance of the scoped alignment phases.

Implementation state uses these labels:

- `ready`: the capability exists and has acceptance evidence;
- `partial`: a production path exists but does not yet meet this ADR's bar;
- `missing`: no production capability meets the row;
- `intentional`: the declared difference is already present and must remain.

## Capability Matrix

### Engine, Rendering, And Scale

| Capability | AFFiNE reference behavior | Sapientia target | Class | State at decision |
|---|---|---|---|---|
| Headless graphics controller | One controller coordinates viewport, selection, tools, layers, and surface access | Keep `ProjectCanvasController` as the sole Canvas mutation boundary | `ALIGN` | ready |
| Stable scene model | Graphics elements are queried independently of UI component state | Keep normalized nodes, edges, groups, ordering, bounds, and spatial membership in `CanvasSceneStore` | `ALIGN` | ready |
| Viewport service | Camera, transforms, fit, zoom, bounds, and refresh policy are centralized | Keep all coordinate and camera math in `CanvasViewport` | `ALIGN` | ready |
| Spatial queries | Visibility and hit testing use indexed candidates | Avoid full-scene work on pointer, pan, zoom, and common hit-test paths | `ALIGN` | partial |
| Stable publications | High-frequency input does not rebuild the entire UI tree | Coalesce pointer publications and expose stable controller snapshots | `ALIGN` | partial |
| Layered rendering | Graphics, DOM content, and floating controls have separate responsibilities | Preserve graphics, document DOM, and screen-space overlay layers | `ALIGN` | ready |
| Batched graphics renderer | Connectors and simple graphics use a dedicated high-throughput renderer | Replace full-edge SVG iteration with indexed, batched graphics commands behind `CanvasGraphicsLayer` | `ADAPT` | missing |
| Turbo/low-detail rendering | Large scenes reduce rendering cost without losing interaction state | Add semantic low-detail primitives and native WKWebView budgets; do not copy AFFiNE's renderer implementation | `ADAPT` | partial |
| DOM content budget | Rich blocks do not all remain mounted at low zoom | Bound DOM, preview, image, and inactive heavy-viewer mounts while retaining active objects | `ALIGN` | partial |
| Active-object retention | Selected and manipulated objects survive culling | Retain selected, editing, dragging, resizing, connecting, linked, and overlay-owned objects | `ALIGN` | ready |
| Node behavior registry | Block-specific extensions own rendering and interaction behavior | Make each `CanvasNodeSpec` own an actual renderer adapter plus preview, toolbar, inspector, clipboard, drop, edit, and resize behavior | `ALIGN` | partial |
| One rich editor portal | AFFiNE can render editable blocks from its shared block model | Mount exactly one live BlockNote-backed `CanvasEditorPortal`; all inactive documents remain previews | `ADAPT` | ready |
| Accessibility fallback | Canvas controls remain keyboard-operable and discoverable | Keep DOM-backed controls, Navigator access, focus restoration, labels, and keyboard commands even when graphics are batched | `ADAPT` | partial |

### Selection, Tools, And Direct Manipulation

| Capability | AFFiNE reference behavior | Sapientia target | Class | State at decision |
|---|---|---|---|---|
| Select and primary selection | Click, additive selection, marquee, and primary object semantics | Match click, Shift-click, marquee, primary selection, and empty-space clearing | `ALIGN` | partial |
| Hand and camera gestures | Dedicated pan tool plus temporary hand override | Match Hand, Space-drag, wheel, trackpad pan, pointer-centered zoom, and fit commands | `ALIGN` | partial |
| Gesture lifecycle | Pointer interactions have explicit start, active, commit, and cancel states | Keep one state machine per gesture; cancellation restores initial geometry | `ALIGN` | ready |
| Move and multi-move | Selected objects translate as one operation | Match drag thresholds, multi-node movement, snap feedback, cancellation, and one history entry | `ALIGN` | partial |
| Resize | Handles operate in screen space and respect object constraints | Match stable handles, minimum geometry, multi-zoom behavior, snapping, cancellation, and one history entry | `ALIGN` | partial |
| Frame/group selection | Frames organize and select spatial content | Make Frame gestures create or update Project groups with deterministic membership | `ALIGN` | partial |
| Nested groups and ordering | Groups participate in hierarchy and visual ordering | Support explicit nesting, enter/exit group focus, reparenting, and deterministic z-order before claiming group parity | `ALIGN` | missing |
| Alignment guides | Drag and resize show useful nearby alignment targets | Use spatial candidates for edge/center guides and clear guides deterministically | `ALIGN` | partial |
| Distribution and arrange actions | Selected objects can be aligned and distributed | Add align/distribute/front/back commands through controller transactions | `ALIGN` | missing |
| Clipboard | Object-aware copy/paste preserves supported relationships | Let NodeSpecs serialize objects; remap ids, edges, group membership, and paste offsets in one transaction | `ALIGN` | partial |
| Contextual toolbar | Object extensions supply relevant direct actions | Render NodeSpec-owned actions in clipped screen space with deterministic focus and dismissal | `ALIGN` | partial |
| Inspector | Selection drives type-specific properties and actions | Make NodeSpecs provide inspector sections/actions without type branches in the Canvas root | `ALIGN` | partial |
| Escape hierarchy | Active transient work dismisses before durable selection state | Dismiss menu/thread/toolbar, cancel gesture, exit editing, then clear selection | `ALIGN` | partial |
| Text/editor pointer isolation | Editing text does not move Canvas objects | Editor selection, toolbar, comments, and native text gestures must never begin Canvas drag or pan | `ADAPT` | ready |
| Keyboard commands | Tools and edits are available without pointer-only traps | Preserve Enter, Escape, Delete, copy/paste, undo/redo, Focus Mode, find/add, and temporary Hand semantics | `ALIGN` | partial |
| Touch and pen input | Edgeless supports broader direct-input workflows | Evaluate pointer, touch, stylus, pressure, and palm-rejection requirements separately | `DEFER` | missing |

### Connections And Graphics

| Capability | AFFiNE reference behavior | Sapientia target | Class | State at decision |
|---|---|---|---|---|
| Create connection | Connector tool links graphics elements with preview and cancellation | Match creation, valid-target feedback, cancellation, and one transaction | `ALIGN` | partial |
| Reconnect endpoints | Existing connectors can change source or target | Provide endpoint handles, valid-target resolution, cancellation, and one transaction | `ALIGN` | missing |
| Anchors and ports | Connections bind to meaningful object geometry | Define NodeSpec connection geometry and stable anchors rather than center-to-center lines | `ALIGN` | missing |
| Connector routing | Connectors support paths that remain legible around objects | Add straight, orthogonal, and curved routing with spatially bounded obstacle work | `ALIGN` | missing |
| Connector labels and styles | Connectors carry editable presentation and meaning | Preserve Project relationship kinds while supporting labels, arrows, stroke styles, and Inspector editing | `ADAPT` | missing |
| Connector hit testing | Thin paths remain selectable at every zoom | Use zoom-aware graphics hit regions independent from visual stroke width | `ALIGN` | partial |
| Shapes | Edgeless provides first-class geometric primitives | Define Sapientia shape semantics and persistence in a separate ADR before adding node kinds | `DEFER` | missing |
| Freehand brush | Edgeless provides freehand drawing | Define stroke storage, input, rendering, export, and accessibility in a separate ADR | `DEFER` | missing |
| Mind maps | Edgeless provides structured mind-map graphics | Decide whether this is a Canvas layout of existing references or a new durable model in a separate ADR | `DEFER` | missing |

### Content Objects

| Capability | AFFiNE reference behavior | Sapientia target | Class | State at decision |
|---|---|---|---|---|
| Project Overview | AFFiNE pages can appear as editable Canvas content | Keep one required Overview reference to the Project Markdown file | `ADAPT` | ready |
| Note documents | Rich documents can be placed and edited on Canvas | Keep Note bodies in Markdown and edit them through the single BlockNote portal | `ADAPT` | ready |
| Paper documents | No exact AFFiNE Paper sidecar equivalent is required | Preserve editable Paper Markdown, PDF actions, metadata, citations, and comments through existing Paper services | `DIFFER` | intentional |
| Paper block citations | No exact AFFiNE provenance model is required | Preserve `@block` source provenance and stale-reference behavior without copying text into Canvas JSON | `DIFFER` | intentional |
| Plain text/sticky content | Edgeless supports lightweight text objects | Keep lightweight Canvas-owned text cards with direct edit, resize, clipboard, and semantic zoom | `ALIGN` | partial |
| Tasks | Blocks can represent actionable content | Keep lightweight Project task cards and completion actions; do not introduce a database dependency | `ADAPT` | partial |
| Images | Images can be dropped, resized, selected, and rendered efficiently | Match drop, lazy load, resize, stale state, clipboard, and low-zoom rendering behavior | `ALIGN` | partial |
| Groups and frames | Spatial containers organize other objects | Use Project group nodes and explicit membership, not document-body containment | `ADAPT` | partial |
| Linked pages | Documents can be embedded or linked from Canvas | Use stable Note/Paper references, Peek, Pin, Navigator, and explicit standalone navigation | `ADAPT` | ready |
| Web bookmarks and embeds | Edgeless supports bookmark and embedded web blocks | Define security, offline, snapshot, and persistence behavior in a separate ADR | `DEFER` | missing |
| Attachments and media | General assets can participate as blocks | Reuse vault assets only after per-format preview and inactive-viewer budgets are specified | `DEFER` | missing |
| Databases and tables | AFFiNE block data views can appear on Canvas | Do not invent a Canvas database model; evaluate existing Sapientia collections/sheets separately | `DEFER` | missing |
| LaTeX blocks | AFFiNE has a dedicated LaTeX block | Preserve Markdown/BlockNote math ownership; a standalone Canvas formula object requires a separate use case | `DIFFER` | intentional |
| Slides and presentation | AFFiNE can place presentation content on Canvas | Keep presentation behavior outside Project Canvas until separately decided | `DEFER` | missing |
| Templates | AFFiNE can create Canvas content from templates | Decide template ownership, deterministic ids, and source references separately | `DEFER` | missing |

### Editing, History, Persistence, And Collaboration

| Capability | AFFiNE reference behavior | Sapientia target | Class | State at decision |
|---|---|---|---|---|
| Shared document/Canvas store | AFFiNE views operate over BlockSuite/Yjs data | Keep Canvas layout separate from Markdown and Paper content | `DIFFER` | intentional |
| Rich-text engine | AFFiNE uses BlockSuite blocks | Keep BlockNote behind Sapientia's editor adapter; do not replace it for Canvas parity | `DIFFER` | intentional |
| Canvas persistence | AFFiNE persists its block/graphics model | Keep deterministic, migratable `project.canvas.json` containing no document bodies | `ADAPT` | ready |
| Structural save semantics | Committed Canvas changes become durable | Flush structural transactions promptly, debounce viewport-only writes, expose failures, and never report a failed save as persisted | `ALIGN` | partial |
| Document saves | Shared blocks persist through AFFiNE's document model | Save referenced Markdown through the existing app boundary independently from Canvas JSON | `DIFFER` | intentional |
| Canvas history | Gestures undo as transactions | Keep one reversible transaction per completed Canvas command or gesture | `ALIGN` | ready |
| Document history | AFFiNE can share history through its block model | Keep BlockNote undo separate and route undo/redo by actual focus ownership | `ADAPT` | ready |
| Membership deletion | Removing a block follows AFFiNE's model | Removing Canvas membership must never delete the referenced Note, Paper, sidecar, or asset | `DIFFER` | intentional |
| Stale references | Shared-store elements normally remain internally addressable | Preserve missing-reference diagnostics and degraded cards so Git/external edits do not destroy layout | `DIFFER` | intentional |
| Comments | AFFiNE comments follow its block/document model | Keep Paper comments in Paper sidecars and position their UI through Canvas overlays | `DIFFER` | intentional |
| Local-first files | AFFiNE is local-first through its own data engine | Keep human-inspectable Markdown, JSON, sidecars, and Git as Sapientia's local-first substrate | `ADAPT` | ready |
| Real-time collaboration | AFFiNE supports real-time synchronization and collaboration | Do not add Yjs or collaborative Canvas editing under this ADR | `DEFER` | missing |
| File merge behavior | CRDT state resolves concurrent edits differently | Keep deterministic ordering and validation so Git merges remain reviewable; define conflict UX separately | `DIFFER` | intentional |

### Product Integration

| Capability | AFFiNE reference behavior | Sapientia target | Class | State at decision |
|---|---|---|---|---|
| Unified workspace | Documents and Canvas coexist as one workspace | Keep every Project opening directly into one Canvas workspace | `ADAPT` | ready |
| Focused document editing | Canvas content can become the primary editing surface | Preserve Focus Mode without opening a second editor or losing camera/selection state | `ADAPT` | ready |
| Peek and pin | Linked content can be explored without duplicating it | Keep transient Peek outside persistence/history until explicit Pin | `DIFFER` | intentional |
| Navigation when culled | Off-screen content remains addressable | Navigator, citations, Back-to-content, selection, and fit commands must work independently of DOM mounting | `ALIGN` | partial |
| AI Canvas workflows | AFFiNE offers Canvas-specific AI features | Preserve existing bounded AI context and draft review only; new generation/layout workflows require a product ADR | `DEFER` | missing |
| Visual design | AFFiNE has its own toolbar and object language | Follow Sapientia shadcn/Lucide components and visual language; align behavior, not pixels | `DIFFER` | intentional |
| Mobile editing | AFFiNE supports cross-platform clients | Define mobile Project Canvas interaction and performance separately | `DEFER` | missing |

## Required Alignment Sequence

The matrix does not authorize all deferred features. Work proceeds in these
gated stages:

1. **Close existing-object behavior ownership.** NodeSpecs gain real renderer
   adapters and own existing node rendering/actions. Surface and NodeCard type
   branches are removed where behavior belongs to a spec.
2. **Productionize the graphics layer.** Indexed visible-edge queries, batched
   graphics commands, connector hit regions, anchors, and reconnection replace
   center-to-center full-scene SVG iteration.
3. **Complete direct manipulation.** Nested group semantics, alignment and
   distribution, gesture polish, overlay focus/dismissal, and clipboard graph
   remapping meet browser and native acceptance.
4. **Prove scale in the real renderer.** Deterministic 1,000- and 5,000-object
   browser/native scenarios enforce candidate, mount, preview, image, frame,
   rerender, and supported memory budgets.
5. **Decide additional object families separately.** Shapes, brush, mind maps,
   embeds, databases, slides, templates, collaboration, mobile editing, and new
   AI workflows each require product evidence and an ADR before they become
   implementation commitments.

Completing stages 1–4 permits the phrase **"AFFiNE-aligned core Canvas
interactions for Sapientia objects."** It does not permit a claim of complete
AFFiNE Edgeless feature parity.

## Acceptance Contract

Every `ALIGN` or `ADAPT` row brought into an implementation goal must define:

- observable pointer, keyboard, focus, and cancellation behavior;
- controller commands and history transaction boundaries;
- browser and native WKWebView acceptance evidence;
- culling, rendering, and memory effects at low and normal zoom;
- persistence and reload behavior, including failed-save reporting;
- accessibility and Navigator behavior when the object is not mounted;
- CodeScene, Codacy, localization, coverage, and demo-vault release evidence.

Every `DIFFER` row must have a regression test where practical. At minimum, the
test suite must continue to prove that Canvas JSON contains no Markdown body,
Paper content, comments, editor document, or transient Peek state; membership
deletion does not delete source files; and Canvas/document undo domains remain
separate.

The matrix is a dated reference snapshot, not an automatically moving contract.
New AFFiNE capabilities do not silently expand Sapientia scope. Reclassifying a
row or adding a new commitment requires a later ADR because this ADR becomes
immutable once active.

## Options Considered

### Adopt AFFiNE, BlockSuite, And Yjs Directly

Rejected. This would replace Sapientia's Markdown, BlockNote, Paper sidecar,
Git, and Canvas JSON ownership contracts. It would be a storage/editor migration
rather than a Canvas capability improvement.

### Copy AFFiNE's Visible UI Without Its Engine Contracts

Rejected. Similar toolbars and cards would not deliver connector geometry,
gesture cancellation, history, scale, accessibility, or persistence quality.

### Declare Broad AFFiNE Parity After ADR 0175

Rejected. ADR 0175 establishes engine boundaries, not the complete graphics,
object, platform, or collaboration capability set.

### Use A Classified Capability Matrix

Chosen. It makes the desired UX quality explicit while protecting Sapientia's
source-of-truth model and preventing deferred product features from appearing as
completed work.

## Consequences

### Positive

- "AFFiNE-inspired" gains a testable meaning instead of remaining a broad
  design reference.
- Engine gaps are separated from intentionally different storage semantics.
- Markdown, BlockNote, Paper sidecars, and Git remain protected invariants.
- Deferred shapes, drawing, databases, collaboration, and AI work remain visible
  without silently entering the current scope.
- Release notes and acceptance reports can make precise, evidence-backed claims.

### Negative

- Sapientia must maintain its own renderer, connector, input, and accessibility
  implementation rather than inheriting BlockSuite behavior.
- Some AFFiNE outcomes require more integration work because document and Canvas
  history/persistence remain separate.
- The matrix adds explicit acceptance work before a capability can be called
  aligned.

### Neutral

- ADR 0174 remains the Project product model.
- ADR 0175 remains the Canvas engine-boundary contract.
- Existing Project Canvas file formats and node types do not change in this ADR.
- No new user-facing copy, analytics event, node type, storage file, or
  collaboration model is introduced by this decision.

## Non-Goals

This ADR does not:

- implement any matrix row;
- prescribe a research methodology;
- add shapes, brush strokes, mind maps, databases, slides, templates, or embeds;
- adopt BlockSuite, Yjs, AFFiNE storage, or AFFiNE visual design;
- replace BlockNote or change Markdown/Paper ownership;
- add real-time collaboration, mobile editing, or new AI Canvas workflows;
- claim that current Project Canvas behavior has AFFiNE Edgeless parity.
