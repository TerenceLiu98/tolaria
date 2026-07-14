# Abstractions

Key abstractions and domain models in Tolaria.

## Design Philosophy

Tolaria's abstractions follow the **convention over configuration** principle: standard field names, types, and relationships have well-defined meanings and trigger UI behavior automatically. This makes vaults legible both to humans and to AI agents — the more a vault follows conventions, the less custom configuration an AI needs to navigate it correctly.

The full set of design principles is documented in [ARCHITECTURE.md](./ARCHITECTURE.md#design-principles).

## Semantic Field Names (conventions)

These frontmatter field names have special meaning in Tolaria's UI:

| Field | Meaning | UI behavior |
|---|---|---|
| `title:` | Legacy display-title fallback for older notes | Used only when a note has no H1; new notes do not write it automatically |
| `type:` | Entity type (Project, Person, Quarter…) | Type chip in note list + sidebar grouping |
| `status:` | Lifecycle stage (active, done, blocked…) | Colored chip in note list + editor header |
| `icon:` | Per-note icon (emoji, Phosphor name, or HTTP/HTTPS image URL) | Rendered on note title surfaces; editable from the Properties panel |
| `url:` | External link | Clickable link chip in editor header |
| `date:` | Single date | Formatted date badge |
| `start_date:` + `end_date:` | Duration/timespan | Date range badge |
| `goal:` + `result:` | Progress | Progress indicator in editor header |
| `Workspace:` | Vault context filter | Global workspace filter |
| `belongs_to:` | Parent relationship | Humanized to `Belongs to` in the UI |
| `related_to:` | Lateral relationship | Humanized to `Related to` in the UI |
| `has:` | Contained relationship | Humanized to `Has` in the UI |

Relationship fields are detected dynamically — any frontmatter field containing `[[wikilink]]` values is treated as a relationship (see [ADR-0010](adr/0010-dynamic-wikilink-relationship-detection.md)). Tolaria's own default relationship vocabulary uses snake_case on disk, but labels are humanized at render time and existing user-authored keys are left untouched.

### System Properties (underscore convention)

Any frontmatter field whose name starts with `_` is a **system property**:

- It is **not shown** in the Properties panel (neither for notes nor for Type notes)
- It is **not exposed** as a user-visible property in search, filters, or the UI
- It **is editable** directly in the raw editor (power users can access it if needed)
- It is used by Tolaria internally for configuration, behavior, and UI preferences

Examples:
```yaml
_pinned_properties:       # which properties appear in the editor inline bar (per-type)
  - key: status
    icon: circle-dot
_icon: shapes             # icon assigned to a type
_color: blue              # color assigned to a type
_order: 10                # sort order in the sidebar
_sidebar_label: Projects  # override label in sidebar
_width: wide              # rich-editor width override for this note
```

**This convention is universal** — apply it to all future system-level frontmatter fields. When a new feature needs to store configuration in a note's frontmatter (especially in Type notes), use `_field_name` to keep it hidden from normal user-facing surfaces while still stored on-disk as plain text.

The frontmatter parser (Rust: `vault/mod.rs`, TS: `utils/frontmatter.ts`) must filter out `_*` fields before passing `properties` to the UI.

## Document Model

All data lives in markdown files with YAML frontmatter. There is no database — the filesystem is the source of truth.

### Rich-Editor Markdown Serialization

`src/utils/richEditorMarkdown.ts` is the canonical owner for turning a BlockNote document back into vault Markdown. It restores Tolaria's durable Markdown syntax for wikilinks, math, highlights, attachments, Mermaid, and tldraw blocks before the save path writes bytes to disk. Hot save paths should pass an already-read block snapshot when they have one; a debounced rich-editor flush should not ask BlockNote for `editor.document` twice.

Real BlockNote editor instances install the experimental direct serializer from `src/utils/blockNoteDirectMarkdown.ts`. Callers should go through `serializeBlockNoteMarkdown()` rather than invoking `blocksToMarkdownLossy()` directly: the helper uses the direct serializer when every block shape is supported and falls back to BlockNote's exporter when a custom or unknown block appears.

The direct serializer cache is derived state, scoped to the editor instance, and disposable. Bridge helpers that transform blocks for Markdown restoration should preserve object identity when a block, its children, and table cells are unchanged; that lets frequent debounced saves reuse cached Markdown for stable subtrees without treating the cache as the source of truth.

Opening a Markdown note goes through `resolveBlocksForTarget()` rather than calling BlockNote's parser unconditionally. The resolver first checks exact-source block caches, then uses cheap blank/H1 recognition, then tries Tolaria's worker-backed direct parser for large common Markdown. Unsupported Markdown returns to BlockNote's parser with the same durable-token injection path, preserving correctness while keeping the common large-note path off BlockNote's heavier import lifecycle. Large block sets are then mounted through `applyBlocksToEditorProgressively()`, which locks the editor while chunks append over animation frames and commits the path only after the full document is present. Ordinary BlockNote block wrappers remain fully measurable after mount so side menus and dialogs can preserve viewport position in long documents.

Hot edit paths should avoid document-wide BlockNote lifecycle work. `richEditorBlockNoteOptions.ts` disables BlockNote's previous-block animation tracker for Tolaria editors because it scans the full old and new ProseMirror documents for every doc-changing transaction. `richEditorDispatchPerformance.ts` wraps the ProseMirror dispatch function once and logs `richEditorDispatch` timings for large or slow transactions without traversing the document. Feature code that subscribes to `editor.onChange` must either be debounced/coalesced or active only while its UI state requires it; collapsed-heading rendering follows this rule by subscribing only while sections are collapsed.

Block-selection behavior keeps UI/plugin wiring separate from block operations. `richEditorBlockSelectionExtension.ts` owns the ProseMirror plugin, state reducer, decorations, and keyboard/clipboard event dispatch. `richEditorBlockSelectionDocument.ts` owns BlockNote document traversal, nested-selection pruning, collapsed hidden-content operation IDs, and block-move helpers. `richEditorBlockSelectionClipboard.ts` owns Tolaria clipboard MIME data, BlockNote HTML/Markdown fallback parsing, and ID stripping before paste.

### Vault Git Capability

Git is a per-vault capability, not a prerequisite for the document model. A vault can be:

| State | Meaning | UI behavior |
|---|---|---|
| Git-backed | The vault path is inside a Git work tree, including a parent repository above the mounted folder | History, changes, commits, sync, conflict resolution, remotes, AutoGit, and auto-sync are available according to remote/config state |
| Non-git | The vault path is a plain folder | Markdown scanning, editing, search, and navigation work; Git-dependent status-bar controls and command-palette entries are replaced by `Git disabled` + `Initialize Git for Current Vault` |

Plain folders become Git-backed only when the user explicitly runs Git initialization from the setup dialog, status bar, or command palette. The setup dialog supports "not now" for a one-time dismissal and "never for this vault" for a local per-vault opt-out from future automatic prompts. Features that depend on Git must check both the vault capability and the installation-local `git_enabled` setting instead of assuming every vault has `.git` or that Git chrome is globally visible.

Git initialization is intentionally scoped to dedicated vault folders. When the current non-git folder looks like a broad personal root such as Documents, Desktop, or Downloads and does not already carry Tolaria-managed vault markers, `init_git_repo` refuses to run Git and asks the user to select or create a dedicated subfolder instead.

### VaultEntry

The core data type representing a single note, defined in Rust (`src-tauri/src/vault/mod.rs`) and TypeScript (`src/types.ts`).

```mermaid
classDiagram
    class VaultEntry {
        +String path
        +String filename
        +String title
        +String? isA
        +String[] aliases
        +String[] belongsTo
        +String[] relatedTo
        +Record~string,string[]~ relationships
        +String[] outgoingLinks
        +String? status
        +String? noteWidth
        +Number? modifiedAt
        +Number? createdAt
        +Number wordCount
        +String? snippet
        +Boolean archived
        +WorkspaceIdentity? workspace
        +Boolean trashed ⚠ legacy
        +Number? trashedAt ⚠ legacy
        +Record~string,VaultPropertyValue~ properties
    }

    class TypeDocument {
        +String icon
        +String color
        +Number order
        +String sidebarLabel
        +String template
        +String sort
        +Boolean visible
    }

    class Frontmatter {
        +String type
        +String status
        +String url
        +String[] belongsTo
        +String[] relatedTo
        +String[] aliases
        ...custom fields
    }

    VaultEntry --> Frontmatter : parsed from
    VaultEntry --> TypeDocument : isA resolves to
    VaultEntry "many" --> "1" TypeDocument : grouped by type
```

```typescript
// src/types.ts
interface VaultEntry {
  path: string              // Absolute file path
  filename: string          // Just the filename
  title: string             // From first # heading, or filename fallback
  isA: string | null        // Entity type: Project, Procedure, Person, etc. (from frontmatter `type:` field)
  aliases: string[]         // Alternative names for wikilink resolution
  belongsTo: string[]       // Parent relationships (wikilinks)
  relatedTo: string[]       // Related entity links (wikilinks)
  relationships: Record<string, string[]>  // All frontmatter fields containing wikilinks
  outgoingLinks: string[]   // All [[wikilinks]] found in note body
  status: string | null     // Active, Done, Paused, Archived, Dropped
  noteWidth?: 'normal' | 'wide' | null // Rich-editor width mode from `_width`
  modifiedAt: number | null // Unix timestamp (seconds)
  // Note: owner and cadence are now in the generic `properties` map
  createdAt: number | null  // Unix timestamp (seconds)
  fileSize: number
  wordCount: number | null  // Body word count (excludes frontmatter)
  snippet: string | null    // First 200 chars of body
  workspace?: WorkspaceIdentity // Mounted-workspace provenance for cross-vault graph entries
  archived: boolean         // Archived flag
  trashed: boolean          // Kept for backward compatibility (Trash system removed — delete is permanent)
  trashedAt: number | null  // Kept for backward compatibility (Trash system removed)
  properties: Record<string, VaultPropertyValue>  // Scalar and scalar-array custom properties
  fileKind?: 'markdown' | 'text' | 'binary'  // Controls editor/raw/preview behavior
}
```

### WorkspaceIdentity

Mounted workspace provenance is renderer-owned metadata attached to `VaultEntry.workspace` when entries are loaded through the registered workspace set. It is not parsed from note frontmatter and is not written into vault files.

```typescript
interface WorkspaceIdentity {
  id: string
  label: string
  alias: string          // Stable prefix used in cross-workspace wikilinks
  path: string           // Absolute workspace root
  shortLabel: string     // Compact note-list badge text
  color: string | null
  icon: string | null
  mounted: boolean
  available: boolean
  defaultForNewNotes: boolean
}
```

The status-bar workspace manager edits installation-local identity and mount state. The alias is the durable user-facing namespace for cross-workspace links such as `[[team/projects/alpha]]`; labels and colors are display affordances only. The default workspace controls where new notes and Type files are created; it is not a claim that only one vault is active. When multiple workspaces are enabled, every mounted available workspace participates in the graph and the active Git repository set.

Git-facing renderer code must pass an explicit repository path instead of assuming a single active vault. Changes and Pulse/history display one selected repository at a time, manual commit selects one target repository, and AutoGit checkpoints iterate every active repository. Diff, file history, note saves, and discarded changes resolve the repository from the note's workspace provenance or from the selected Git surface. Manual Sync refreshes vault-derived sidebar state and bumps a shared Git history refresh key after successful pulls, including `up_to_date` pulls, while automatic up-to-date checks avoid that heavier reload path.

`useGitFileWorkflows` is the renderer abstraction for note-scoped Git file actions. It translates active tabs, visible entries, and modified-file surfaces into the correct repository path for diff/history commands, deleted-note previews, queued editor diff requests, and discard refresh behavior.

### ProjectCanvas

`ProjectCanvas` is the file-backed spatial organization model for a `type: Project` note. It is defined in Rust (`src-tauri/src/project_canvas.rs`) and TypeScript (`src/projectCanvas.ts`) and deliberately stores layout and references, not long-form research content.

Canvas files are active-vault artifacts:

```text
projects/<project-id>/project.canvas.json
projects/<project-id>.canvas.json
```

The first form is canonical for bundle-style Projects with `project.md`; the second is the adjacent form for a Project represented as a single Markdown file. Both forms require the attached Markdown file to parse as `type: Project`.

```typescript
interface ProjectCanvas {
  version: 1
  project: string
  viewport: { x: number; y: number; zoom: number }
  nodes: ProjectCanvasNode[]
  edges: ProjectCanvasEdge[]
  sapientia: { schema: 'project-canvas/v1' }
}

type ProjectCanvasNodeType =
  | 'note'
  | 'paper'
  | 'paper_block'
  | 'image'
  | 'text'
  | 'task'
  | 'group'

type ProjectCanvasEdgeKind =
  | 'related'
  | 'supports'
  | 'contradicts'
  | 'depends_on'
  | 'needs_reading'
```

Referenced nodes point at existing vault objects through `ref`:

- `note`: a vault-relative Markdown path.
- `paper`: a vault-relative Paper note path.
- `paper_block`: a durable `@block[paper_id#block_id]` citation.
- `image`: a vault-relative image path, absolute image path, or image URL reference.
- `text`, `task`, and `group`: embedded canvas-local labels or short text only. Task nodes may also store a local `completed` state.

The canvas owns position, size, grouping, optional integer `zIndex`, viewport, short embedded cards, task completion state, image refs, and relationship edges. Notes, Papers, Paper metadata, Paper blocks, source images, and comments remain in their existing Markdown files and sidecars. Saving a canvas writes pretty JSON with deterministic node ordering by `(zIndex ?? 0, id)` and edge ordering by id so Git diffs stay reviewable. Legacy nodes without `zIndex` remain at layer zero. Reference resolution returns per-node `resolved`, `embedded`, or `stale` states plus diagnostics; missing Notes, Papers, Paper blocks, or image files must not corrupt the canvas or prevent other nodes from resolving.

`ProjectCanvasController` is the sole mutation boundary for align, distribute, bring-to-front, and send-to-back behavior. Each action updates the complete selection in one reversible Canvas transaction. The shadcn multi-selection toolbar dispatches these commands without owning geometry. Explicit stacking values round-trip through TypeScript, Rust, and MCP validation, while `CanvasSceneStore` keeps array-index ranks separate from visual-order ranks so incremental geometry patches do not rebuild the scene.

Project notes mount `ProjectWorkspaceSurface` and enter Canvas directly; the former `Note | Canvas` switch no longer defines two independent product surfaces. `PROJECT_OVERVIEW_NODE_ID` identifies the required `project_overview` node, a normal `note` reference to the Project's own Markdown path. TypeScript, Rust, mocks, and MCP normalization create this node for new Canvases and repair it in legacy Canvases while preserving its geometry. The root node cannot be deleted. `ProjectCanvasSurface` shows bounded cards for referenced Notes, Papers, Paper blocks, images, text cards, tasks, and groups; draws lightweight relationship edges; and persists pan/zoom plus node geometry through the Project Canvas commands. Missing Canvas files are created automatically. `ProjectDocumentPreview` loads full Markdown only for the selected Note/Paper through `noteContentCache`, strips frontmatter, and renders a bounded static preview; low zoom and unselected nodes do not trigger document loads. `projectCanvasViewport.ts` additionally culls offscreen node DOM with pixel overscan while retaining selected and edited nodes. The fixed Project Navigator remains a derived index over all persisted nodes, not a second membership store. Double-clicking one document node replaces that preview with the single `CanvasEditorPortal`. The portal owns one editor configured by `useSapientiaBlockNoteEditor`, mounts the shared `NoteSurface` into an active Note or Overview, preserves frontmatter during Markdown serialization, and saves the referenced path through the app save boundary. An active Paper routes the same editor and content through the existing `PaperReaderShell`, preserving its Markdown/PDF switch, metadata and parse actions, block citations, and file-backed comment threads without introducing Canvas-specific Paper state. Switching, closing, or deleting the active node flushes pending document work first. Focus Mode moves the same portal between the node and a Canvas-local full workspace frame; it does not remount a second editor or open another tab, and exiting restores the node editor. Wikilinks first resolve against persistent Canvas nodes. A vault Note or Paper not yet in the Project opens as one in-memory Peek node adjacent to the source; Peek edits save the referenced Markdown but do not change Canvas JSON, undo history, or Project membership until Pin is explicit. AI responses use the same review boundary: choosing a Project opens an in-memory AI draft Note card, and only `Save as Note` creates a Markdown Note and persists a body-free Canvas reference. Discarding the draft writes neither file. Inactive nodes remain static previews, Canvas JSON never stores editor state, and Inspector `Open` remains the explicit standalone-editor exit. The bottom toolbar adds existing objects and embedded cards, while the inspector edits selected objects. Duplicate refs focus the existing node.

External entry points do not mutate canvas JSON themselves. `addNodeToProjectCanvas()` is the application service for create-if-missing, ref normalization, centered placement, duplicate detection, persistence, and duplicate focus. `ProjectCanvasAddProvider` owns the shared Project picker and turns requests from Note/Paper context menus, rendered block citations, and compact AI-answer cards into that service call. `projectCanvasNavigation` carries the resulting Project path and node id across navigation so a newly mounted or already open `ProjectWorkspaceSurface` reloads the Canvas and selects the exact node after its saved state reloads.

`projectCanvasAiContext.ts` is the renderer-side evidence budget for Project-aware AI. `useProjectCanvasAiContext()` loads the active Project Canvas and ref diagnostics, while `projectCanvasSelectionStore` publishes only the active Project path and selected node id across docked/popped-out AI windows. Context includes the selected node, at most eight one-hop neighbors, compact Paper metadata, at most six bounded Note snippets, and exact SourceBlock text only for relevant `paper_block` nodes. Missing evidence degrades to stale counts instead of blocking the rest of the context. `ProjectCanvasAiContextBar` shows Project/Paper/citation/stale visibility and offers three prompt actions through the existing AI queue; those prompts tell agents to use Project and Paper tools rather than embedding whole papers in every request.

### Tolaria Deep Links

Deep links identify existing vault items with `tolaria://<vault-slug>/<relative-path-with-extension>`. The slug is derived from the registered workspace alias, then label, then path basename; generated links append a stable short hash when two vaults share the same base slug. A manually typed ambiguous base slug is rejected instead of choosing the wrong vault.

The relative path is encoded per segment, preserving `/` as the separator while allowing spaces, Unicode, and reserved characters inside filenames. Decoding rejects `.`, `..`, encoded slashes, backslashes, empty segments, and any resolved path outside the target vault root. Links keep the file extension so Markdown, text, media, PDFs, and other vault files can all route through the same `VaultEntry` lookup.

Deep links are navigation-only. Opening one can focus Tolaria, switch to a registered vault, reload the index once, and open an existing item; it never creates missing files, imports external files, or silently falls back to another vault. v1 links are path-based, so renaming or moving a file changes the canonical link. macOS and Windows are the verified v1 desktop targets; Linux registration is best-effort until package-level QA covers the supported desktop environments.

### File kinds and binary previews

`VaultEntry.fileKind` comes from the Rust vault scanner and intentionally stays coarse-grained:

| `fileKind` | Source files | UI behavior |
|---|---|---|
| `markdown` or absent | `.md`, `.markdown` | Full Tolaria note model: frontmatter, BlockNote, raw editor, relationships, title sync |
| `text` | UTF-8 editable formats such as `.yml`, `.json`, `.ts`, `.py`, `.sh` | Opens through the raw editor without Markdown note semantics; supported extensions get CodeMirror syntax highlighting |
| `binary` | Images, audio, video, PDFs, archives, other non-text files | Stays a normal vault file; previewable media and PDFs open in `FilePreview`, unsupported or broken binaries show an explicit fallback |

Asset previewability is inferred in the renderer from the filename extension (`src/utils/filePreview.ts`) rather than stored as a new persisted kind. Supported images render through `<img>`, supported audio/video render through native HTML media controls, and supported PDFs render through the webview's PDF object renderer, all backed by Tauri asset URLs. On Linux AppImage builds, `should_use_external_media_preview` can disable in-webview audio/video rendering so the same file blocks show filename/external-open fallback controls instead of triggering unstable WebKitGTK media playback. Runtime asset access is accumulated only for vault roots Tolaria has loaded in the current app session, because Tauri directory forbids cannot be safely reversed after a vault switch. The "open in default app" action re-enters the active-vault command boundary through `open_vault_file_external` before delegating to the native opener. This keeps the filesystem as source of truth and avoids converting assets into proprietary objects.

Markdown note PDF export is not a stored file-kind transformation. `src/utils/notePdfExport.ts` temporarily marks the current webview for print-only rendering, asks for a `.pdf` filesystem destination only when the native capability reports direct save support, and invokes Tauri's native `WKWebView` PDF export command on macOS. Windows/Linux Tauri builds and browser mode keep print-dialog fallback behavior. `src/components/useEditorPdfExport.ts` ensures the rich rendered note is active before export, so frontmatter is ignored and the PDF reflects the current rendered editor DOM while leaving the vault file unchanged.

### Sheet Nodes

A Markdown note with `_display: sheet` displays in the dedicated sheet editor instead of BlockNote. `type` remains semantic metadata, so a sheet can still be a `Project`, `Responsibility`, or any other Tolaria type. The note remains a plain-text file: frontmatter stores ordinary Tolaria properties plus `_sheet` presentation metadata, while the body stores CSV-like rows containing cell inputs and formulas.

`_sheet` follows the underscore system-property convention, so it is hidden from normal Properties UI but remains raw-editor editable. It currently stores workbook presentation state such as grid-line visibility and frozen rows/columns, plus column widths, row heights, and cell-level formatting such as number format, bold, italic, font size, color, fill, borders, alignment, and wrapping.

The renderer adapts this file format to an IronCalc workbook model when the note opens, then serializes the active single sheet back into the same frontmatter-plus-CSV representation after sheet interactions. Serialization is debounced and deferred to idle time when the webview supports it. The prototype intentionally does not expose multiple sheets inside one note; cross-note cell references use Tolaria wikilink syntax such as `[[other-sheet]].B5` instead of IronCalc workbook tabs.

For import ergonomics, simple Markdown wrappers in non-formula CSV cells are interpreted as initial cell styles (`**bold**`, `_italic_`, `***bold italic***`, and `~~strike~~`). After the sheet is saved, those styles persist through `_sheet` metadata and the CSV body keeps the unwrapped cell text.

### Note Content Freshness

The renderer may cache recently opened or preloaded markdown content, but cached content is only a performance hint. `useTabManagement` can reuse cached text immediately when it carries the same `modifiedAt` and `fileSize` identity as the current `VaultEntry`; otherwise it validates the cached string with the `validate_note_content` Tauri command. That command re-enters the same vault path boundary checks as `get_note_content` and compares the cached text against the current on-disk file bytes. A mismatch, missing file, or unreadable file falls back to the normal fresh-read path and existing missing/unreadable recovery. Background note prefetch is bounded to a small number of concurrent native reads, and a note opened while queued is promoted to foreground instead of waiting behind the prefetch backlog. Note-open entry objects are re-normalized at the tab boundary, so transient reload or bridge payloads with missing display metadata fall back to filename/title defaults before editor chrome renders; entries without a usable path are ignored instead of opening a broken tab.

`useEditorTabSwap` may reuse BlockNote blocks that were already opened successfully or warmed from prefetched raw content, keyed by vault, path, and exact source content. Background warming is limited to likely next large Markdown notes and defers while the editor is unmounted, raw mode is active, or recent typing/navigation is still inside the foreground idle window. Every async editor swap carries a generation and source-content token so stale conversion results cannot overwrite newer file content or dirty editor state.

`scripts/editor-performance-benchmark.mjs` exercises the same renderer note-open path without touching a real vault. It injects synthetic small and large Markdown notes through the browser/Tauri mock boundary, measures editor visibility, first rendered content, full block application, edit frame latency, and DEV-only editor timing logs, then compares medians against `.editor-performance-thresholds.json`. The threshold file is a ratchet: normal runs fail when medians exceed stored `maxMs` values, while `pnpm perf:editor:update` records the current baseline and only tightens existing maxima.

### Table of Contents Outline

The editor Table of Contents is derived from the live BlockNote document, not from saved Markdown text. `src/utils/tableOfContents.ts` reads structural `heading` blocks with stable ids and levels, extracts inline text from nested BlockNote content, and nests headings by level while preserving document order. `TableOfContentsPanel` receives a document revision from `Editor`, so rich-editor edits refresh the outline immediately without waiting for autosave or a vault reload. Selecting a heading focuses BlockNote and moves the cursor to that block id, while nested headings can be collapsed independently in panel-local UI state.

### Entity Types (isA / type)

Entity type is stored in the `type:` frontmatter field (e.g. `type: Quarter`). The legacy field name `Is A:` is still accepted as an alias for backwards compatibility but new notes use `type:`. The `VaultEntry.isA` property in TypeScript/Rust holds the resolved value.

Type is determined **purely** from the `type:` frontmatter field — it is never inferred from the file's folder location. All notes live at the vault root as flat `.md` files:

```
~/Laputa/
├── my-project.md          ← type: Project (in frontmatter)
├── weekly-review.md       ← type: Procedure
├── john-doe.md            ← type: Person
├── some-topic.md          ← type: Topic
├── AGENTS.md              ← canonical Tolaria AI guidance
├── CLAUDE.md              ← compatibility shim pointing at AGENTS.md
├── GEMINI.md              ← optional Antigravity/Gemini shim pointing at AGENTS.md
├── project.md             ← type: Type (definition document)
├── person.md              ← type: Type (definition document)
├── ...
```

New notes are created at the vault root: `{vault}/{slug}.md`. Changing a note's type only requires updating the `type:` field in frontmatter — the file does not move. Moving a note into a user folder is a separate filesystem concern: the folder path changes, but the note keeps the same filename and `type:` value. Legacy `type/` and `types/` folders are still scanned like other non-hidden vault folders, so existing type documents in those folders continue to work, but new type documents created by Tolaria are written at the vault root. Legacy `config/` content is still recognized during migration and repair, but Tolaria's managed AI guidance now lives at the vault root.

A `flatten_vault` migration command is available to move existing notes from type-based subfolders to the vault root.

### Types as Files

Each entity type can have a corresponding **type document**: any markdown note with `type: Type` in its frontmatter. Tolaria creates new type documents at the vault root (e.g., `project.md`, `person.md`) and still reads existing type documents from subfolders. Type documents:

- Have `type: Type` in their frontmatter (`Is A: Type` also accepted as legacy alias)
- Define type metadata: icon, color, order, sidebar label, template, sort, view, visibility
- Define instance schema/defaults through ordinary custom frontmatter properties and relationship fields
- Are navigable entities — they appear in the sidebar under "Types" and can be opened/edited like any note
- Serve as the "definition" for their type category

**Type document properties** (read by Rust and used in the UI):

| Property | Type | Description |
|----------|------|-------------|
| `icon` | string | Type icon as a Phosphor name (kebab-case, e.g., "cooking-pot") |
| `color` | string | Accent palette key (`red`, `purple`, `blue`, `green`, `yellow`, `orange`, `teal`, `pink`, `gray`) or a valid CSS color value such as `cyan`, `#22d3ee`, or `rgb(34, 211, 238)` |
| `order` | number | Sidebar display order (lower = higher priority) |
| `sidebar_label` | string | Custom label overriding auto-pluralization |
| `template` | string | Markdown template for new notes of this type |
| `sort` | string | Default sort: "modified:desc", "title:asc", "property:Priority:asc"; bare custom-property form such as "Priority:asc" is accepted and normalized in the UI |
| `view` | string | Default view mode: "all", "editor-list", "editor-only" |
| `visible` | bool | Whether type appears in sidebar (default: true) |

Type templates can be stored explicitly in the `template` frontmatter property. For hand-edited Type documents, Tolaria also treats the body after the Type note's own matching `# TypeName` heading as a new-note template when that body looks like a template (for example field labels, secondary headings, or checklist starters). Plain descriptive Type bodies are ignored so type documentation does not leak into every new note.

**Type relationship**: When any entry has an `isA` value (e.g., "Project"), the Rust backend automatically adds a `"Type"` entry to its `relationships` map pointing to `[[project]]`. This makes the type navigable from the Inspector panel while keeping location as an implementation detail.

**Instance schema/defaults**: Custom scalar/scalar-array properties and relationship fields on a type document define the expected shape for notes of that type. Existing instances do not get mutated when a type changes; the Inspector enriches their real frontmatter with gray placeholders for missing type-defined properties/relationships. Valued type fields are copied into frontmatter only when Tolaria creates a new instance of that type. Blank type fields stay as placeholders.

### Paper Bundles

A Paper is a normal Markdown vault entity with `type: Paper`. Imported PDFs use this bundle convention:

```text
papers/<paper-slug>/
  paper.md
  source.pdf
  blocks.jsonl
  comments.jsonl
  metadata.json
```

`paper.md` is the canonical entity note. `source.pdf` is immutable app-managed input, while `blocks.jsonl`, `comments.jsonl`, and `metadata.json` are durable sidecar conventions for parsing, comments, and metadata resolution. A missing sidecar means the corresponding phase has not produced that artifact yet.

The root `paper.md` Type document defines the Papers sidebar section. Paper identity is stored in `paper_id`, not inferred from title text, and the current source PDF pointer is the `source_pdf` frontmatter field.

Successful parsing writes or refreshes the editable Markdown body of `paper.md` as a human-readable Paper Note. Each generated source-evidence section is preceded by a hidden anchor comment such as `<!-- tolaria:block id="b0001" page="1" kind="paragraph" hash="sha256:..." -->`. The anchor is the bridge between Tolaria's normal note-reading model and block-addressable research workflows. Shared display and snippet paths strip those comments, so the anchors stay durable on disk without becoming visible reading text. Raw/source mode intentionally preserves them. User comments and long-form notes are not written into this body.

`blocks.jsonl` is a line-oriented SourceBlock sidecar and machine index. Each line must include `id`, `paper_id`, `kind`, `page`, and `hash`; optional fields include `text`, `caption`, `bbox`, `section`, `order`, `source_asset`, `asset_path`, `confidence`, and `parser`. `source_asset` records parser provenance, usually `source.pdf`; `asset_path` is a bundle-relative renderable asset such as `assets/figure-0001.png` for extracted figures. Tolaria reads the file through active-vault-bound Tauri commands and reports missing, empty, and malformed sidecars as recoverable states instead of treating parser output as app database state. After a successful parse, its SourceBlock ids, pages, kinds, and hashes must match the anchors written into `paper.md`.

Parser providers are installation-local settings, not vault-authored configuration. The provider set is `none`, `dev-fixture`, and `mineru`; `dev-fixture` writes deterministic sample SourceBlocks for local testing, while MinerU uses a configured API token directly or resolves it from an environment variable name before using the remote upload/poll/download flow to parse the local `source.pdf`. `parse_paper(vaultPath, paperId, settings)` resolves the Paper bundle through the active-vault boundary, writes normalized `blocks.jsonl`, writes or refreshes `paper.md` with anchored Markdown, updates `paper.md` parse metadata, and never mutates `source.pdf`. MinerU output is normalized to `title`, `heading`, `paragraph`, `figure`, `table`, `equation`, and `caption` SourceBlocks, retaining page and bbox values when available. When the MinerU result is a ZIP, Tolaria extracts image files into `papers/<paper-slug>/assets/`, maps matching figure/table blocks to `asset_path`, writes Markdown image syntax into `paper.md`, and appends fallback figure SourceBlocks for image files that MinerU extracted but did not reference. Failed parses set `parse_status: failed` and preserve any existing `blocks.jsonl` and Paper Markdown body. Once `paper.md` is marked `parse_status: parsed`, default parse calls return an `already_parsed` error instead of replacing editable Paper content; confirmed Reader reparses pass `force: true` to make the replacement explicit.

`metadata.json` is the canonical PaperMetadata sidecar. It stores resolved values, provider sources, candidate matches, confidence, resolver errors, and update timestamps. `paper.md` frontmatter mirrors only user-facing metadata fields: `title`, `authors`, `year`, `venue`, `venue_short`, `venue_type`, `publication_date`, `publication_stage`, `doi`, `arxiv_id`, `metadata_status`, and `metadata_confidence`. Local extraction reads PDF document metadata plus parsed `paper.md`/parser text, extracts DOI and arXiv identifiers, then uses OpenAlex as the primary remote resolver: DOI lookups are exact OpenAlex work requests, while title search results become high-confidence resolved metadata only when the title match is strong enough and otherwise remain candidates. Exact DOI/arXiv matches can become high-confidence metadata; fuzzy title/author matches stay candidates until applied. Manual metadata saves are recorded as a `manual` source with confidence `1.0`, clear pending candidates, and sync the mirrored frontmatter.

`PaperCatalogEntry` is a derived research-library projection, not persisted catalog data. It is rebuilt from Paper note frontmatter, optional `metadata.json` provider identifiers, and sidecar file presence. Catalog search normalizes DOI, arXiv ids, title fingerprints, and first-author names so users can find papers by bibliographic fields without adding a database. Duplicate candidates are exact for DOI, arXiv, OpenAlex, or Semantic Scholar ids and fuzzy for title plus year or first author. Tolaria only surfaces candidates for review; it never auto-merges Paper bundles. Dismissed duplicate decisions are stored as small vault-local review state in `papers/catalog-decisions.json`.

Paper-aware AI uses the same derived-file principle. The renderer context snapshot only embeds compact Paper metadata and discovered `@block[...]` citations; it does not dump full `paper.md` or `blocks.jsonl` into every prompt. The UI also derives a `PaperAiContextSummary` for visibility: the existing AI panel shows compact Paper-tool availability, whether Paper context was included, resolved block-citation counts, related Paper counts, and read-only mounted Paper Vault availability when those signals are relevant. Selected editor text is a separate opt-in `selectedContext`: the editor detects the current selection, but the AI context includes it only when the user explicitly enables the composer control. External AI clients use MCP Paper tools (`search_papers`, `list_papers`, `read_paper_metadata`, `read_paper_outline`, `search_paper_blocks`, `read_paper_blocks`, `get_paper_citation`, `get_block_citation`) to read exact Paper context on demand. Tool responses are citation-safe: paper title, `paperId`, vault/workspace identity, note path, page number when available, wikilink target, and canonical block citation are returned alongside compact snippets or requested block text. Mounted vaults are read through the existing active-workspace scope; write operations remain outside the Paper tool set.

Paper-aware guidance is prompt and tool guidance, not a new Ask Paper product surface. App-managed agents are instructed to use `search_papers` for discovery, `read_paper_metadata` before bibliographic claims, `search_paper_blocks`/`read_paper_blocks` for evidence, and `get_block_citation` for exact citations. They are also told to resolve `@block[...]` before discussing cited evidence, cite exact blocks for Paper-grounded claims, say when evidence is insufficient, avoid reading or dumping whole papers by default, and treat mounted Paper Vaults as read-only unless Tolaria exposes an explicit write path.

Block citations are durable Markdown tokens, not editor-only objects:

```markdown
@block[paper_id#block_id]
@block[paper_id#block_id "Display label"]
```

`src/paper/blockCitations.ts` owns parsing, formatting, and resolver-based validation. It preserves raw ranges for round-trip safety, skips inline/fenced code, and reports malformed tokens as validation issues. `MarkdownContent` can render valid tokens as clickable citation links and malformed closed tokens as warning chips. Clicking records pending block focus through `src/paper/blockCitationNavigation.ts` and opens the matching Paper entity when the vault index contains one.

`src/paper/PaperReaderShell.tsx` is the reader projection for Paper entries. It parses `paper.md` metadata and anchored Markdown sections, reads SourceBlocks through the `blocks.jsonl` command boundary, embeds the resolved `source.pdf` through the existing file preview path, reads `metadata.json` through the metadata command boundary, and renders a continuous Paper note view. Normal PDF/structure/metadata readiness is not shown as persistent header chrome; successful state is reflected in frontmatter and Properties. The central Markdown reading surface prefers the anchored `paper.md` projection; `blocks.jsonl` supports citation validation, comment grouping, block-focus lookup, and repair diagnostics. Missing/empty parsed structure stays recoverable, while malformed sidecars still expose structured diagnostic errors. The Reader keeps explicit `Parse Paper` and `Paper metadata` actions in the header; reparsing existing parsed content triggers a confirmation dialog, and metadata refresh lives inside the `Paper metadata` dialog so review/edit/refresh share one surface. With the MinerU provider selected, the parse action is labeled "Parse with MinerU"; failed parse metadata renders provider error detail without hiding existing loaded blocks.

The reader normalizes SourceBlock kinds for display as `title`, `heading`, `paragraph`, `figure`, `table`, `equation`, and `caption`. `src/paper/paperReaderBlocks.ts` owns sidecar-health and block display helpers so those conventions stay separate from the durable SourceBlock sidecar contract. Paper Markdown generation renders extracted figure and table assets as normal Markdown images, cleans leaked internal math sentinels into display math, lightly normalizes LaTeX spacing, and converts simple tab-delimited table text into Markdown tables when no table image asset is present. Each rendered block has a stable DOM anchor of `paper-block-<block_id>`. Block selection is local UI state; copying citations uses the canonical formatter, comments attach to selected blocks through the comment gutter/thread, and pending citation navigation focuses the matching block when available. If a selected block has a page number, the shell records and displays a PDF page focus request in PDF mode; direct PDF page seeking, block overlays, and PDF-coordinate comment rendering remain separate future surfaces.

`src/components/NoteSurface.tsx` is the shared note rendering surface used by ordinary notes and Paper Markdown mode. Ordinary notes use it as the existing editable `SingleEditorView` path. Paper also uses that editable path with comment options so parsed `paper.md` behaves like a normal Tolaria note while Paper comments remain sidecar-backed.

`src/comments/commentProvider.ts` is the generic Note Editor comment seam. It models anchors and comments without knowing how a backing store persists them. `src/components/comments/CommentUI.tsx` provides reusable comment gutter, thread, and composer components. Phase 4F wires only Paper to this seam through `src/paper/paperCommentProvider.ts`, which adapts block-level records from `comments.jsonl` into generic comment threads. Normal notes do not use the seam yet because Tolaria still needs a durable generic note-block anchor convention before comments can safely survive edits and Markdown round-trips.

`comments.jsonl` is the line-oriented Paper comment sidecar for block-local Paper comments and threads. Each line includes `id`, `paper_id`, `kind: comment`, `created_at`, and either a `block_id` or future `page` plus `bbox` target. Optional thread fields include `replies`, `reactions`, `resolved_at`, `updated_at`, and `deleted_at`. Tolaria validates and rewrites the sidecar through active-vault-bound Tauri commands (`read_paper_comments`, `save_paper_comment`, `delete_paper_comment`, `reset_paper_comments`) while leaving `source.pdf` immutable; those command names are compatibility API names and no longer imply an comment/highlight data model. The Paper Reader creates comments from selected text or the rendered block gutter, edits comment text inline in a block thread, shows counts beside SourceBlocks, and treats missing/empty/malformed comment sidecars as recoverable UI states. Legacy kind/color values from earlier Paper Reader iterations are deprecated and rejected by the current reader/writer.

Comments, ordinary notes, and future memory are distinct abstractions. A generic comment is UI around an anchor plus provider-backed mutations. A Paper comment is currently represented as a block-level comment record with `kind: comment` stored in `comments.jsonl`. Highlighting, inline formatting, and other markup belong to the normal BlockNote editor/Markdown model rather than the Paper comment sidecar. Long-form synthesis belongs in ordinary Markdown `Note` entries that link to Paper through wikilinks/backlinks and can contain durable `@block[...]` citations back to the paper. Future memory artifacts are compiled/synthesized research context and must preserve provenance instead of becoming the storage location for comments.

Paper no longer owns a default paper-local note convention, dedicated research-note type, or Reader action for long-form notes. Users create ordinary `Note` entries through Tolaria's normal note workflows when they need long-form notes about a paper. Those notes may link to Paper with existing wikilinks/backlinks and cite parsed Paper blocks with `@block[paper_id#block_id]`, but Paper Reader does not create, preview, or append to a special note.

**UI behavior**:
- Clicking a section group header pins the type document at the top of the NoteList if it exists
- Viewing a type document in entity view shows an "Instances" group listing all entries of that type
- The Type field in the Inspector is rendered as a clickable chip that navigates to the type document

### Frontmatter Format

Standard YAML frontmatter between `---` delimiters:

```yaml
---
title: Write Weekly Essays
type: Procedure
status: Active
belongs_to:
  - "[[grow-newsletter]]"
related_to:
  - "[[writing]]"
aliases:
  - Weekly Writing
---
```

Supported value types (defined in `src-tauri/src/frontmatter/yaml.rs` as `FrontmatterValue`):
- **String**: `status: Active`
- **Number**: `priority: 5`
- **Bool**: `archived: true`
- **List**: Multi-line `  - item` or inline `[item1, item2]`
- **Null**: `owner:` (empty value)

Custom frontmatter fields with scalar values are exposed through `VaultEntry.properties`. Custom fields with scalar arrays are also exposed there, unless any array value contains a wikilink; wikilink-bearing fields belong to `VaultEntry.relationships`. Single-item scalar arrays continue to normalize to their scalar value for compatibility, while multi-item scalar arrays remain arrays so saved view filters can match exact elements.

### Custom Relationships

The Rust parser scans all frontmatter keys for fields containing `[[wikilinks]]`. Any non-standard field with wikilink values is captured in the `relationships` HashMap:

```yaml
---
Topics:
  - "[[writing]]"
  - "[[productivity]]"
Key People:
  - "[[matteo-cellini]]"
---
```

Becomes: `relationships["Topics"] = ["[[writing]]", "[[productivity]]"]`

This enables arbitrary, extensible relationship types without code changes.

### Outgoing Links

All `[[wikilinks]]` in the note body (not frontmatter) are extracted by regex and stored in `outgoingLinks`. Used for backlink detection and relationship graphs.

### Title / Filename Sync

Tolaria separates **display title** from the file identifier:

- **Display title resolution** (`extract_title` in `vault/parsing.rs`): first `# H1` on the first non-empty body line, then legacy frontmatter `title:`, then slug-to-title from the filename stem.
- **Opening a note is read-only**: selecting a note does not inject or auto-correct `title:` frontmatter.
- **Explicit filename actions** (`rename_note`): breadcrumb rename/sync actions stage crash-safe note renames through a hidden `.tolaria-rename-txn/` transaction directory, recover unfinished renames on the next vault scan, update wikilinks across the vault, and surface any failed backlink rewrites instead of silently reporting partial success. The editor body remains the title editing surface.
- **Unicode-aware note stems** (`src/utils/noteSlug.ts`, `vault/rename.rs`): frontend and backend slugging preserve Unicode letters/digits in note filenames, untitled-rename detection, and fallback wikilink targets while still collapsing symbol-only titles to `untitled`.
- **Path identity rules** (`src/utils/notePathIdentity.ts`, `vault/path_identity.rs`): note creation, tab selection, rename bookkeeping, pull refresh, git history, and vault cache updates normalize path separators and macOS `/private/tmp` aliases through one owner. Case folding is reserved for collision/deduplication checks; active-note identity remains case-sensitive.
- **Portable filename validation** (`vault/filename_rules.rs`): note filenames, folder names, and custom view filenames all reject Windows-reserved device names, invalid characters, and trailing dot/space suffixes so a vault created on macOS/Linux still clones and syncs cleanly on Windows.
- **Recoverable save failures** (`useEditorSave`, `vault/file.rs`): invalid platform path syntax is reported as a clear retryable save error, while transient access-denied writes are retried briefly before surfacing failure. The editor keeps the unsaved buffer intact for another attempt.
- **Untitled drafts** start as `untitled-*.md` and are auto-renamed on save once the note gains an H1.

### Title Surface (UI)

The BlockNote body is the only title editing surface:

- The first H1 is the canonical display title.
- There is no separate title row above the editor, even when a note has no H1.
- Notes without an H1 show the editor body and placeholder only.
- Legacy no-H1 notes whose display title differs from the filename show that title as read-only breadcrumb context beside the editable filename, so referenced notes remain identifiable without raw mode.
- Filename changes are explicit breadcrumb actions, not a dedicated title-input side effect.

### Sidebar Selection

Navigation state is modeled as a discriminated union:

```typescript
type SidebarFilter = 'all' | 'archived' | 'changes' | 'pulse'

type SidebarSelection =
  | { kind: 'filter'; filter: SidebarFilter }
  | { kind: 'sectionGroup'; type: string }    // e.g. type: 'Project'
  | { kind: 'folder'; path: string; rootPath?: string }
  | { kind: 'entity'; entry: VaultEntry }      // Neighborhood source note
  | { kind: 'view'; filename: string }
```

`SidebarSelection.kind === 'folder'` is a first-class navigation target, not just a visual highlight.

- `FolderTree` keeps the folder interaction surface decomposed into `FolderTreeRow`, `FolderNameInput`, `FolderContextMenu`, and disclosure/context-menu hooks so nested row rendering, inline rename, and right-click actions stay isolated. The UI wraps backend folder nodes in a synthetic vault-root row with `path: ""` and `rootPath` set to the opened vault so root-level files can be listed without turning the vault root into a mutable folder. Inline folder creation carries an optional `FolderCreationParent` (`path` plus `rootPath`) through `App` to the `create_vault_folder` command, so new folders land under the selected folder or selected mounted vault root while preserving the active-vault path boundary. Non-mutating reveal/copy-path menu items stay callback-driven from `App` so filesystem convenience actions do not leak into folder mutation hooks.
- `src/components/sidebar/sidebarHooks.ts` owns the shared sidebar interaction primitives for menu positioning/dismissal and inline rename input behavior. Folder, Type, and saved View rows keep their domain-specific actions local, but use those primitives so right-click menus and rename fields have the same outside-click, Escape, focus, blur, and submit semantics.
- `useFolderActions()` composes `useFolderRename()` and `useFolderDelete()` to keep folder mutations selection-aware while the rest of `App.tsx` only wires the resulting callbacks into `Sidebar` and the command registry.
- `useNoteRetargeting()` is the shared retargeting abstraction for note drops and command-palette actions. It owns the "can drop here?" checks, updates `type:` via frontmatter when a note lands on a type section, and delegates folder moves through the same crash-safe rename pipeline used by the backend rename commands.
- A successful folder rename reloads the folder tree plus vault entries, rewrites any affected folder-scoped tabs, and updates `SidebarSelection` to the new relative path when the renamed folder stays selected.
- Folder deletion clears pending rename state, confirms destructive intent, drops affected folder-scoped tabs, reloads vault data, and resets folder selection if the deleted subtree owned the current selection.

### Collections

Collections are the renderer-side foundation for note groups plus their presentation configuration. A collection can come from a built-in filter, type section, folder, saved View, or Neighborhood mode. Product terminology can stay simple: users select a collection and Tolaria presents it.

`SidebarSelection` remains the navigation state for now, but it is adapted into a `CollectionDefinition` by `src/collections/collectionFromSelection.ts`. The collection keeps the original selection for compatibility, adds an `origin` for implementation routing, and normalizes the current presentation to:

```typescript
type CollectionPresentationConfig =
  | { type: 'list'; sort: string | null; properties: string[] }
```

`src/collections/resolveCollectionEntries.ts` resolves the selected collection through the existing note-list filtering rules. Changes and Inbox stay caller-supplied transient flows because they depend on git state and inbox-period state outside saved-view YAML. Neighborhood resolves to grouped relationship data instead of a flat row list.

This layer is intentionally internal and behavior-preserving. It lets future presentations such as board, calendar, table, timeline, or graph consume the same resolved collection model instead of branching directly on sidebar state. Presentation config maps existing note properties; it does not create a separate data model.

### Saved Views

Saved Views live as YAML files under `views/`. Their definition includes user-visible fields (`name`, `icon`, `color`), note-list preferences (`sort`, `listPropertiesDisplay`), filters, and an optional top-level `order` number. The renderer treats saved Views as the most configurable persisted Collection artifact. Existing top-level `sort` and `listPropertiesDisplay` fields normalize into the list presentation config, and a future nested `presentation` block may override them in memory when present. The `sort` value accepts built-in sort forms such as `"modified:desc"` and custom-property forms such as `"property:Priority:asc"` or bare `"Priority:asc"`; the renderer keeps configured custom-property sorts visible even when the current result set has no populated values for that property. Filter conditions on scalar-array custom properties, such as `tags: [blues, chicago]`, evaluate `contains`, `any_of`, and related set operators against exact array elements rather than substrings. The `order` value is stored directly in the YAML document, not in Markdown frontmatter, and lower values render earlier in every saved-View list. Views without an explicit order sort after ordered views by filename for stable fallback behavior.

In a mounted-workspace graph, each loaded `ViewFile` carries optional renderer-owned `rootPath` and `workspace` provenance. `SidebarSelection.kind === 'view'` can include that `rootPath`, and view identity is `(rootPath, filename)` rather than filename alone. This lets two vaults both expose `views/focus.yml` without colliding in sidebar selection, note-list filtering, counts, sort/column persistence, edit, or delete flows. A saved View with `rootPath` filters only entries from its own workspace and persists changes through `save_view_cmd` / `delete_view_cmd` against that source vault.

`useAppViewActions()` owns the renderer-side saved View lifecycle: choosing the target workspace, preserving mounted-view identity, saving/deleting YAML definitions, reloading affected vault state, and exposing the available note-list fields for the create/edit dialog. `App.tsx` wires those callbacks into `Sidebar`, `NoteList`, `CreateViewDialog`, and command surfaces without duplicating the persistence rules.

`useMcpSetupDialogController()` owns MCP setup dialog state, busy actions, and manual config callbacks so `App.tsx` only passes the controller into settings/status surfaces. `useAiWorkspaceWindowBridgeEvents()` owns native AI-workspace event subscriptions and listener cleanup for popped-out workspace windows.

`createCrossWindowPersistedStore()` is the shared renderer primitive for AI workspace state that must stay synchronized across the main window and popped-out workspace windows. It owns localStorage reads/writes, BroadcastChannel publishing, storage-event synchronization, and external-store subscribers; domain modules such as `aiWorkspaceSessionStore` and `aiWorkspaceWindowSharedContext` provide sanitizers and mutations around that shell.

The renderer uses `viewOrdering` helpers to convert drag or command-palette move intent into dense order updates before saving each affected view file through `save_view_cmd`. The sidebar treats saved View rows like Type rows for direct customization: double-click starts inline rename, right-click opens edit/rename/icon-color/delete actions, and keyboard users can open that same menu from the focused row while command-palette actions remain responsible for saved View ordering.

### Neighborhood Mode

`SidebarSelection.kind === 'entity'` is Tolaria's Neighborhood mode for note-list browsing.

- The selected `entry` is the neighborhood source note.
- The source note stays pinned at the top of the note list as a standard active row, not a special card.
- Outgoing relationship groups render first using the note's `relationships` map.
- Inverse groups (`Children`, `Events`, `Referenced by`) and `Backlinks` render after the outgoing groups.
- Empty groups stay visible with count `0`.
- Notes may appear in multiple groups when multiple relationships are true; Neighborhood mode does not deduplicate them across sections.
- Plain click / `Enter` open the focused note without replacing the current Neighborhood.
- Cmd/Ctrl-click and Cmd/Ctrl-`Enter` open the note and pivot the note list into that note's Neighborhood.

## Command Surface

`src/shared/appCommandManifest.json` is the cross-runtime source for stable app command IDs, menu structure, display labels, accelerators, deterministic shortcut QA metadata, and native menu enablement groups. The renderer imports it through `src/hooks/appCommandCatalog.ts`, which derives `APP_COMMAND_IDS`, shortcut lookup maps, custom titlebar menu sections, native-menu command membership, and test helpers. Tauri includes the same JSON in `src-tauri/src/menu.rs` and uses it to build custom menu items, emit overridden menu item IDs such as the quick-open alias as their primary command IDs, and toggle state-dependent menu items from manifest groups.

Domain command builders still own context-sensitive command-palette entries, availability, and execution callbacks. The manifest owns metadata that must stay identical across native menus, renderer shortcuts, deterministic QA bridges, and the custom desktop titlebar menu; OS-native menu items such as Undo, Copy/Paste, Services, Quit, and Window controls remain local to the native menu implementation.

`useActionHistory` is the renderer-owned stack for reversible app-level actions. It records note-state actions only after persistence succeeds, replays one undo/redo at a time, and reveals the affected note before applying the reversal so editor pending-content flushes stay path-correct. Text editors and text inputs keep their native undo/redo history; app-level Undo/Redo shortcuts are handled only when focus is outside text-editing surfaces.

## File System Integration

### Vault Scanning (Rust)

`vault::scan_vault(path)` in `src-tauri/src/vault/mod.rs`:

1. Validates the path exists and is a directory
2. Recursively scans non-hidden files while skipping hidden directories such as `.git/`
3. For each `.md` file, calls `parse_md_file()`:
   - Reads content with `fs::read_to_string()`
   - Parses frontmatter with `gray_matter::Matter::<YAML>`
   - Extracts title from first `#` heading
   - Reads entity type from `type:` frontmatter field (`Is A:` accepted as legacy alias); type is never inferred from folder
   - Parses dates as ISO 8601 to Unix timestamps
   - Extracts relationships, outgoing links, custom properties, word count, snippet
4. For recognized non-markdown text and binary files, emits a minimal `VaultEntry` with `fileKind`
5. Sorts by `modified_at` descending
6. Skips unparseable files with a warning log

All Notes starts from Markdown notes and excludes Markdown files under `attachments/`. `src/utils/allNotesFileVisibility.ts` resolves the installation-local PDF, image, and unsupported-file toggles from app settings; `noteListHelpers` applies that policy only to All Notes filtering and counts. Folder/root browsing continues to show files from the selected folder independently of those All Notes toggles.

The folder tree hides the legacy `type/` directory, since those type documents already appear through the Types sidebar section. Default vault folders such as `attachments/` and `views/` remain visible alongside user-created folders under the synthetic vault-root row.

Command-facing vault content is filtered through `vault::filter_gitignored_entries`, `vault::filter_gitignored_folders`, and `vault::filter_gitignored_paths` when the app setting `hide_gitignored_files` is enabled. The cache still stores the complete scan; `list_vault`, `reload_vault`, `list_vault_folders`, and search apply the visibility filter at the boundary before React consumes entries. The filter batches paths through `git check-ignore --no-index --stdin`, drains stdout while stdin is still being written, and short-circuits root `.gitignore` detection before walking for nested ignore files, so large ignored folder sets cannot deadlock the native UI while preserving Git semantics as closely as the app can reasonably support.

A `vault_health_check` command detects stray files in non-protected subfolders and filename-title mismatches. On vault load, a migration banner offers to flatten stray files to the root via `flatten_vault`.

Command-layer path access is fenced to the active vault before file operations reach the vault backend. `src-tauri/src/commands/vault/boundary.rs` canonicalizes the configured/requested vault root, rejects `..` escapes and absolute paths outside that root, and validates writable targets through the nearest existing ancestor so note reads, saves, deletes, view-file edits, folder mutations, and image attachment writes cannot step outside the active vault. If the active root itself cannot be canonicalized, the renderer treats `Active vault is not available` the same as no active vault: it clears stale vault state, drops prefetched note content, and shows the missing-vault recovery screen instead of continuing note/view requests against the disappeared path. Image attachment commands add the current vault root to the runtime asset scope after saving so files created under a previously missing `attachments/` directory can render immediately.

Renderer attachment paths are normalized through `src/utils/vaultAttachments.ts`. That module is the single owner for converting between portable markdown references such as `attachments/image.png`, Tauri asset URLs, and absolute active-vault filesystem paths. Editor markdown rendering, raw-mode serialization, image upload/drop handling, file-block open actions, and parsed image cleanup all call this primitive instead of carrying their own asset URL prefixes, Windows path normalization, or `attachments/` join rules.

UI-only file actions operate on paths that are already selected or indexed in React state. Reveal-in-Finder routes through the Tauri opener plugin, external-open routes through the `open_vault_file_external` command and active-vault boundary before invoking the native opener, and copy-path uses the browser clipboard API. Plain-text paste reads the desktop clipboard through `read_text_from_clipboard` in Tauri so macOS WKWebView clipboard permissions do not block the command; browser/mock mode falls back to the Web Clipboard API or mock handlers. None of those actions mutate vault contents or bypass the backend write boundary.

The local MCP WebSocket bridge follows the same active-vault boundary. `useVaultSwitcher` calls `sync_mcp_bridge_vault` after the persisted selection loads and after each vault switch; the desktop command starts/restarts the bridge with the active mounted workspace set in `VAULT_PATHS`, or stops it when there is no selected vault. App exit uses the same child cleanup path and waits for the bridge process after killing it. MCP Node entrypoints accept explicit `VAULT_PATH`/`VAULT_PATHS` for app-owned or legacy launches; durable external registrations omit vault env and resolve the current mounted workspace set from Tolaria's `vaults.json` at tool-call time. `mcp-server/tool-service.js` owns the shared tool semantics for active-vault resolution, cross-vault lookup/search, note-creation defaults, vault listing, Project/Paper ambiguity handling, and UI action intents; `paper-tools.js` and the split `project-canvas-{model,storage,context,tools}.js` modules derive compact research data at call time, while `mcp-server/index.js` and `mcp-server/ws-bridge.js` remain transport adapters. Read-only Project tools may inspect all active mounted vaults, but `add_node_to_project_canvas` requires an explicit `vaultPath` whenever the write target is not unique. Manual MCP config export uses the same packaged `mcp-server/` resolver as registration and app-managed AI agents, including Windows executable-adjacent installs under `%LOCALAPPDATA%\Tolaria`, and strips Windows extended-length `\\?\` prefixes from the exported `index.js` argument before handing it to Node, so the copied snippet stays durable across active-workspace changes without writing third-party config files. Vault context checks each active workspace root for `AGENTS.md` and returns those instructions alongside note counts, folders, and recent notes. Desktop snippet copy goes through the native `copy_text_to_clipboard` command, while browser/mock mode keeps using the Web Clipboard API. External-client stdio MCP processes also exit when stdin closes; their UI-bridge reconnect timers and WebSocket are canceled during shutdown so disconnected clients do not leave extra Node processes behind.

### Vault Caching

`vault::scan_vault_cached(path)` wraps scanning with git-based caching:

1. Reads cache from `~/.laputa/cache/<vault-hash>.json` (external to vault)
2. Compares cache version, vault path, and git HEAD commit hash
3. If cache is valid and same commit → only re-parse uncommitted changed files
4. If different commit → use `git diff` to find changed files → selective re-parse
5. If no cache → full scan
6. Replaces the cache with a temp-file write + rename only if a short-lived writer lock and cache fingerprint check show another scan has not already refreshed it
7. On first run, migrates any legacy `.laputa-cache.json` from inside the vault

Startup entry hydration calls the cached `list_vault` path first for both the main window and secondary note windows. The main window alone treats an empty cached startup result as suspicious and retries with `reload_vault`; explicit user reloads, watcher refreshes, and Git pull refreshes still use reload paths when disk freshness is required.

### Frontmatter Manipulation (Rust)

`frontmatter/ops.rs:update_frontmatter_content()` performs line-by-line YAML editing:

1. Finds the frontmatter block between `---` delimiters
2. Iterates through lines looking for the target key
3. If found: replaces the value (consuming multi-line list items if present)
4. If not found: appends the new key-value at the end
5. If no frontmatter exists: creates a new `---` block

The `with_frontmatter()` helper wraps this in a read-transform-write cycle on the actual file.

### Content Loading

- **Tauri mode**: Content loaded on-demand when a tab is opened via `invoke('get_note_content', { path })`
- **Browser mode**: All content loaded at startup from mock data
- Content for backlink detection (`allContent`) is stored in memory as `Record<string, string>`

## Git Integration

Git operations live in `src-tauri/src/git/`. All operations shell out to the `git` CLI (not libgit2). Path-producing commands use `core.quotePath=false` so Unicode note filenames stay as UTF-8 paths across status, history, cache invalidation, and rename detection. Git subprocesses also inherit the user's shell-managed Git identity/config environment when the app process is missing it, including `GIT_AUTHOR_*`, `GIT_COMMITTER_*`, `GIT_CONFIG_*`, `XDG_CONFIG_HOME`, and `EMAIL`.

### Data Types

```typescript
interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  date: number       // Unix timestamp
}

interface ModifiedFile {
  path: string          // Absolute path
  relativePath: string  // Relative to vault root
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'
}

interface GitRemoteStatus {
  branch: string
  ahead: number
  behind: number
  hasRemote: boolean
}

interface GitAddRemoteResult {
  status: 'connected' | 'already_configured' | 'incompatible_history' | 'auth_error' | 'network_error' | 'error'
  message: string
}

interface PulseCommit {
  hash: string
  shortHash: string
  message: string
  date: number
  githubUrl: string | null
  files: PulseFile[]
  added: number
  modified: number
  deleted: number
}
```

### Operations

| Module | Operation | Notes |
|--------|-----------|-------|
| `history.rs` | File history | `git log` — last 20 commits per file |
| `status.rs` | Modified files | `git status --porcelain` — filtered to `.md` |
| `status.rs` | File diff | `git diff`, fallback to `--cached`, then synthetic for untracked |
| `file_url.rs` | File URL | Builds a copyable remote URL from the primary remote, current branch, and vault-relative path without exposing remote credentials |
| `author.rs` | Author identity | Resolves the exact commit author Tolaria will use, heals the legacy Tolaria fallback email, and reports when repo-local identity shadows the global Git identity |
| `commit.rs` | Commit | Ensures a local author fallback when needed, then runs `git add -A && git commit -m "..."`; broken signing helpers trigger one unsigned retry for the same app-managed commit |
| `remote.rs` | Pull / Push | `git pull --rebase` / `git push` |
| `connect.rs` | Add remote | Adds `origin`, fetches it, validates history compatibility, and only starts tracking when the remote is safe |
| `conflict.rs` | Conflict resolution | Detect conflicts, resolve with ours/theirs/manual, and ensure a local author fallback before commit/rebase continuation |
| `pulse.rs` | Activity feed | `git log` with `--name-status` for file changes |

### Auto-Sync

`useAutoSync` hook handles automatic git sync across every active Git repository:
- Configurable interval (from app settings: `auto_pull_interval_minutes`)
- Pulls the active repository set concurrently on launch, focus, interval, and manual sync
- Budgets automatic launch/focus/interval pulls per repository with a short cooldown so focus or low interval settings do not repeat network Git work immediately after a recent sync; manual sync bypasses this budget
- Refreshes aggregate remote status after a pull, and avoids a separate startup status fetch when the initial pull will already refresh it
- Pushes the active repository set during divergence recovery
- Awaits the post-pull vault refreshes so toasts land after note-list state is fresh
- Reopens the clean active tab from disk only when the pull changed that active note, then restores editor focus if the editor owned focus before the remount
- Detects merge conflicts → opens `ConflictResolverModal`
- Tracks aggregate remote status (ahead/behind via `git_remote_status`)
- Handles push rejection (divergence) → sets `pull_required` status
- `pullAndPush()`: pulls then auto-pushes each active repository for divergence recovery
- `ConflictNoteBanner`: inline banner in editor for conflicted notes (Keep mine / Keep theirs)

### External Vault Refresh

External vault mutations are any disk writes Tolaria did not just perform through its own save path: Git pulls, AI-agent writes, filesystem watcher events, and edits from another app. These changes must route through `refreshPulledVaultState()` rather than calling `reloadVault()` in isolation. The shared refresh abstraction reloads entries, folders, and saved views together, preserves unsaved active-editor content, reopens a clean active note when the changed-path list includes that note, and closes the active tab if the file disappeared. Editor focus does not block the clean active note from converging to disk when its own file changed externally; if the active editor owned focus before that remount, the app requests editor focus again after the fresh tab is mounted. Unknown or unrelated watcher updates refresh vault-derived state without remounting the active editor. `useVaultWatcher` supplies changed filesystem paths to this abstraction after debouncing and after filtering recent app-owned saves. Overlapping entry reloads and modified-file polls are coalesced with a single trailing rerun so watcher and sync bursts do not stack native vault scans or Git status processes.

`useGitRepositories` is the commit-time companion to `useAutoSync`:
- Owns repository picker validation plus `get_modified_files` and `git_remote_status` loading for active Git repositories
- Re-checks the selected repository when the Commit dialog opens and right before submit
- Converts `hasRemote: false` into a local-only commit path
- Keeps the normal push path unchanged for repositories that do have a remote

`AddRemoteModal` is the explicit recovery path for those local-only vaults:
- Opens from the `No remote` status-bar chip and the command palette
- Calls `git_add_remote` with the current vault path and the pasted repository URL
- Shows auth, network, and incompatible-history failures inline without rewriting the local vault's history

`useAutoGit` is the checkpoint-time companion to both hooks:
- Consumes installation-local AutoGit settings (`autogit_enabled`, idle threshold, inactive threshold)
- Tracks the last meaningful editor activity plus app focus/visibility transitions
- Triggers `useCommitFlow.runAutomaticCheckpoint()` only when the vault is git-backed, pending changes exist, and no unsaved edits remain
- Shares the same deterministic automatic commit message generator with the bottom-bar Commit button, so timer-driven checkpoints and manual quick commits produce the same `Updated N note(s)` / `Updated N file(s)` messages

### Frontend Integration

- **Modified file badges**: Orange dots in sidebar
- **Diff view**: Toggle in breadcrumb bar → shows unified diff
- **Git history**: Shown in Inspector panel for active note
- **Commit dialog**: Triggered from sidebar or Cmd+K
- **No remote indicator**: Neutral chip in the bottom bar when `GitRemoteStatus.hasRemote === false`
- **Pulse view**: Activity feed when Pulse filter is selected
- **Pull command**: Cmd+K → "Pull from Remote", also in Vault menu
- **Git status popup**: Click sync badge → shows aggregate ahead/behind and a Pull button for the active repository set
- **Conflict banner**: Inline banner in editor with Keep mine / Keep theirs for conflicted notes

## BlockNote Customization

The editor uses [BlockNote](https://www.blocknotejs.org/) for rich text editing, with CodeMirror 6 available as a raw editing alternative.

### Custom Wikilink Inline Content

Defined in `src/components/editorSchema.tsx`:

```typescript
const WikiLink = createReactInlineContentSpec(
  {
    type: "wikilink",
    propSchema: { target: { default: "" } },
    content: "none",
  },
  { render: (props) => <span className="wikilink">...</span> }
)
```

### Code Block Highlighting

Defined in `src/components/editorSchema.tsx` and styled in `src/components/EditorTheme.css`:

- The schema overrides BlockNote's default `codeBlock` spec with `createCodeBlockSpec({ ...codeBlockOptions, defaultLanguage: "text" })` from `@blocknote/code-block`.
- Fenced code blocks now use BlockNote's supported Shiki-backed highlighter path, which renders `.shiki` token spans directly inside the editor DOM.
- Missing common grammars live in `src/utils/codeBlockLanguageCatalog.ts` and are registered lazily from direct `@shikijs/langs` imports by `src/components/codeBlockOptions.ts`; known aliases such as `ps1` and `vb` normalize to canonical picker values during Markdown import.
- Tolaria keeps `defaultLanguage: "text"` so unlabeled code blocks do not silently become JavaScript at creation time. Parsed unlabeled code blocks then run through Tolaria's lightweight language inference, while explicit fence languages and user dropdown choices still win.
- Inline-code chip styling remains scoped to `.bn-inline-content code`, so fenced `pre > code` nodes keep the dedicated code-block shell instead of inheriting the muted inline surface.

### Markdown Math

Defined in `src/utils/mathMarkdown.ts`, `src/components/editorSchema.tsx`, and styled in `src/components/EditorTheme.css`:

- `$...$` becomes a `mathInline` schema node and line-owned `$$...$$` / multiline `$$` blocks become `mathBlock` nodes.
- The rich editor renders both node types through KaTeX with `throwOnError: false`, so malformed formulas keep their source visible instead of breaking the note.
- Double-clicking rendered display math edits the math block's `latex` property in-place; Markdown delimiters remain owned by serialization. Inline math can still be reopened as source text for direct editing.
- `serializeMathAwareBlocks()` converts math nodes back to Markdown delimiters before save, raw-mode entry, and editor-position snapshots.
- Raw CodeMirror mode always shows the plain Markdown source, so imported technical notes stay editable outside Tolaria.

### Mermaid Diagrams

Defined in `src/utils/durableMarkdownBlocks.ts`, `src/utils/editorDurableMarkdown.ts`, `src/utils/mermaidMarkdown.ts`, `src/components/MermaidDiagram.tsx`, `src/components/editorSchema.tsx`, and styled in `src/components/EditorTheme.css`:

- Fenced `mermaid` blocks become `mermaidBlock` schema nodes before BlockNote sees the Markdown body.
- Each `mermaidBlock` stores the original fenced Markdown plus the diagram body, so raw-mode entry and saves can restore the canonical source instead of serializing generated SVG.
- The rich editor renders diagrams with the `mermaid` package and uses the original source as an inline fallback when rendering fails.
- `serializeDurableEditorBlocks()` wraps the math-aware serializer so math, wikilinks, Mermaid diagrams, and whiteboards share the same Markdown-first save path.
- The `/mermaid` slash command inserts a placeholder rectangle diagram using the same schema-backed Markdown storage path, avoiding an invalid empty diagram state.

### Tldraw Whiteboards

Defined in `src/utils/durableMarkdownBlocks.ts`, `src/utils/editorDurableMarkdown.ts`, `src/utils/tldrawMarkdown.ts`, `src/components/TldrawWhiteboard.tsx`, `src/components/editorSchema.tsx`, and styled in `src/components/EditorTheme.css`:

- Fenced `tldraw` blocks become `tldrawBlock` schema nodes before BlockNote sees the Markdown body.
- Each `tldrawBlock` stores a stable `boardId` plus the tldraw document snapshot JSON. Session state such as camera, selected tool, and current selection is not persisted into the note.
- The rich editor renders the block with the `tldraw` package and saves debounced document snapshot changes back into the block props, so normal Tolaria autosave writes the board into the `.md` file.
- Whiteboard prop writes re-resolve the live BlockNote block by id before mutating it, and disappear as no-ops if a note reload or mode switch has already removed that block.
- The tldraw runtime receives Tolaria's resolved light/dark mode as its user color scheme, so embedded whiteboards follow the app appearance and update while mounted.
- Embedded whiteboards expose a session-only full-window workspace that reuses the same tldraw store and Markdown snapshot; expanding or closing it does not persist camera, tool, or size state.
- Mermaid and tldraw both register small codecs with the shared durable fenced-block pipeline; scanner, token, block injection, and mixed serialization mechanics live in one owner.
- The `/whiteboard` slash command inserts an empty tldraw block using the same Markdown-durable storage path. Preview images are intentionally omitted; thumbnails can be added later as derived cache artifacts.

### Formatting Surface Policy

Defined in `src/components/tolariaEditorFormatting.tsx`, `src/components/tolariaEditorFormattingConfig.ts`, and the focused modules under `src/components/formatting/`:

- `SingleEditorView` disables BlockNote's default formatting toolbar, `/` menu, and side menu, then mounts Tolaria-owned controllers so the visible formatting surface matches Tolaria's markdown round-trip guarantees.
- `SingleEditorView` owns a whitespace mouse-selection bridge around BlockNote and its rich-editor scroll area: drag starts that land outside the editable text DOM are remapped through the ProseMirror view with clamped coordinates, while drags below the rendered document fall back to the document end. Drags that begin inside BlockNote's contenteditable surface, toolbars, side menu, dialogs, or non-primary mouse buttons stay on BlockNote/native handling.
- `editorRichCopy.ts` owns rich-editor copy serialization for external apps. Normal selections use BlockNote's external clipboard HTML so tables, lists, checklists, and inline marks paste as rich content outside Tolaria, while `SingleEditorView` still normalizes `text/plain` and keeps fenced code-block selections on raw code text.
- The formatting toolbar only exposes inline controls that persist through Tolaria's Markdown serialization pipeline: bold, italic, strike, inline code, `==highlight==`, nesting, link creation, inline math, selected-text AI context, and block-type changes that map to durable Markdown blocks. Controls that BlockNote can render temporarily but Tolaria cannot faithfully persist, such as underline, color, and alignment, are hidden instead of appearing to work and later disappearing.
- Tolaria's formatting-toolbar controller keeps orchestration in `tolariaEditorFormatting.tsx`, while focused modules own basic text buttons, durable block-type selection, media actions, inline math, selected-text AI context, inline AI suggestions, selected-block helpers, selection text lookup, and viewport-safe floating positioning. Product-specific Paper, AI, and media behavior should stay below this editor surface instead of duplicating toolbar UI elsewhere.
- `SingleEditorView` owns a transparent `editor-floating-portal` host inside `.editor__blocknote-container`, and `editorFloatingPortal.ts` exposes it to editor-adjacent UI. Formatting toolbars and Paper comment threads use that host so floating controls stay in the editor stacking context without being clipped by the BlockNote content surface. The host must stay pointer-events-none and must not receive `.bn-container`; theme variables are shared through `.editor__floating-blocknote-scope`.
- Tolaria's formatting-toolbar controller also keeps file/image actions mounted across the tiny hover gap between an image block and the floating toolbar, and while the toolbar itself is hovered, so image controls remain usable instead of collapsing mid-interaction.
- `useEditorComposing` tracks editor-owned IME composition events and closes the floating formatting toolbar during composition plus a short post-composition settle window, keeping CJK candidate windows unobstructed without changing normal selection toolbar behavior.
- `createImeCompositionKeyGuardExtension()` intercepts composing `Enter` keydown events before BlockNote's list shortcuts see them, so Korean/Japanese/Chinese IMEs can commit text at the start of list items without Tolaria splitting the current bullet. It stops editor shortcut propagation only; it does not prevent the browser/IME default composition action.
- `createMarkdownHighlightShortcutExtension()` owns the rich-editor Cmd/Ctrl+Shift+M formatting shortcut. It skips IME composition and read-only editors, calls the same highlight style toggle as the formatting toolbar, and records `markdown_highlight_shortcut_used` with keyboard-only metadata.
- `richEditorBlockSelectionExtension.ts` owns Notion-style block selection as an editor-level ProseMirror plugin. A first `Escape` promotes the current caret or native text selection into one or more selected blocks, renders block-level decoration chrome, and keeps arrow/delete/enter handling inside the editor; a second `Escape` clears the block selection without preventing the app-level note-list escape path from taking over. Native drag text selection remains content selection, while block mode uses decoration chrome so empty spacer lines are not treated as selected content.
- `richEditorRecoveryClassifier.ts` is the shared taxonomy for recoverable BlockNote/ProseMirror failures used by render recovery and transform recovery. Missing block IDs plus paragraph and table-row index failures keep one canonical reason across `editor_render_recovered` and `rich_editor_transform_error_recovered`; the two recovery surfaces differ only in retry, repair, and dispatch behavior.
- `richEditorInputTransform.ts` is the shared execution shell for rich-editor Markdown `beforeinput` transforms. It reads the live ProseMirror view, skips IME composition, resets state when a stale view is detected, dispatches transform transactions, prevents native input only after successful dispatch, and reports recoverable editor-transform errors through the shared classifier. Arrow ligatures, inline math conversion, and `==highlight==` keep their syntax-specific matching in their feature files and are composed for the main editor by `richEditorInputTransformExtension.ts`.
- `richEditorTextDirection.ts` uses a BlockNote extension with ProseMirror decorations for per-node RTL quote rendering. It handles callout-marker quotes such as `[!note] כותרת` at the editor render layer, so BlockNote does not strip post-render DOM mutations and quote rails can follow logical inline-start.
- `focusOwnershipGuard.ts` is the shared global focus interception primitive for editor-like surfaces. It owns the single `HTMLElement.prototype.focus` patch, document focus/pointer listeners, outside-target restoration, and cleanup; rich-editor and sheet modules keep only their surface-specific focus-claim policy.
- `useImageLightbox` listens for `dblclick` on the rich-editor container and opens `ImageLightbox` only when the event target resolves to a viewable BlockNote image. The target resolver handles media wrappers, ignores image captions/resize controls, missing sources, and tiny tracking-style images, preserving BlockNote's ordinary single-click image selection path.
- The `/` slash menu remains the supported path for markdown-safe block transformations such as headings, quotes, list blocks, Mermaid diagrams, and whiteboards. Tolaria filters out BlockNote's toggle-heading and toggle-list variants because those do not map cleanly to the markdown note model.
- The block-handle side menu keeps only actions that survive Tolaria's markdown round-trip. Delete and table-header toggles remain available; BlockNote's `Colors` submenu is removed because block colors are not part of Tolaria's supported markdown surface. Tolaria renders the add-block button outside the drag handle so the handle stays next to the block content. `tolariaSideMenuAlignment.ts` aligns the side menu to the first rendered text line for the hovered block, so H1/H2 typography, line-height, wrapping, and theme changes do not need per-heading offsets. `tolariaBlockReorder.ts` owns block reordering as a pointer gesture with direct BlockNote block moves instead of HTML5 `DataTransfer`, keeping it independent from Tauri's native file-drop system. `tolariaSideMenuBlocks.ts` owns stale-block lookup and mutation guards, so block-handle actions re-resolve the current live BlockNote block before mutating or dragging and note reloads/sync churn cannot leave controls acting on stale block references.
- BlockNote's table row/column handles are patched so stale or missing hovered-table state cancels the drag and hides handles instead of throwing. Add/remove row and column actions also validate the table position and cell indexes before resolving a ProseMirror `CellSelection`, so reloads or menu lag cannot turn stale handles into invalid table-selection positions. Checklist checkbox handlers also re-resolve the live block before updating `checked`, making delayed clicks after note reloads a no-op instead of a stale block mutation. Browser and native table regressions should exercise row and column dragging plus add-menu actions because the state is tracked per orientation.
- `SingleEditorView` wraps the BlockNote surface in a narrow render-recovery boundary for recoverable BlockNote node-view failures classified by `richEditorRecoveryClassifier.ts`. The boundary retries the BlockNote view once, records `editor_render_recovered`, and marks the recovered error so the React root handler does not send that handled case back to Sentry. Other render errors still propagate through the normal root error path.
- `useNoteWikilinkDrop()` is the shared editor-drop abstraction for dragging note rows into either editor mode. It reads the existing note-retargeting drag payload, resolves the vault-relative stem, and inserts a canonical `[[wikilink]]` without hijacking unrelated plain-text drags.
- `plainTextPaste.ts` is the shared plain-text paste target registry. Rich BlockNote and raw CodeMirror surfaces register focused insertion targets, while ordinary focused text controls use DOM selection replacement, so the `Cmd+Shift+V` command can preserve caret/selection behavior without each surface inventing its own clipboard reader.
- `tauriEventCleanup.ts` owns safe Tauri event unlisten cleanup. Hooks and stream utilities route listener teardown through it so stale or duplicate native listener removals cannot surface as unhandled promise rejections during fast remounts, window teardown, or stream completion.
- `useTauriDragDropEvent()` owns the shared Tauri window drag/drop subscription used by native drop features.
- `useNativePathDrop()` is the shared Tauri file/folder-drop abstraction for text inputs that need filesystem paths instead of attachment import. It consumes native window drag/drop events, gates them to the target element bounds or focused text selection, and lets AI composer / command-palette inputs insert formatted paths at the current cursor.

### Markdown-to-BlockNote Pipeline

```mermaid
flowchart LR
    A["📄 Raw markdown\n(from disk)"] --> B["splitFrontmatter()\n→ yaml + body"]
    B --> C{"exact-source\nblock cache?"}
    C -->|"hit"| D["reuse cached blocks"]
    C -->|"miss"| E["preprocess durable blocks,\nwikilinks, math, images"]
    E --> F{"large common\nMarkdown?"}
    F -->|"yes"| G["worker-backed direct Markdown parser\n→ block tree"]
    F -->|"unsupported or small"| H["tryParseMarkdownToBlocks()\n→ BlockNote block tree"]
    G --> I["inject wikilinks, math, highlights,\nand durable schema nodes"]
    H --> I
    D --> J{"large block set?"}
    I --> J
    J -->|"yes"| K["progressive locked apply\nfirst chunk + frame-yielded appends"]
    J -->|"no"| L["single replaceBlocks()\nsmall/fast swap"]

    style A fill:#f8f9fa,stroke:#6c757d,color:#000
    style K fill:#d4edda,stroke:#28a745,color:#000
    style L fill:#d4edda,stroke:#28a745,color:#000
```

> Wikilink placeholder tokens use `\u2039` and `\u203A`; math, Mermaid, tldraw, and standalone file-attachment link placeholders use ASCII sentinels with URI-encoded payloads.

### BlockNote-to-Markdown Pipeline (Save)

```mermaid
flowchart LR
    A["✏️ BlockNote blocks\n(editor state)"] --> B["restore durable Markdown tokens\nwhile preserving block identity"]
    B --> C{"all block shapes\nsupported directly?"}
    C -->|"yes"| D["direct serializer\nwith per-editor WeakMap cache"]
    C -->|"no"| E["BlockNote Markdown exporter fallback"]
    D --> F["prepend frontmatter yaml"]
    E --> F
    F --> G["invoke('save_note_content')\n→ disk write"]

    style A fill:#cce5ff,stroke:#004085,color:#000
    style G fill:#d4edda,stroke:#28a745,color:#000
```

Rich-editor change events are coalesced before this serialization runs. `useEditorTabSwap` keeps the latest BlockNote state in the editor, schedules one Markdown serialization for a short idle window, and exposes an explicit flush hook for save, note switch, raw-mode entry, and destructive note actions. `src/utils/richEditorMarkdown.ts` is the shared BlockNote-to-Markdown owner for autosave/tab-swap and raw-mode entry, so wikilink restoration, durable schema-node serialization, frontmatter preservation, file-attachment block round-tripping, and portable attachment paths cannot drift between editor modes. This keeps long notes from paying full-document Markdown serialization on every keystroke while preserving the disk-first save path.

Autosave then waits for a 1.5s idle window before invoking `save_note_content`. If an older save resolves after the user has already typed newer content, the older save is treated as stale and cannot clear the newer pending buffer or repaint tab state over it; the latest pending content remains scheduled for its own save.

### Wikilink Navigation

Two navigation mechanisms:

1. **Click handler**: DOM event listener on `.editor__blocknote-container` catches clicks on `.wikilink` elements → `onNavigateWikilink(target)`.
2. **Suggestion menu**: Typing `[[` triggers `SuggestionMenuController` with filtered vault entries.

Wikilink resolution (`resolveEntry` in `src/utils/wikilink.ts`) uses multi-pass matching with global priority: path suffix for path-style targets, filename stem, alias, exact title, then humanized title (kebab-case -> words). In a mounted-workspace graph, unprefixed links prefer the source note's workspace, while links prefixed by a known workspace alias resolve inside that workspace (`[[team/projects/alpha]]`). Cross-workspace canonical link insertion prefixes the target alias only when source and target workspaces differ; same-workspace links stay vault-relative.

### Raw Editor Mode

Toggle via Cmd+K → "Raw Editor" or breadcrumb bar button. Uses CodeMirror 6 (`useCodeMirror` hook) to edit the raw markdown + frontmatter directly. Changes saved via the same `save_note_content` command.
`useRawModeWithFlush` owns the rich/raw transition model: pending raw-exit content and raw-mode overrides move together as one content transition, while cursor/scroll restoration moves through one restore-transition ref consumed by `useEditorModePositionSync`. The raw editor should not carry independent pending-content or pending-position refs outside that handoff.
While the user types, `useEditorSaveWithLinks` derives a transient `VaultEntry` patch from parseable frontmatter so the Inspector, relationship chips, and note-list-visible metadata stay in sync with the raw editor before the next vault reload. Temporarily invalid or half-typed frontmatter is ignored until it becomes parseable again, which avoids clobbering the last known good derived state.

Current-note find/replace is intentionally backed by raw CodeMirror mode. `Cmd+F`, "Find in Note", and "Replace in Note" switch the active Markdown/text note to raw mode, show the compact find bar above CodeMirror, and operate on the current note only. Plain text matching is case-insensitive by default, `Aa` toggles case sensitivity, `.*` toggles JavaScript-regex matching, and regex replacement supports capture groups through JavaScript replacement syntax.

### Rich Editor Width Modes

Rich Markdown editing supports `normal` and `wide` note widths. The effective mode is resolved in `App.tsx` from, in order, the current session's transient note-width cache, `VaultEntry.noteWidth` parsed from `_width`, and the installation-local `settings.note_width_mode` default. The breadcrumb toggle calls the same setter exposed through the command palette.

Per-note width is persisted as hidden `_width` frontmatter only when the note already has a valid or empty frontmatter block. Notes without frontmatter use the transient cache for the current session, so toggling width never creates frontmatter solely to store UI state. The width class is applied around `SingleEditorView` only; raw CodeMirror mode stays outside `.editor-content-wrapper` and remains full-width.

### Arrow Ligature Normalization

Typed ASCII arrow sequences are normalized consistently in both editor modes:

- Rich editor input mounts `createArrowLigaturesExtension()` (`src/components/arrowLigaturesExtension.ts`) into BlockNote and intercepts typed `beforeinput` events before ProseMirror commits the character.
- Raw editor input uses the CodeMirror `inputHandler` path in `useCodeMirror` so the same ligature rules apply while editing markdown source directly.
- Both paths delegate to the shared `resolveArrowLigatureInput()` helper in `src/utils/arrowLigatures.ts`, which prioritizes `<->` over partial matches, keeps paste literal, and lets escaped forms such as `\\->` and `\\<->` remain ASCII.
- The rich-editor extension treats stale, disconnected, or mid-reload ProseMirror views as a no-op. It never blocks the native input path unless it has already built and dispatched a valid ligature transaction.

## Styling

The app uses internal light and dark themes owned by Tolaria, with System as an installation-local preference that follows the OS appearance (see [ADR-0081](adr/0081-internal-light-dark-theme-runtime.md) and [ADR-0112](adr/0112-system-theme-mode.md)). The previous vault-authored theming system remains removed.

1. **Global CSS variables** (`src/index.css`): Semantic app colors, borders, surfaces, and interaction states via `:root` / `[data-theme]`, bridged to Tailwind v4
2. **Editor theme** (`src/theme.json`): BlockNote typography, flattened to CSS vars by `useEditorTheme`
3. **Runtime theme bridge**: Resolves the selected preference to `light` / `dark`, applies `data-theme` and `.dark` for shadcn/ui, and subscribes to `prefers-color-scheme` while System is selected
4. **Theme mode commands**: Command-palette actions for Light, Dark, and System call the same `saveSettings` path as the Settings panel and persist only `settings.theme_mode`

## Localization

App UI strings are resolved through `src/lib/i18n.ts`, with manually maintained flat JSON catalogs in `src/lib/locales/*.json` (see [ADR-0168](adr/0168-manual-json-catalog-localization.md)):

- `AppLocale`: canonical locale tags such as `'en'`, `'zh-CN'`, `'fr-FR'`, `'es-419'`
- `UiLanguagePreference`: `'system' | AppLocale`; persisted settings serialize `system` as `null`
- `resolveEffectiveLocale()`: maps an explicit preference or system/browser language list to the effective supported locale, including legacy aliases
- `translate()` / `createTranslator()`: resolve keys with English fallback and simple `{name}` interpolation
- `scripts/validate-locales.mjs`: asserts every checked-in locale catalog matches the English keyset and stays flat-string-only

`App.tsx` owns the effective locale and passes it to localized app chrome through props. Settings and command-palette language commands call back into `saveSettings`, so UI language changes update the current session without touching vault content or reopening the vault. External localization service sync is deprecated; new or changed UI copy must update every checked-in catalog by hand and pass `pnpm l10n:validate`.

## Inspector Abstraction

The Inspector panel (`src/components/Inspector.tsx`) is composed of sub-panels:

1. **DynamicPropertiesPanel** (`src/components/DynamicPropertiesPanel.tsx`): Renders frontmatter as editable key-value pairs:
   - **Editable properties** (top): Type badge, Status pill with dropdown, number fields, boolean toggles, array tag pills, text fields. Click-to-edit interaction.
   - **Property display modes**: `text`, `number`, `date`, `boolean`, `status`, `url`, `tags`, and `color`. Numeric frontmatter values auto-detect as `number`, and custom scalar keys can be explicitly switched to `Number` through the property-type control.
   - **Anchored dropdowns**: Fixed-position property menus and note-list sort menus use `src/components/anchoredDropdown.ts` for anchor measurement, viewport clamping, scroll/resize repositioning, and optional max-height calculations. Property-specific filtering and keyboard navigation stay in `propertyDropdownUtils.ts`.
   - **Present empty properties**: A top-level frontmatter key with a blank scalar value (for example `start date:`) is treated as present and renders as an editable empty row. Only absent keys are omitted.
   - **Type-derived placeholders**: For typed instances, missing custom properties declared on the type document render as gray editable placeholders. Editing one writes the value to the instance frontmatter; merely displaying it does not backfill the note.
   - **Info section** (bottom, separated by border): Read-only derived metadata — Modified, Created, Words, File Size. Uses muted styling with no interaction.
   - Keys in `SKIP_KEYS` (`type`, `aliases`, `notion_id`, `workspace`, `is_a`, `Is A`) are hidden from the editable section.

2. **RelationshipsPanel**: Shows `belongs_to`, `related_to`, `has`, and all custom relationship fields as clickable wikilink chips. Relationship labels are humanized for display, but stored keys remain unchanged. For typed instances, missing relationship fields declared on the type document render as gray editable placeholders without copying any default relationship targets into existing notes.

3. **BacklinksPanel**: Scans `allContent` for notes that reference the current note via `[[title]]` or `[[path]]`.

4. **GitHistoryPanel**: Shows recent commits from file history with relative timestamps.

## Search

### Search

Keyword-based search scans all vault `.md` files using `walkdir` and applies the same Gitignored-content visibility filter as vault loading:

```typescript
interface SearchResult {
  title: string
  path: string
  snippet: string
  score: number
}
```

### Search Integration

`SearchPanel` component provides the search UI:
- Real-time results as user types (300ms debounce)
- Click result to open note in editor
- Shows relevance score and snippet

The NoteList header search keeps its local title/snippet/property filtering for immediate scoped results, then augments the match set with `search_vault` hits from the visible workspace roots using the command's frontmatter-excluding search option. React stores only matching paths so body-only matches appear in the current list scope without a second content-read pass or rendering private matched text in note rows.

No indexing step required — search runs directly against the filesystem.

## Vault Management

### Vault Switching

`useVaultSwitcher` hook manages multiple vaults:
- Persists vault list to `$XDG_CONFIG_HOME/com.tolaria.app/vaults.json`, defaulting to `$HOME/.config/com.tolaria.app/vaults.json` on Unix platforms. App config path policy is declared once in `mcp-server/app-config-policy.json` and consumed by both the Rust app helper and Node MCP server: reads check the current Tolaria namespace, then legacy `com.laputa.app`, first in the preferred config root and then in the platform config root when it differs; writes target the current namespace in the preferred root.
- Switching closes all tabs and resets sidebar
- Supports adding, removing, hiding/restoring vaults
- Persists workspace aliases, colors, mount state, and the default new-note destination for the unified graph
- Default vault: public Getting Started starter vault cloned on demand

Mounted workspaces are loaded together by `useVaultLoader` for note-list, quick-open, keyword search, wikilink navigation, and saved View discovery. Workspace switching remains a focus operation for per-vault capabilities (Git status, folders, AutoGit, watchers, and repair commands), not a graph isolation boundary.

### Vault Config

Per-vault settings stored locally and scoped by vault path:
- Managed by `useVaultConfig` hook and `vaultConfigStore`
- Settings: zoom, view mode, editor mode, tag colors, status colors, property display modes, Inbox/All Notes note-list column overrides, explicit organization workflow toggle, Git setup prompt preference, AI agent permission mode (`safe` / `power_user`)
- Missing, null, and unknown AI agent permission modes normalize to `safe`; the AI panel can switch modes per vault, preserving the transcript and applying the new mode only to the next agent run
- One-time migration from localStorage (`configMigration.ts`)

Installation-local layout state that should not sync through a vault stays in localStorage. `useLayoutPanels` stores the clamped sidebar, note-list, and inspector widths under `tolaria:layout-panels` so pane sizing survives app relaunches on the same machine.

### AI Guidance Files

Tolaria tracks managed vault-level AI guidance separately from normal note content:
- `AGENTS.md` is the canonical managed guidance file for Tolaria-aware coding agents
- `CLAUDE.md` is a compatibility shim that points Claude Code back to `AGENTS.md`
- `GEMINI.md` is an optional Antigravity/Gemini compatibility shim that points Google-backed CLI agents back to `AGENTS.md`
- `useVaultAiGuidanceStatus` reads `get_vault_ai_guidance_status` and normalizes the backend state into four UI cases: `managed`, `missing`, `broken`, and `custom`
- `restore_vault_ai_guidance` repairs only Tolaria-managed files and creates the optional Antigravity/Gemini shim on explicit request; user-authored custom `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` files are surfaced as custom and left untouched
- Editing a usable `AGENTS.md`, including changing its frontmatter `type`, makes the file custom rather than broken; broken is reserved for missing, empty, frontmatter-only, unreadable, or exact replaceable managed templates/stubs
- The status bar AI badge and command palette consume that abstraction to expose restore actions only when the managed guidance is missing or broken

Vault guidance is intentionally short and vault-specific. General Tolaria product behavior is delivered through the bundled agent docs resource instead:
- `scripts/build-agent-docs.mjs` compiles the public `site/` Markdown into `src-tauri/resources/agent-docs/`
- `src-tauri/resources/agent-docs/AGENTS.md` orients agents to the generated docs bundle, while `index.md`, section bundles, `all.md`, `search-index.json`, and `pages/` provide fast local lookup
- `get_agent_docs_path` exposes the resolved resource folder to the renderer, and `buildAgentSystemPrompt()` tells every app-managed CLI agent to read vault `AGENTS.md` first, then search the bundled docs for Tolaria behavior

### Action History

`useActionHistory` owns renderer-scoped app undo/redo state. It stores explicit action entries with labels plus undo/redo callbacks, suppresses nested recording during replay, and exposes the top labels to command-palette commands.

- Frontmatter mutations record history only after the write succeeds and only for non-silent user actions.
- Entry state toggles such as archive, favorite, and organized record explicit before/after replay callbacks after persistence succeeds.
- Text inputs, contenteditable surfaces, and editor-owned text history keep native undo/redo first; app-level history runs only when focus is outside text editing.
- Irreversible destructive actions stay outside the stack and continue to use confirmation/destructive affordances.

### Getting Started / Onboarding

`useOnboarding` hook detects first launch:
- If vault path doesn't exist → show `WelcomeScreen`
- User can create a new empty vault, open an existing folder, or clone the public Getting Started vault into a chosen parent folder; Tolaria derives the final `Getting Started` child path before cloning
- After the starter repo clone completes, Tolaria removes every remote so the new vault opens local-only by default
- Welcome state tracked in localStorage (`tolaria_welcome_dismissed`, with legacy fallback)

`useGettingStartedClone` encapsulates the non-onboarding Getting Started action:
- Opens the same parent-folder picker used by onboarding
- Derives the final `.../Getting Started` destination path
- Surfaces the resolved path through the app toast after a successful clone

`useAiAgentsOnboarding(enabled)` adds a separate first-launch agent step:
- Reads a local dismissal flag for the AI agents prompt (with a legacy fallback to the older Claude-only key)
- Only shows after vault onboarding has already resolved to a ready state
- Uses `get_ai_agents_status`, whose backend checks Claude Code, Codex, OpenCode, Pi, Antigravity, Kiro, and Hermes Agent by treating the app process path, login-shell path, and supported local/toolchain/app install locations, including nvm-managed Node installs plus Windows `.exe` and npm/pnpm/Scoop shim paths, as valid CLI-agent sources
- App-managed Claude Code runs preserve the same user-managed Anthropic/provider env behavior by forwarding selected exported variables from the app process or the user's zsh/bash startup files without persisting those secrets
- The shared `useAiAgentsStatus` hook defers that command until after the first render, skips it when AI features are disabled or the current window cannot render AI status surfaces, and falls back to missing-agent statuses if the native probe does not return promptly so first-launch onboarding keeps a recovery path
- Persists dismissal locally once the user continues

### Remote Git Operations

Tolaria delegates remote auth to the user's system git setup:
- `CloneVaultModal` captures a supported remote URL (`https://`, `http://`, `ssh://`, or `git@host:path`) and local destination
- `clone_git_repo` and `create_getting_started_vault` both run system git clone work in blocking Tokio tasks so clone UIs stay responsive
- On macOS, system-git commands prefer the user's login-shell `git` and `PATH`, and `git_add_remote` preflights HTTPS remotes through `git credential fill` so Keychain can prompt/grant access before the first fetch or push
- On Linux AppImage launches, every system-git command and MCP runtime subprocess (Node.js or Bun) removes AppImage loader overrides such as `LD_LIBRARY_PATH`, `LD_PRELOAD`, and `GIT_EXEC_PATH` before spawning, so helpers like `git-remote-https` and the system MCP runtime bind against the host library stack instead of Tolaria's bundled WebKit/AppImage libraries
- On native Linux Wayland launches, startup environment safeguards set `WEBKIT_DISABLE_DMABUF_RENDERER=1` unless the user already provided it, keeping the broad WebKitGTK DMABUF crash workaround while avoiding the last-resort compositing fallback that can make WebKitGTK windows feel unresponsive. Linux AppImage launches still set both `WEBKIT_DISABLE_DMABUF_RENDERER=1` and `WEBKIT_DISABLE_COMPOSITING_MODE=1` unless overridden because the sealed AppImage path has the verified rendering failure this fallback protects.
- On Linux AppImage launches, release packaging bundles the GTK3 fcitx immodule into the AppImage and startup environment safeguards write a cache-local `GTK_IM_MODULE_FILE` that points GTK at the mounted module whenever fcitx is configured. If the user has not explicitly chosen a GTK IM module, Tolaria also sets `GTK_IM_MODULE=fcitx`, allowing WebKitGTK editor input to reach fcitx5 on both Wayland and X11 fallback launches without relying on host GTK module cache paths.
- `git_add_remote` uses the same system git path, validates the pasted URL at the Tauri command boundary, and refuses remotes whose history is unrelated or ahead of the local vault
- Shared git subprocess setup rejects the `ext::` transport, inserts an end-of-options separator for clone URLs, disables repo-configured fsmonitor hooks, and ignores repo-configured SSH command overrides
- Existing `git_pull` / `git_push` commands keep surfacing raw git errors, and clone commands fail fast when git wants interactive terminal input
- No provider-specific token or username is stored in app settings

## Settings

App-level settings persisted at `$XDG_CONFIG_HOME/com.tolaria.app/settings.json`, defaulting to `$HOME/.config/com.tolaria.app/settings.json` on Unix platforms. `settings.json` and `vaults.json` share the same `mcp-server/app-config-policy.json` search order used by Rust and the external MCP server, so durable agent registrations resolve mounted workspaces the same way the app resolves installation-local settings:

```typescript
interface AiWorkspaceConversationSetting {
  archived: boolean | null
  id: string
  target_id: string | null
  title: string
}

interface Settings {
  auto_pull_interval_minutes: number | null
  autogit_enabled: boolean | null
  autogit_idle_threshold_seconds: number | null
  autogit_inactive_threshold_seconds: number | null
  telemetry_consent: boolean | null
  crash_reporting_enabled: boolean | null
  analytics_enabled: boolean | null
  anonymous_id: string | null
  release_channel: string | null // null = stable default, "alpha" = every-push prerelease feed
  automatic_update_checks_enabled: boolean | null // null = default true
  theme_mode: 'light' | 'dark' | 'system' | null
  ui_language: AppLocale | null
  date_display_format: 'us' | 'european' | 'friendly' | 'iso' | null
  note_width_mode: 'normal' | 'wide' | null
  sidebar_type_pluralization_enabled: boolean | null // null = default true
  ai_features_enabled: boolean | null // null = default true
  git_enabled: boolean | null // null = default true
  default_ai_agent: 'claude_code' | 'codex' | 'opencode' | 'pi' | 'antigravity' | 'kiro' | 'hermes' | null
  default_ai_target: string | null // "agent:codex" or "model:<provider>/<model>"
  ai_model_providers: AiModelProvider[] | null
  ai_workspace_conversations: AiWorkspaceConversationSetting[] | null
  hide_gitignored_files: boolean | null // null = default true
  all_notes_show_pdfs: boolean | null // null = default false
  all_notes_show_images: boolean | null // null = default false
  all_notes_show_unsupported: boolean | null // null = default false
}
```

Managed by `useSettings` hook and `SettingsPanel` component. `theme_mode` is installation-local because it controls device comfort rather than vault structure; the Settings panel and command-palette Light/Dark/System actions both update that same value. `system` remains a stored preference, while the runtime resolves it to `light` or `dark` for `data-theme` and app consumers. `ui_language` is also installation-local: `null` follows the supported system language with English fallback, while explicit values pin the UI language for this installation. Stored legacy aliases such as `zh-Hans` are normalized to canonical locale codes before the setting reaches React state. `date_display_format` is installation-local and controls rendered dates in note rows, property chips/cells, note info, table-of-contents metadata, and search result subtitles; `AppPreferencesProvider` owns the UI-level value so rendering surfaces can consume it without prop forwarding, while date picker text input remains ISO for predictable manual entry and storage. `note_width_mode` is the installation-local default for rich-editor note width; individual notes can override it with `_width` when they already have frontmatter. `sidebar_type_pluralization_enabled` is installation-local and defaults to `true`; when false, type rows use exact type names unless the type document defines an explicit `sidebar_label` override. `automatic_update_checks_enabled` is installation-local and defaults to `true`; when false, `useUpdater` skips the startup/background update probe while the status-bar/manual "Check for updates" action remains available. `ai_features_enabled` is installation-local and defaults to `true`; when false, Tolaria hides AI panel controls, status bar AI indicators, command-palette AI mode, and missing-agent prompts while leaving Settings as the re-enable path. `git_enabled` is also installation-local and defaults to `true`; when false, Tolaria hides Git status-bar entries and command-palette actions, disables AutoGit controls, and avoids background Git refresh/sync work while leaving Settings as the re-enable path. `default_ai_agent` remains the legacy installation-local CLI fallback. `default_ai_target` is the active AI target used by the AI panel and status bar; it can point at a coding agent or a configured direct model. `ai_model_providers` stores non-secret provider metadata for local/API model targets, while hosted API keys live in Tolaria's local app-data secrets file or user-managed environment variables instead of being persisted in app settings; env-backed keys can come from the app process or exported zsh/bash startup values on Unix. Direct OpenAI-compatible model streams receive the active vault root and may execute Tolaria's native create-only `create_note` tool, but they do not receive shell access or general file-write tools. `ai_workspace_conversations` stores installation-local AI chat sidebar metadata only: conversation ids, titles, archive state, and explicit target overrides. It does not store vault content, prompts, transcripts, or model credentials. Provider defaults and local/API grouping come from the shared `src/shared/aiModelProviderCatalog.json` catalog used by both renderer settings and the Tauri direct-model runtime. `hide_gitignored_files` is also installation-local and defaults to `true`; changing it reloads entries, search, saved views, and folders without restarting. The `all_notes_show_pdfs`, `all_notes_show_images`, and `all_notes_show_unsupported` flags are installation-local All Notes category toggles that default off and update the list/counts without changing vault files. The AutoGit fields are also installation-local: `useAutoGit` consumes them to schedule automatic checkpoints, while `useCommitFlow` and the status bar quick action reuse the same checkpoint runner and deterministic automatic commit message generation.

## Telemetry

### Components
- **`TelemetryConsentDialog`** — First-launch dialog asking user to opt in to anonymous crash reporting. Two buttons: accept (sets `telemetry_consent: true`, generates `anonymous_id`) or decline.
- **`TelemetryToggle`** — Checkbox component in `SettingsPanel` for crash reporting and analytics toggles.

### Hooks
- **`useTelemetry(settings, loaded)`** — Reactively initializes/tears down Sentry and PostHog based on settings. Called once in `App`.

### Libraries
- **`src/lib/telemetry.ts`** — `initSentry()`, `teardownSentry()`, `initPostHog()`, `teardownPostHog()`, `trackEvent()`. Path scrubber via `beforeSend` hook. The same hook drops known benign browser ResizeObserver loop-limit notifications before they become crash issues, while keeping unrelated ResizeObserver failures reportable. DSN/key from `VITE_SENTRY_DSN` and `VITE_POSTHOG_KEY`; `VITE_SENTRY_RELEASE` is treated as the build version and only becomes Sentry's `release` for stable calendar builds (`YYYY.M.D`). Alpha/prerelease/internal builds tag `tolaria.build_version` and `tolaria.release_kind` without creating normal Sentry Releases entries.
- **`src/main.tsx`** — React root error callbacks (`onCaughtError`, `onUncaughtError`, `onRecoverableError`) forward component-stack context to `Sentry.reactErrorHandler()` for debuggable production React errors.
- **`src-tauri/src/telemetry.rs`** — Rust-side Sentry init with `beforeSend` path scrubber. `init_sentry_from_settings()` reads settings and conditionally initializes; stable calendar `CARGO_PKG_VERSION` values become Sentry releases, while alpha/prerelease/internal versions are kept as diagnostic tags only. `reinit_sentry()` for runtime toggle.

### Product Events
- **File previews** — `file_preview_opened`, `file_preview_action`, and `file_preview_failed` report only preview/action categories such as `image`, `pdf`, `unsupported`, `open_external`, `copy_path`, and `reveal`.
- **Inline image lightbox** — `inline_image_lightbox_opened` records that a rich-editor inline image was opened from double-click, without sending note paths, image URLs, alt text, or file names.
- **Code block copy** — `code_block_copied` records that the rich-editor code-block copy action was used, without sending note paths, languages, or code content.
- **AI agent sessions** — `ai_agent_message_sent`, `ai_agent_message_blocked`, `ai_agent_response_completed`, `ai_agent_response_failed`, `ai_agent_response_stopped`, and `ai_agent_permission_mode_changed` use only agent ids, permission modes, counts, and coarse status categories.
- **AI feature visibility** — `ai_features_visibility_changed` records only whether installation-level AI surfaces were enabled or hidden.
- **Automatic update checks** — `automatic_update_checks_changed` records only whether startup/background update checks were enabled or disabled.
- **All Notes visibility** — `all_notes_visibility_changed` records only the toggled category and enabled state.

### Tauri Commands
- **`reinit_telemetry`** — Re-reads settings and toggles Rust Sentry on/off. Called from frontend when user changes crash reporting setting.

---

## Updates & Feature Flags

### Hooks
- **`useUpdater(releaseChannel, automaticChecksEnabled)`** — Channel-aware updater state machine. When automatic checks are enabled, it checks the selected feed after startup; manual checks always remain available. It surfaces checking/available/downloading/ready states and delegates install work to Rust.
- **`useFeatureFlag(flag)`** — Returns boolean for a named feature flag. Checks `localStorage` override (`ff_<name>`), then falls back to telemetry-backed evaluation. Type-safe via `FeatureFlagName` union.

### Frontend helpers
- **`src/lib/releaseChannel.ts`** — Normalizes persisted channel values so legacy or invalid settings fall back to Stable, while Stable serializes back to `null`.
- **`src/lib/appUpdater.ts`** — Thin wrapper around the Tauri updater commands. Keeps the React hook free of endpoint-selection details.

### Rust
- **`src-tauri/src/app_updater.rs`** — Chooses the correct update endpoint and adapts Tauri updater results into frontend-friendly payloads. Stable uses the public `stable/latest.json` feed. Alpha first resolves the newest non-draft `alpha-vYYYY.M.D-alpha.NNNN` GitHub Release asset named `alpha-latest.json`, then falls back to the public `alpha/latest.json` feed if the release lookup is unavailable.
- **`src-tauri/src/commands/version.rs`** — Formats app build/version labels for the status bar, including calendar alpha labels and legacy release compatibility.

### Tauri Commands
- **`check_for_app_update`** — Channel-aware update manifest lookup.
- **`download_and_install_app_update`** — Channel-aware download/install with streamed progress events.

### CI/CD
- **`.github/workflows/release.yml`** — Alpha prereleases from every push to `main` using calendar-semver technical versions (`YYYY.M.D-alpha.N`) and clean `Alpha YYYY.M.D.N` release names. GitHub alpha tags zero-pad the prerelease sequence (`alpha-vYYYY.M.D-alpha.NNNN`) so GitHub release ordering stays chronological while the shipped app version remains `YYYY.M.D-alpha.N`. Publishes `alpha/latest.json` with macOS Apple Silicon/Intel, Linux x64, and Windows x64 updater entries, then refreshes the legacy `latest.json` / `latest-canary.json` aliases to the alpha feed. The Windows job always requires Tauri updater signatures, uses Authenticode signing and `Get-AuthenticodeSignature` verification when Windows certificate secrets are present, and warns while building updater-signed-only artifacts when those secrets are absent. The Linux job uses Tauri's stock linuxdeploy AppImage output plugin and validates that installer and updater-signature artifacts exist before upload. The docs/release Pages job reads the stable manifest from the latest stable release asset instead of copying the live Pages URL, uploads the built site as a Pages artifact, and deploys it with GitHub's official Pages action so the public updater JSON changes as part of the release workflow. Changes to the shared artifact workflow are not ignored by the alpha trigger, so release-pipeline fixes produce a fresh alpha run. macOS release assets use `Tolaria_<version>_macOS_Silicon` and `Tolaria_<version>_macOS_Intel` base names. Packaged builds pass the computed version as `VITE_SENTRY_RELEASE`, which is retained as a diagnostic build-version tag but not registered as a normal Sentry release for alpha builds.
- **`.github/workflows/release-stable.yml`** — Stable releases from `stable-vYYYY.M.D` tags. Publishes `stable/latest.json`, macOS Apple Silicon and Intel DMG/updater artifacts, Windows x64 installers plus Tauri-signed updater bundles, Linux x86_64 `.deb` / `.rpm` / AppImage artifacts, and a static public download page that starts selected non-Windows installers without replacing the page with a blank download navigation. Windows visitors see an explicit installer action and managed-device guidance instead of an automatic download. Authenticode publisher signing is added to Windows artifacts when certificate secrets are configured; until then, the workflow warns and publishes updater-signed-only Windows artifacts. Linux visitors default to the AppImage target while the page exposes RPM as a manual Linux package option when the stable release includes one. The Linux job uses the same stock Tauri/linuxdeploy AppImage packaging and artifact validation as alpha releases. The Pages job reads the alpha manifest from the latest alpha release asset instead of copying the live Pages URL, uploads the built site as a Pages artifact, and deploys it with GitHub's official Pages action so stable and alpha manifests stay fresh. Stable macOS DMG/updater assets use the same `Tolaria_<version>_macOS_Silicon` and `Tolaria_<version>_macOS_Intel` base names. Packaged builds pass the computed stable version as `VITE_SENTRY_RELEASE`, which is registered as Sentry's release.
- **Beta cohorts** are handled in PostHog targeting only. There is no beta updater feed.

### ADR 0175 Canvas engine boundaries

`ProjectCanvasController` is the public command boundary. React surfaces subscribe to its snapshot with `useSyncExternalStore`; they do not own camera, selection, pointer-operation, history-stack, or Canvas persistence state.

- `CanvasSceneStore` normalizes node/edge records, ordering, nested group membership references, bounds, coarse node/connector spatial indexes, node adjacency, and incident-edge lookup. `serialize()` sorts records deterministically for Git-friendly JSON and stores no document body. TypeScript, Rust, and MCP validation reject missing parents, non-group parents, and parent cycles before malformed hierarchy can be saved. Pointer-frequency geometry uses incremental cell patches and reindexes only incident connectors; selected, editing, gesture-target, connected, and selected-edge records can be retained without a full-scene comparison.
- `CanvasViewport` owns the v1 `{ x, y, zoom }` camera contract, screen/canvas transforms, pointer-centered zoom, fit operations, camera restoration, exact hit bounds, and bounded overscan render bounds. Camera commits are animation-frame based.
- `CanvasSelectionManager` distinguishes selected, editing, dragging, resizing, connecting, marquee, and idle states. Inspector, Navigator, overlays, AI selection context, and the editor portal all derive from this source.
- `CanvasToolManager` models Select, Hand, Connect, Frame, temporary Space-to-Hand, and pointer lifecycles as explicit state transitions. Escape cancels the active transaction before changing editing or selection state.
- `CanvasHistoryManager` records one reversible transaction for a completed drag, resize, connect/reconnect, group/reparent, graph paste, delete, or auto-layout operation. BlockNote undo is a separate history domain. Controller group commands preserve explicit `parentId` hierarchy, reject reparenting a group into its own descendants, promote surviving children when a containing group is removed, and move active-group focus to the parent on exit. Group focus is entered through the Group NodeSpec action or double-click; new controller-created nodes inherit the active group, while drag completion queries bounded spatial candidates for the deepest valid parent and commits geometry plus membership once. The screen-space group focus bar and Escape both exit one hierarchy level without altering document history. Canvas copy expands selected groups to their descendants, delegates node serialization to each NodeSpec, includes only edges whose endpoints are in the copied subgraph, and remaps node ids, edge ids, and parent references on paste. Markdown bodies and Paper sidecars never enter this graph clipboard.
- `CanvasLayerManager`, `CanvasOverlayCoordinator`, and `CanvasNodeSpecRegistry` keep graphics, document DOM, screen-space UI, and node behavior extensible without engine-level renderer conditionals. Each NodeSpec selects a renderer adapter and supplies preview, editor geometry, inspector/reference fields, contextual toolbar actions, drop/clipboard behavior, navigation, resize capability, stable connection-anchor geometry, and stale-state rendering. `ProjectCanvasNodeRendererRegistry` binds those adapters to concrete React renderers for Overview/document, Paper block, image, text, task, and group content. `ProjectCanvasNodeCard` renders only the shared card chrome and delegates node content through that registry; it does not branch on node type or renderer kind. Low zoom applies bounded DOM/document/image budgets, and overlay handles and contextual toolbar controls remain fixed-size in screen space.
- `ProjectCanvasPersistenceAdapter` validates/migrates readable Canvas files, preserves stale references, debounces camera-only writes, and serializes every file command through one ordered queue. Structural transactions supersede camera state still waiting in the debounce window; camera writes already in flight finish before the structural write starts, so an older completion cannot overwrite newer graph state. `flush()` waits for queued durability, failed writes remain visible in the controller/toolbar until a later write succeeds, and the adapter never mutates referenced Markdown or Paper sidecars.

`CanvasGraphicsCommandBatch` is the body-free rendering contract for connectors and transient previews. The controller builds it from `CanvasSceneStore.queryEdges()` rather than handing the full scene to React. It resolves both connector endpoints through NodeSpec-owned anchors and carries the chosen anchor ids with screen-independent Canvas points; an invalid empty custom anchor set falls back to the deterministic top/right/bottom/left geometry. Optional persisted edge routing selects straight (the legacy default), orthogonal, or curved command geometry. Orthogonal obstacle lookup uses only SceneStore spatial candidates in the connector corridor, and detours are capped at 256 Canvas units; the connector index uses the same conservative bound so a visible detour is not culled when its direct endpoint segment is offscreen. Optional connector presentation consists of a trimmed label, solid/dashed stroke, `1 | 2 | 4` width, and independent none/arrow/circle/diamond/triangle endpoint markers. These are Canvas-owned scalar properties with deterministic JSON defaults (no label, solid, 2px, no markers); the visible label is not the relationship note and never becomes Markdown, BlockNote state, or Yjs collaborative text. The current `CanvasGraphicsLayer` keeps SVG as a backend, batches visible visual strokes by presentation signature, emits labels only for labeled visible connectors, and emits a fixed 12px transparent hit path per visible connector; tools and persistence do not know which graphics backend executes the commands. `CanvasOverlayCoordinator.edgeEndpointHandles()` projects only selected connector anchors into clipped screen-space controls. `CanvasToolManager` represents endpoint reconnection separately from new connections, including the moving endpoint; `ProjectCanvasController` owns target validation, one-transaction commit, Escape/pointer-cancel rollback, and a content-free `project_canvas_edge_reconnected` event. `CanvasDocumentLayer` retains only visible/active DOM nodes, and `CanvasOverlayLayer` keeps selection controls at stable pixel sizes regardless of zoom.

Focus is an engine boundary rather than an editor-node heuristic. `CanvasEditorPortal` calls `setFocusOwner('document')` only while its embedded editor owns focus; Canvas surface focus calls `setFocusOwner('canvas')`. `ProjectCanvasController` exposes the active history domain in its snapshot and routes undo/redo accordingly without clearing the Canvas transaction stack during editor transitions.

The shipped NodeSpec registry makes behavior executable for Project Overview, Note, Paper, Paper block, image, text, task, and group nodes. `ProjectCanvasController.createNode`, `addDropValue`, `addDropPayload`, and `createPeekNode` consume the registry for geometry, editor geometry, IDs, reference/drop resolution, stale-safe rendering metadata, and placement. The Canvas root only chooses application-level entry candidates and dispatches commands.

`CanvasOverlayCoordinator` is the single source for viewport clipping, screen-space rects, stable z-order, snap guides, contextual toolbar placement, focus owner, outside-pointer dismissal, and Escape dismissal priority. Consumers render its snapshot; they do not measure or reposition overlays by querying transformed DOM nodes. The acceptance performance contract is explicit: low zoom caps mounted Canvas DOM nodes at 72, document previews at 40, and images at 16, while retained active nodes bypass those limits; the independently virtualized Navigator mounts at most 80 rows. Navigator Arrow Up/Down and Home/End traverse logical node rows without selecting them; activation dispatches the controller focus command, and the virtual row's mount ref receives pending keyboard focus without DOM queries or timers. This makes every persisted object keyboard-addressable even when its Canvas DOM card is culled, after which selected-object retention keeps the target mounted through camera movement. Low zoom uses 24px bounded overscan and 128px spatial cells. Deterministic mixed 1,000- and 5,000-node browser fixtures require fewer than 500 spatial candidates, perform Space-drag pan and wheel zoom, sample frame gaps below 50ms, permit at most 20 Surface commits across the interaction sequence, and bound Chromium heap growth to 32MB/96MB. The 2026-07-14 baseline observed 63 Canvas nodes, 241/481 candidates, 21/28 Navigator rows, 24.8/25ms pan gaps, 17/9.4ms zoom gaps, 12/13 interaction commits, and approximately 2.9/5.95MB heap growth. These renderer budgets complement unit coverage for selected, edited, connected, dragged, and overlay-owned retention; they do not substitute for native WKWebView QA.
