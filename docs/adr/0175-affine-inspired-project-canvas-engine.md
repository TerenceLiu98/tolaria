---
type: ADR
id: "0175"
title: "AFFiNE-inspired Project Canvas engine boundaries"
status: proposed
date: 2026-07-11
---

# ADR 0175: AFFiNE-Inspired Project Canvas Engine Boundaries

## Context

ADR 0174 defines the product model for Projects:

```text
Project = one canvas-backed workspace
```

That decision is intentionally content-neutral. Sapientia should not prescribe how a user performs research or encode a fixed research methodology into the Canvas. The Canvas must instead provide a general, dependable spatial document environment in which existing Notes, Papers, citations, images, tasks, and other objects can be arranged and edited.

The first implementation established the required product behavior, including:

- the unified Project workspace
- a required Project Overview node
- Note and Paper previews
- one live editor portal
- Focus Mode and Peek nodes
- selection, drag, resize, connections, undo, redo, and navigation
- Paper comments, citations, and Project-aware AI drafts
- viewport culling and semantic presentation states

However, the implementation currently concentrates most Canvas behavior in `ProjectCanvasSurface.tsx`. The component owns camera math, pointer gestures, selection, drag and resize operations, connection creation, keyboard routing, undo and redo, persistence, node rendering, edge rendering, toolbars, popovers, Focus Mode, and parts of editor coordination. This is a workable product prototype but not a stable Canvas engine boundary.

We reviewed the current AFFiNE and BlockSuite implementation as the primary architecture and interaction reference:

- [AFFiNE](https://github.com/toeverything/AFFiNE) combines document and edgeless editing in one application.
- [PageEditor](https://github.com/toeverything/AFFiNE/blob/canary/packages/frontend/core/src/blocksuite/editors/page-editor.ts) and [EdgelessEditor](https://github.com/toeverything/AFFiNE/blob/canary/packages/frontend/core/src/blocksuite/editors/edgeless-editor.ts) render different views over the same BlockSuite document store.
- [GfxController](https://github.com/toeverything/AFFiNE/blob/canary/blocksuite/framework/std/src/gfx/controller.ts) centralizes viewport, selection, tools, keyboard, layers, grid, and surface access.
- [Viewport](https://github.com/toeverything/AFFiNE/blob/canary/blocksuite/framework/std/src/gfx/viewport.ts) owns coordinate conversion, camera state, fitting, animation, viewport bounds, overscan, and gesture-aware refresh behavior.
- [GfxSelectionManager](https://github.com/toeverything/AFFiNE/blob/canary/blocksuite/framework/std/src/gfx/selection.ts) gives block and canvas selection one explicit state model.
- [SurfaceBlock](https://github.com/toeverything/AFFiNE/blob/canary/blocksuite/affine/blocks/surface/src/surface-block.ts) separates graphical rendering from DOM block rendering.
- [Edgeless Note](https://github.com/toeverything/AFFiNE/blob/canary/blocksuite/affine/blocks/note/src/note-edgeless-block.ts) provides Canvas-specific rendering and interaction for editable document blocks.
- Block-specific toolbar, clipboard, and interaction extensions keep the Edgeless root from owning every object type.

AFFiNE validates an important implementation principle: a production infinite canvas is an editor system, not a React component containing draggable cards.

Sapientia cannot adopt AFFiNE's architecture directly. BlockSuite uses a Yjs-backed block store as the shared source of truth, while Sapientia uses Markdown files, BlockNote, Paper sidecars, Git, and `project.canvas.json`. Replacing those foundations would be another editor and storage migration. The useful lesson is the separation of responsibilities, not the BlockSuite data model.

## Decision

Sapientia will develop a Sapientia-owned Project Canvas engine whose boundaries are inspired by AFFiNE's graphics architecture.

The engine will separate canvas state and interaction from React rendering. React remains the application shell and integration layer; it will not remain the owner of low-level gesture state, viewport math, selection semantics, or history transactions.

Sapientia will retain:

- Markdown files as the source of truth for Note, Paper, and Project Overview bodies
- BlockNote behind `NoteSurface` and the editor adapter boundary
- `project.canvas.json` as the source of truth for Project layout and relationships
- Paper sidecars as the source of truth for metadata, source blocks, and comments
- the single live editor portal established by ADR 0174
- local-first, Git-friendly persistence

Sapientia will not adopt BlockSuite, Yjs, or AFFiNE's document store as part of this decision.

## Target Architecture

```text
ProjectWorkspaceSurface (React application shell)
├── ProjectNavigator
├── ProjectCanvasViewport
│   ├── CanvasGraphicsLayer
│   ├── CanvasDocumentLayer
│   └── CanvasOverlayLayer
├── CanvasEditorPortal
├── ProjectCanvasInspector
└── ProjectCanvasToolbar

ProjectCanvasController (headless owner)
├── CanvasSceneStore
├── CanvasViewport
├── CanvasSelectionManager
├── CanvasToolManager
├── CanvasLayerManager
├── CanvasHistoryManager
├── CanvasOverlayCoordinator
├── CanvasNodeSpecRegistry
└── ProjectCanvasPersistenceAdapter
```

`ProjectWorkspaceSurface` subscribes to stable controller snapshots and dispatches commands. It does not implement geometry operations itself.

## Engine Boundaries

### ProjectCanvasController

The controller is the composition root and the only public mutation boundary for Canvas behavior.

It owns or coordinates:

- the loaded Project Canvas scene
- camera and viewport state
- selection and editing state
- the current tool and active gesture
- scene queries and hit testing
- history transactions
- persistence scheduling
- navigation to nodes and bounds

UI components issue commands such as:

```text
selectNodes
beginNodeDrag
updatePointer
finishGesture
setTool
zoomAtPoint
fitToBounds
createConnection
removeMembership
undo
redo
```

The controller publishes derived snapshots suitable for `useSyncExternalStore` or an equivalent subscription seam. High-frequency pointer updates must not require rebuilding the entire React component tree.

### CanvasSceneStore

The scene store holds normalized in-memory layout state:

- nodes by stable id
- edges by stable id
- layer and ordering information
- groups and parent relationships
- spatial bounds
- Project membership references

It does not contain Markdown bodies, rendered previews, BlockNote documents, Paper source text, or comment threads.

The store exposes deterministic serialization back to `project.canvas.json`. Serialized arrays remain sorted and inspectable so Git diffs stay useful.

### CanvasViewport

Viewport logic becomes a framework-independent service responsible for:

- camera position and zoom
- screen-to-canvas and canvas-to-screen conversion
- zoom around a pointer or selection
- fit-to-content and fit-to-selection
- viewport and overscan bounds
- animated camera movement
- gesture state
- visible-region queries
- restoration of the previous camera after Focus Mode

The viewport must distinguish exact interaction bounds from enlarged rendering bounds. Overscan may improve rendering continuity but must not change hit testing or selection semantics.

Camera changes are applied on animation frames. During active pan or zoom gestures, expensive DOM visibility recalculation may be deferred or throttled, followed by one authoritative refresh when the gesture ends.

### CanvasSelectionManager

Selection is modeled explicitly rather than inferred from several React state variables.

The selection contract includes:

- selected node ids
- selected edge ids
- primary selection
- editing node id
- active group or frame
- temporary Peek selection
- selection bounds
- selection mode such as idle, translating, resizing, connecting, or editing

`selected` and `editing` are different states. A document node can be selected without mounting the editor. Entering edit state remains an explicit transition and preserves the single-editor rule.

Selection updates drive the inspector, contextual toolbar, handles, AI context, and editor portal through subscriptions. Those surfaces do not maintain independent competing selection state.

### CanvasToolManager

Canvas tools use explicit interaction state machines.

Initial tools:

- Select
- Hand
- Connect
- Frame or Group
- object creation tools registered by node specs

Each tool owns its pointer lifecycle:

```text
idle -> pressed -> dragging/resizing/connecting -> committed
                                             \-> cancelled
```

Temporary keyboard overrides such as holding `Space` for Hand mode are represented as tool transitions, not unrelated pointer conditionals. `Escape` cancels the current gesture before it exits editing or clears selection.

### CanvasLayerManager And Rendering

Sapientia will use a hybrid rendering model.

The graphics layer is suitable for:

- background grid
- connectors and connection previews
- simple shapes
- large numbers of non-document primitives
- optional low-detail placeholders

The DOM document layer is used for:

- Note and Paper cards
- lightweight Markdown previews
- images and embeds requiring browser layout
- the single active editor portal

The screen-space overlay layer is used for:

- selection outlines
- resize and connection handles
- contextual toolbars
- comment UI
- drag guides and snapping indicators
- transient menus and popovers

Screen-space controls do not inherit Canvas scale. Handles and toolbar buttons therefore remain usable at every zoom level and are not clipped by transformed node containers.

The first migration may retain SVG connectors behind the graphics-layer interface. The boundary must allow a later Canvas2D renderer without changing tools, selection, or persistence.

### CanvasNodeSpecRegistry

Node-specific behavior is registered instead of accumulated in the Canvas root component.

A node specification may provide:

- overview renderer
- preview renderer
- edit capability and editor binding
- default geometry
- toolbar actions
- inspector section
- clipboard serialization
- drag-and-drop acceptance
- attachment or reference resolution
- stale-state presentation
- hit-test and resize constraints

Initial registered specifications cover Project Overview, Note, Paper, Paper block, image, text, task, and group nodes.

The registry does not move node bodies into Canvas JSON. It only defines how referenced objects participate in the Canvas.

### CanvasOverlayCoordinator

Floating UI uses one explicit overlay coordinator and portal root.

The coordinator resolves:

- canvas bounds to screen-space placement
- viewport and window clipping
- z-order between editor toolbar, selection handles, comments, menus, and inspector
- dismissal and focus ownership
- repositioning after camera, selection, or container changes

This prevents each floating surface from inventing its own DOM queries, timers, and transform corrections.

### CanvasHistoryManager

Canvas history records bounded, reversible transactions.

Examples of one transaction:

- dragging one or many nodes
- resizing a node
- creating or reconnecting an edge
- grouping a selection
- auto-layout
- deleting Project membership

Continuous pointer movement does not create one history record per event. A gesture captures its initial state and commits one transaction when completed.

Document undo remains owned by the active BlockNote editor. Canvas undo remains owned by the Canvas controller. Focus and editing state choose the appropriate history domain as defined by ADR 0174.

### ProjectCanvasPersistenceAdapter

Persistence is downstream of committed controller transactions.

The adapter:

- reads and validates `project.canvas.json`
- migrates older readable schemas
- writes deterministic layout state
- debounces viewport-only persistence
- flushes structural transactions promptly
- reports recoverable stale references
- never writes referenced Markdown bodies

Canvas persistence and document persistence remain independent even though the UI presents one Project workspace.

## Interaction And UI Contract

The UI follows AFFiNE's direct-manipulation model without copying its visual design verbatim.

### Fixed Workspace Chrome

The Project title, Navigator, Inspector, primary toolbar, and zoom controls remain in screen space. They do not scale or move with the Canvas.

The primary Canvas toolbar is compact and responsive:

- common tools remain directly accessible
- less common tools move into an overflow menu on narrow surfaces
- active tool state is always visible
- tool buttons use Sapientia's existing shadcn and Lucide visual language

### Contextual Object Controls

Object-specific actions appear only when relevant:

- selection handles appear around the selected object or selection bounds
- a contextual toolbar follows the selection in screen space
- detailed properties remain in the right Inspector
- permanent buttons are not repeated inside every card

### Selection And Editing

The primary interaction contract remains:

- click: select
- Shift-click or marquee: extend selection
- double-click or `Enter`: edit a document node
- `Escape`: cancel gesture, exit editing, then clear selection
- `Space` plus drag: pan
- wheel or trackpad: pan or zoom according to platform conventions
- `Cmd/Ctrl+K`: find or add a Project object
- `Cmd/Ctrl+Enter`: enter or exit Focus Mode
- `Delete`: remove Canvas membership, not the underlying file

Selection, editing, panning, and text interaction must be mutually unambiguous. A text-selection gesture inside the active editor cannot move the Canvas node.

### Semantic Rendering Levels

ADR 0174's semantic states remain, but the engine owns the thresholds and visibility policy:

- overview: identity and status only
- preview: lightweight bounded content
- edit: one live editor portal
- focus: full central reading or editing surface

Zoom changes do not remount every node at once. Presentation changes are batched and applied only to visible or retained nodes.

## Performance Contract

The engine must be designed for hundreds of document nodes and thousands of lightweight graphical elements.

Required controls:

- spatial indexing for viewport queries and hit testing
- viewport culling with bounded overscan
- one live BlockNote editor
- no persistent PDF viewers outside active Focus Mode
- lazy images and Paper assets
- lightweight cached previews keyed by path and modification identity
- request-animation-frame camera updates
- no React state update for every raw pointer event
- batched scene mutations
- bounded history transactions
- optional Canvas backing-store DPR caps at low zoom
- a DOM node budget for low-zoom and active-gesture survival
- selected, editing, and actively connected objects remain retained even when near viewport boundaries

Rendering visibility and interaction visibility are separate concepts. Culling an object from an expensive renderer must not silently invalidate selection, navigation, or Back-to-content behavior.

## Migration Plan

The refactor is incremental and preserves the existing Canvas file contract.

### Phase 1: Headless Viewport And Coordinate Boundary

- extract all camera and coordinate math into `CanvasViewport`
- add deterministic unit tests for transforms, zoom focus, fit, and bounds
- keep the existing React and SVG renderers

### Phase 2: Controller, Selection, And Transactions

- introduce `ProjectCanvasController`
- move selection and editing state into `CanvasSelectionManager`
- replace full-component gesture state with transaction boundaries
- route undo and redo through `CanvasHistoryManager`

### Phase 3: Tool State Machines

- migrate Select, Hand, Connect, drag, and resize interactions
- make keyboard overrides and cancellation explicit
- remove window-level pointer logic from the React shell

### Phase 4: Layer And Overlay Boundaries

- separate graphics, document, and overlay layers
- move handles and contextual UI into screen-space overlays
- centralize floating placement and clipping

### Phase 5: Node Specifications

- register Note, Paper, evidence, image, task, text, and group behavior
- remove node-type conditionals from the Canvas root
- keep `CanvasEditorPortal` as the only live document editor

### Phase 6: Spatial Index And Renderer Optimization

- replace linear viewport and hit-test scans with a spatial index
- batch graphical rendering
- establish DOM and image budgets
- profile large Projects in Tauri WebView, not only browser tests

During migration, adapters may expose the old React callbacks through the new controller. New Canvas behavior must target the new boundaries rather than adding more responsibility to `ProjectCanvasSurface.tsx`.

## Options Considered

### Continue The Current React Component Architecture

Rejected as the long-term direction. It is fast for adding individual features but couples every new tool to selection, persistence, rendering, and keyboard behavior. It also causes high-frequency gestures to trigger broad React work.

### Adopt BlockSuite And AFFiNE's EdgelessEditor

Rejected. It would provide a mature graphics architecture but would replace Sapientia's Markdown and BlockNote ownership model with a Yjs-backed block store. It would also introduce a large migration, new persistence semantics, and MPL 2.0 file-level licensing obligations for copied or modified BlockSuite source.

### Use tldraw As The Complete Project Canvas Engine

Deferred rather than rejected. Sapientia already uses tldraw for durable whiteboard blocks, and tldraw provides mature selection, tools, camera, bindings, history, and custom shapes. However, Project Canvas has existing Markdown reference semantics, a single external editor portal, Paper workflows, and a committed JSON contract. A separate evaluation should compare adapting Project nodes to tldraw custom shapes against completing the Sapientia-owned engine. This ADR does not silently replace the current Project Canvas implementation with tldraw.

### Build A Sapientia-Owned Engine With AFFiNE-Inspired Boundaries

Chosen. It preserves the current product and storage contracts while replacing the unstable monolithic interaction implementation with explicit, testable services.

## Test Expectations

Focused tests should cover:

- screen/canvas coordinate round trips at multiple zoom levels
- zoom around pointer and selection
- fit-to-content and fit-to-selection
- overscan does not change hit-test semantics
- selection and editing state transitions
- tool cancellation and temporary Hand override
- one transaction per drag, resize, connect, group, and auto-layout gesture
- Canvas undo does not invoke document undo
- visible-node queries retain selected and editing nodes
- screen-space handles remain a stable size across zoom levels
- pointer interaction inside the editor does not move the node or Canvas
- deterministic Canvas serialization after controller transactions
- legacy `project.canvas.json` files load without layout loss
- large-scene rendering stays within the agreed DOM and memory budget

Playwright and native Tauri QA should cover mouse, trackpad, and keyboard paths. Performance tests should exercise zooming and panning while a Project contains many Notes, Papers, images, and connectors.

## Consequences

### Positive

- Canvas behavior gains explicit ownership boundaries.
- Pointer, selection, viewport, and history logic become independently testable.
- React rendering is insulated from high-frequency gesture state.
- New node types stop increasing the complexity of the Canvas root.
- Floating UI and editor focus have one placement and ownership model.
- Large Projects can be optimized without changing Markdown or Paper storage.
- AFFiNE's strongest architectural lessons are adopted without importing BlockSuite.

### Negative

- The refactor is substantial and must be delivered incrementally.
- A custom Canvas engine still requires long-term maintenance of gestures, hit testing, selection, and rendering.
- Hybrid Canvas and DOM rendering introduces coordinate and accessibility complexity.
- Compatibility adapters temporarily increase code volume during migration.

### Neutral

- ADR 0174 remains the controlling Project product model.
- Project Canvas storage remains `project.canvas.json`.
- Notes and Papers remain normal Markdown files.
- BlockNote remains the rich-text editor.
- Canvas relationships remain Project-level layout data rather than backlinks unless explicitly written into Markdown.

## Non-Decisions

This ADR does not decide:

- research methodology or prescribed Project node types
- replacing BlockNote
- adopting BlockSuite or Yjs
- replacing the Project Canvas format with AFFiNE snapshots
- real-time collaboration
- mobile Canvas editing
- presentation or slideshow behavior
- automatic AI layout
- whether a future implementation should ultimately use tldraw internally

Those decisions require separate evidence and ADRs.
