# PRD: Tolaria Research Edition with Sapientia Paper Intelligence

Status: Draft  
Date: 2026-07-02  
Target: Tolaria fork / research edition  
Working name: Sapientia for Tolaria  
Primary thesis: Tolaria is the local knowledge-base operating system; Sapientia is the paper research workflow layer.

## 1. Executive Summary

This PRD defines a Tolaria-based research product that adds Sapientia's paper-reading, block citation, sidecar annotations, research memory, and grounded AI capabilities to Tolaria's local-first Markdown vault.

The product should not port Sapientia's current web backend architecture into Tolaria. Instead, it should translate Sapientia's domain model into Tolaria-native concepts:

- Papers become first-class vault entities.
- PDF parsing results become sidecar files.
- Notes remain Markdown files with YAML frontmatter.
- Block citations become durable Markdown syntax.
- Highlights and annotations become versionable sidecar artifacts.
- Paper graphs and research memory become editable, auditable vault artifacts.
- AI Ask becomes a research mode inside Tolaria's existing AI workspace and MCP model.

One-sentence product definition:

> A local-first, Git-first research vault where PDFs, paper blocks, annotations, notes, citations, paper graphs, and AI-generated research memory all live as portable files that humans and agents can inspect, edit, cite, and version.

## 2. Background

Tolaria is a Tauri desktop application for managing Markdown knowledge bases. Its key design results are:

- Filesystem as the source of truth.
- Markdown plus YAML frontmatter as the durable data model.
- Git-first vault history and sync.
- Four-panel knowledge workspace.
- Type documents as files.
- Convention over configuration.
- AI workspace and MCP bridge for agent access to vault operations.

Sapientia is a research reader focused on:

- Block-addressable PDFs.
- Side-by-side PDF and parsed Markdown reading.
- Notes that cite exact source blocks.
- Semantic highlights and reader markup.
- Paper-local graph and concept extraction.
- Note-native Ask with grounded context.
- Research memory compiler and interaction profile.

The combined product should use Tolaria as the base operating environment and integrate Sapientia's research intelligence as a specialized workflow layer.

## 3. Product Thesis

Most AI paper tools answer questions on top of uploaded PDFs. This product is built for a different habit:

```text
The researcher reads.
The researcher writes notes and comments.
The vault records exact evidence.
AI is summoned only when useful.
AI answers are grounded in paper blocks and user notes.
The resulting research memory remains a portable, inspectable file artifact.
```

The product should feel like a serious research notebook, not a chatbot with PDF upload.

The durable unit is the vault, not an account, database, workspace row, or cloud object store.

## 4. Goals

### 4.1 Product Goals

1. Make research papers first-class entities inside Tolaria.
2. Allow users to store, open, parse, annotate, cite, and reason over PDFs inside a local vault.
3. Preserve Tolaria's files-first, Git-first, offline-first principles.
4. Represent paper parsing outputs as portable sidecar files.
5. Let research notes cite exact paper blocks with durable Markdown syntax.
6. Add a Paper Reader Mode that supports reading, sidecar comments, citation, and grounded Ask.
7. Compile highlights, notes, citations, and saved Ask traces into research memory artifacts.
8. Expose paper-specific tools to Tolaria AI agents through MCP.
9. Keep AI evidence-aware: distinguish source claims, user annotations/notes, agent synthesis, and user decisions.
10. Provide a migration path from current Sapientia data into a Tolaria research vault.

### 4.2 Engineering Goals

1. Reuse Tolaria's vault loading, file boundary, editor shell, command palette, settings, Git, AI workspace, and MCP architecture.
2. Add paper support through small, explicit modules instead of cross-cutting rewrites.
3. Keep sidecar files human-readable where possible and machine-stable where needed.
4. Keep caches disposable and reconstructible from vault files.
5. Avoid introducing a database as knowledge source of truth.
6. Keep PDF parsing provider-agnostic: local parser, MinerU remote parser, and future parser adapters should share the same output contract.
7. Add tests around file model, citation parsing, block lookup, annotation persistence, and grounded context construction.

## 5. Non-Goals

The initial product should not attempt to:

- Rebuild Sapientia's current Postgres, Redis, S3, Bun API, and auth stack inside Tolaria.
- Build real-time multi-user collaboration.
- Replace Zotero, Mendeley, or full reference managers.
- Provide enterprise document management or compliance workflows.
- Build a complete ontology editor.
- Require a cloud account.
- Require Git remotes.
- Require every user to use AI.
- Automatically read the entire vault for every AI question.
- Auto-summarize papers without user intent.
- Treat AI-generated synthesis as source truth.
- Build a 3D graph as a first milestone.

## 6. Target Users

### 6.1 Individual Researcher

Needs:

- Read papers locally.
- Write comments and research notes.
- Find exact evidence later.
- Use AI occasionally without losing control.
- Keep research data portable and versioned.

Success looks like:

- A user can open a PDF, parse it, highlight passages, write notes, and later retrieve exact source blocks from citations.

### 6.2 PhD Student or Graduate Researcher

Needs:

- Maintain a literature review over months or years.
- Track how understanding changes over time.
- Link papers, concepts, hypotheses, and draft sections.
- Use AI to compare papers while preserving citations.

Success looks like:

- A user can maintain a Git-backed research vault where every claim in their notes links back to exact paper evidence.

### 6.3 AI-Assisted Research Engineer

Needs:

- Use local or CLI agents to inspect notes, build summaries, extract tasks, and help draft research artifacts.
- Keep agent operations bounded to the active vault.
- Audit what the agent read or changed.

Success looks like:

- An agent can search notes, read paper blocks, propose a summary, create a draft note, and cite every paper claim with block references.

### 6.4 Small Research Group

Needs:

- Share a folder or Git repo containing papers, notes, and research memory.
- Keep files readable without the app.
- Review diffs in notes and memory artifacts.

Success looks like:

- A group can clone a research vault, open it in the app, and inspect notes, citations, paper metadata, and memory artifacts without a shared server.

## 7. Product Principles

### 7.1 Files First

The vault owns the user's research data. The app reads and writes files; it does not trap knowledge in an opaque application database.

### 7.2 Git First, But Not Git Required

A research vault should work as a plain folder. When Git is enabled, history, diffs, Pulse, commits, and sync become available.

### 7.3 AI Is Summoned, Not Assumed

AI should not interrupt reading or automatically rewrite memory without explicit user intent or configured background behavior.

### 7.4 Paper Claims Require Evidence

Any AI answer that states what a paper claims must cite source blocks.

### 7.5 User Notes Are Not Paper Truth

User notes, questions, and interpretations must remain distinct from paper content.

### 7.6 Caches Are Disposable

Indexes, embeddings, rendered previews, parser temp files, and search caches may accelerate the app but must be reconstructible from vault artifacts.

### 7.7 Conventions Before Configuration

The default paper structure should work without setup. Advanced users can override conventions through vault config files later.

## 8. Information Architecture

### 8.1 Vault-Level Structure

Recommended default structure:

```text
research-vault/
  AGENTS.md
  paper.md
  research-note.md
  concept.md
  papers/
    vaswani-2017-attention/
      source.pdf
      paper.md
      blocks.jsonl
      annotations.jsonl
      ask-traces.jsonl
      graph.json
      memory.md
      assets/
      notes/
        critique.md
  concepts/
    attention.md
    transformer.md
  views/
    reading-queue.yml
    papers-by-status.yml
  attachments/
```

Notes:

- Root-level `paper.md`, `research-note.md`, and `concept.md` are Type documents.
- `papers/<paper-slug>/paper.md` is the canonical Paper note.
- `source.pdf` is never modified.
- Sidecar files live next to the source PDF.
- Paper-local notes live under `papers/<paper-slug>/notes/`.
- Cross-paper concepts can live in `concepts/` or at the vault root depending on user preference.

### 8.2 Type Documents

The product should seed or restore these type documents:

```text
paper.md
research-note.md
concept.md
research-question.md
literature-review.md
```

Example `paper.md` Type document:

```yaml
---
type: Type
icon: file-text
color: purple
order: 10
sidebar_label: Papers
template: |
  # New Paper

  ## Summary

  ## Key Claims

  ## Questions
---
# Paper
```

Example `research-note.md` Type document:

```yaml
---
type: Type
icon: notebook-tabs
color: blue
order: 20
sidebar_label: Research Notes
template: |
  # New Research Note

  ## Claim

  ## Evidence

  ## Open Questions
---
# Research Note
```

## 9. Core Domain Model

### 9.1 Paper

A Paper is a vault entity representing a research paper and its associated artifacts.

Canonical file:

```text
papers/<paper-slug>/paper.md
```

Example frontmatter:

```yaml
---
type: Paper
paper_id: vaswani-2017-attention
title: Attention Is All You Need
authors:
  - Ashish Vaswani
  - Noam Shazeer
year: 2017
status: reading
source_pdf: source.pdf
blocks: blocks.jsonl
annotations: annotations.jsonl
graph: graph.json
memory: memory.md
doi:
arxiv_id: "1706.03762"
url: https://arxiv.org/abs/1706.03762
---
# Attention Is All You Need

## Summary

## Key Claims

## Questions
```

Required fields:

- `type: Paper`
- `paper_id`
- `source_pdf`

Recommended fields:

- `title`
- `authors`
- `year`
- `status`
- `doi`
- `arxiv_id`
- `url`
- `blocks`
- `annotations`
- `graph`
- `memory`

### 9.2 SourceBlock

A SourceBlock is a stable unit extracted from a paper.

Stored in:

```text
blocks.jsonl
```

Example:

```json
{"id":"b0001","paper_id":"vaswani-2017-attention","kind":"title","page":1,"text":"Attention Is All You Need","hash":"sha256:...","bbox":[72,72,520,110]}
{"id":"b0023","paper_id":"vaswani-2017-attention","kind":"paragraph","page":2,"text":"The Transformer allows for significantly more parallelization...","hash":"sha256:...","bbox":[72,220,520,280]}
{"id":"f0004","paper_id":"vaswani-2017-attention","kind":"figure","page":3,"caption":"Figure 1: The Transformer model architecture.","hash":"sha256:...","bbox":[80,120,500,500]}
```

Fields:

| Field | Required | Description |
| --- | --- | --- |
| `id` | yes | Stable block identifier inside the paper |
| `paper_id` | yes | Parent paper id |
| `kind` | yes | `title`, `abstract`, `section_heading`, `paragraph`, `figure`, `table`, `equation`, `reference`, `caption` |
| `page` | yes | 1-indexed PDF page |
| `text` | no | Extracted text where applicable |
| `caption` | no | Figure/table caption |
| `hash` | yes | Content/structure hash |
| `bbox` | no | PDF coordinates |
| `section` | no | Nearest section heading |
| `order` | no | Parser order for display |

Block ID stability should use a hybrid strategy:

```text
normalized text or caption hash
+ block kind
+ page neighborhood
+ structural order hint
+ collision suffix if needed
```

### 9.3 Annotation

Annotations are user-created marks over paper blocks or PDF coordinates.

Stored in:

```text
annotations.jsonl
```

Example:

```json
{"id":"ann_001","paper_id":"vaswani-2017-attention","block_id":"b0023","kind":"highlight","color":"important","created_at":"2026-07-02T10:15:00Z","text":"significantly more parallelization"}
{"id":"ann_002","paper_id":"vaswani-2017-attention","block_id":"b0048","kind":"question","color":"questioning","note":"Is this assumption still true for long-context models?","created_at":"2026-07-02T10:18:00Z"}
```

Annotation kinds:

- `highlight`
- `underline`
- `ink`
- `question`
- `comment`
- `bookmark`

Default semantic colors:

| Color | Meaning |
| --- | --- |
| `questioning` | Needs follow-up |
| `important` | Important claim or result |
| `original` | Novel contribution |
| `pending` | Unresolved or to revisit |
| `conclusion` | Main takeaway |

### 9.4 ResearchNote

A ResearchNote is a Markdown note that links user thinking to one or more papers.

Example:

```yaml
---
type: ResearchNote
paper:
  - "[[papers/vaswani-2017-attention/paper]]"
status: active
---
# Why self-attention changed sequence modeling

The key move is replacing recurrence with self-attention. @block[vaswani-2017-attention#b0023]

This raises a question about path length and optimization. @block[vaswani-2017-attention#b0048]
```

### 9.5 Block Citation

Block citations are durable Markdown tokens:

```markdown
@block[paper_id#block_id]
```

Optional display label:

```markdown
@block[vaswani-2017-attention#b0023 "Transformer parallelization claim"]
```

Required behavior:

- Render as an inline citation chip in rich editor mode.
- Remain readable and editable in raw Markdown mode.
- Click opens the source paper and focuses the block.
- Hover shows source text, page, section, and annotation status.
- Broken citations show an explicit warning state.
- AI outputs can include the same syntax.

### 9.6 PaperGraph

PaperGraph represents paper-local concepts and evidence edges.

Stored in:

```text
graph.json
```

Initial format:

```json
{
  "paper_id": "vaswani-2017-attention",
  "concepts": [
    {
      "id": "concept:self-attention",
      "label": "Self-attention",
      "salience": 0.92,
      "evidence_blocks": ["b0023", "b0048"]
    }
  ],
  "edges": [
    {
      "source": "concept:self-attention",
      "target": "concept:parallelization",
      "relation": "enables",
      "evidence_blocks": ["b0023"]
    }
  ]
}
```

Initial UI should be inspectable but not central. A simple list/table is preferred before graph visualization.

### 9.7 ResearchMemory

ResearchMemory is a compiled, readable, editable memory artifact.

Stored in:

```text
memory.md
```

Example:

```markdown
# Research Memory: Attention Is All You Need

## Key Research Facts

- The paper introduces Transformer architecture based entirely on attention. @block[vaswani-2017-attention#b0008]

## User Observations

- User is interested in whether the parallelization argument still holds for long-context models.

## Open Questions

- How does self-attention path length compare to state-space models?

## Earlier Context

- User previously connected this paper to scaling law literature.
```

Memory sections:

- Key Research Facts
- User Observations
- Open Questions
- Today
- Earlier This Week
- Long-Term Research Context
- Corrections

## 10. UX Requirements

### 10.1 Main Shell

The product should preserve Tolaria's shell:

```text
Sidebar | List / Collection | Editor / Reader | Inspector / AI
```

Research additions should appear as modes and panels, not as a separate app shell.

### 10.2 Sidebar

The sidebar should support:

- Papers type section.
- Research Notes type section.
- Concepts type section.
- Reading Queue saved view.
- Recently Annotated saved view.
- Papers with Open Questions saved view.
- Optional folder tree under `papers/`.

### 10.3 Paper List

Paper rows should show:

- Title.
- Authors/year if available.
- Status.
- Parse status.
- Annotation count.
- Open question count.
- Last read/modified time.

### 10.4 Paper Reader Mode

Paper Reader Mode opens when:

- User opens a PDF vault file.
- User opens a `type: Paper` note.
- User clicks a `@block[...]` citation.

Layouts:

| Mode | Layout | Purpose |
| --- | --- | --- |
| Read | PDF or parsed blocks + Inspector | Focused reading |
| Notes | Existing note surface | Long-form synthesis through ordinary ResearchNotes |
| Ask | Reader + Ask panel | Grounded question answering |
| Compare | Two paper readers or paper + note | Later milestone |

MVP layout:

```text
Sidebar | Papers | Reader + Note | Inspector
```

Reader must support:

- PDF preview.
- Parsed Markdown/block preview.
- Toggle between PDF and parsed text.
- Sync selected block with PDF page when coordinates exist.
- Block outline.
- Highlight/annotation controls.
- Citation copy action.

### 10.5 Inspector

When viewing a Paper:

- Metadata.
- Parse status.
- Block count.
- Annotation summary.
- Linked notes.
- Citations to this paper.
- Memory preview.
- Graph preview.

When viewing a ResearchNote:

- Paper links.
- Cited blocks.
- Broken citations.
- Backlinks.
- Related concepts.

### 10.6 Command Palette

Commands:

- Import Paper PDF
- Parse Current Paper
- Repair Paper Sidecars
- Copy Block Citation
- Open Paper Memory
- Compile Research Memory
- Ask About Current Block
- Ask About Current Paper
- Validate Citations in Current Note
- Show Papers with Open Questions

### 10.7 Empty States

No papers:

- Offer "Import Paper PDF".
- Offer "Create Paper Type Documents".
- Explain that PDFs stay in the local vault.

Unparsed paper:

- Show source PDF.
- Offer parser selection.
- Explain generated sidecar files.

Broken citation:

- Show missing paper/block.
- Offer repair/rescan.
- Offer search similar blocks.

## 11. Functional Requirements

### 11.1 Paper Import

Users can import a PDF into the active vault.

Requirements:

- User chooses a PDF file.
- App creates `papers/<slug>/source.pdf`.
- App creates `papers/<slug>/paper.md`.
- App derives slug from title/filename.
- App does not mutate the original source file outside the vault.
- If the source already exists, app prompts for dedupe, replace, or create new.

Acceptance criteria:

- Imported PDF appears in Papers.
- `paper.md` has `type: Paper`.
- PDF opens in Paper Reader Mode.
- Git changes show new files when vault is Git-backed.

### 11.2 Paper Parsing

Users can parse a paper into a readable Markdown Paper note plus block sidecars.

Parser providers:

- Local parser adapter.
- MinerU adapter.
- Manual/test fixture adapter for development.

Requirements:

- Parser output normalizes into `blocks.jsonl`.
- Parser output also rewrites the parser-owned `paper.md` body as readable Markdown.
- Each parsed Markdown block includes a hidden stable `tolaria:block` anchor with block id, page, kind, and hash.
- Parser status is visible in UI.
- Parse failures are recoverable.
- Re-parse preserves stable block IDs where possible.
- Old block IDs should be mapped to new IDs when repair is possible.

Acceptance criteria:

- After parsing, `paper.md` reads as a continuous Paper note.
- `paper.md` anchors and `blocks.jsonl` SourceBlock ids remain consistent.
- The block outline appears from the machine index.
- A block can be selected.
- Copy Block Citation returns `@block[paper_id#block_id]`.
- Re-parsing does not break unchanged citations.

### 11.3 Block Citation Editing

Users can insert, view, click, and repair block citations.

Requirements:

- Raw Markdown syntax remains durable.
- Rich editor renders inline citation chip.
- Chip opens source paper and block.
- Hover card previews block text/page.
- Broken citation state is visible.
- Citation parser should not conflict with wikilinks.

Acceptance criteria:

- `@block[...]` round-trips through rich editor and raw editor.
- Saving and reopening preserves citation syntax.
- Clicking citation navigates to correct block.
- Broken citation shows warning but does not corrupt note.

### 11.4 Annotation Persistence

Users can highlight and annotate selected blocks.

Requirements:

- Annotations write to `annotations.jsonl`.
- PDF overlay annotations do not modify `source.pdf`.
- Semantic color palette is available.
- Annotation counts update in Paper List/Inspector.
- Annotation writes follow Tolaria disk-first behavior.

Acceptance criteria:

- Highlight persists after reload.
- Annotation file is human-inspectable JSONL.
- Git diff shows annotation additions.

### 11.5 Research Notes

Users can create ordinary ResearchNotes and cite Paper blocks while reading.

Requirements:

- ResearchNotes are normal Markdown notes created through Tolaria's existing note workflow.
- Notes can link to the Paper with existing wikilink/path conventions.
- Selected block citations use canonical `@block[paper_id#block_id]` syntax.
- Paper Reader does not own a special note template or append action.

Acceptance criteria:

- User can cite Paper evidence from ordinary notes without mixing notes into parser-owned `paper.md`.
- New note appears in Research Notes.
- Note links back to Paper.

### 11.6 Research Memory Compiler

Users can compile research memory from notes, highlights, annotations, and saved Ask traces.

Requirements:

- Compiler reads only explicit paper-local context by default.
- Compiler writes `memory.md`.
- Compiler distinguishes paper facts from user observations.
- Compiler records corrections.
- User can inspect and manually edit memory.

Acceptance criteria:

- Compile creates or updates `memory.md`.
- Memory includes block citations for paper facts.
- User observations are labeled separately.
- Re-running compiler preserves explicit user corrections where possible.

### 11.7 Grounded Ask

Users can ask questions about a current block, selected blocks, a paper, or linked notes.

Requirements:

- Ask is invoked explicitly.
- Context builder is visible or inspectable.
- Paper claims in answers require block citations.
- If evidence is insufficient, model must say so.
- Ask traces can be saved to `ask-traces.jsonl`.
- Saved traces can feed the memory compiler.

Acceptance criteria:

- Ask about current block answers using that block and nearby context.
- Ask about paper includes citations.
- Unsupported claims are flagged or omitted.
- Saved Ask trace appears in sidecar file.

### 11.8 Citation Validation

Users can validate citations in a note or AI answer.

Requirements:

- Detect malformed citations.
- Detect missing paper IDs.
- Detect missing block IDs.
- Detect paper facts without block citations in AI-generated content.
- Provide repair suggestions where possible.

Acceptance criteria:

- Validation command lists all broken citations.
- Clicking a validation issue navigates to location.
- Similar-block repair can search by old text hash or quoted text.

### 11.9 MCP Paper Tools

The MCP server should expose paper-specific operations.

Initial tools:

| Tool | Purpose |
| --- | --- |
| `list_papers` | List Paper entities |
| `read_paper` | Read paper metadata and summary |
| `read_paper_block` | Read a specific SourceBlock |
| `search_paper_blocks` | Search blocks by text |
| `list_paper_annotations` | Read annotation sidecars |
| `create_research_note` | Create a note linked to a paper |
| `append_block_citation` | Append text with block citation to a note |
| `compile_research_memory` | Run memory compiler |
| `validate_citations` | Validate citation syntax and evidence |

Requirements:

- Tools must stay scoped to active mounted vaults.
- Tools must respect Tolaria Safe/Power User permission modes.
- Tools must not access PDFs outside loaded vault roots.

## 12. AI Behavior Requirements

### 12.1 Context Layers

Grounded Ask context should be built from explicit layers:

```text
current block
selected blocks
nearby blocks
current paper metadata
current research note
linked research notes
annotations
paper graph
memory.md
saved Ask traces
```

Default context should be narrow:

- Current block or selected blocks first.
- Current paper second.
- Paper-local notes third.
- Vault-wide search only when user requests it.

### 12.2 Authority Labels

Every generated answer should distinguish:

| Authority | Meaning |
| --- | --- |
| `source_claim` | The paper says this |
| `user_annotation` | The user wrote or marked this |
| `agent_synthesis` | The model inferred this |
| `tool_execution` | A tool or command produced this |
| `user_decision` | The user accepted/corrected this |

### 12.3 Answer Rules

The research Ask prompt must enforce:

1. Cite paper claims with `@block[paper#block]`.
2. Do not invent paper claims.
3. Separate paper content from user interpretation.
4. Use memory as context, not as source truth.
5. Say when the available context is insufficient.
6. Avoid external search unless user explicitly requests and the environment supports it.
7. Prefer concise answers during reading.
8. Offer to save useful outputs as notes or Ask traces.

## 13. Technical Architecture

### 13.1 Module Layout

Proposed frontend additions:

```text
src/
  paper/
    types.ts
    paperConventions.ts
    paperPaths.ts
    blockCitation.ts
    blockCitation.test.ts
    usePaperLoader.ts
    usePaperReaderState.ts
    usePaperAnnotations.ts
    useResearchMemory.ts
    researchContextBuilder.ts

  components/paper/
    PaperReader.tsx
    PaperReaderToolbar.tsx
    PaperOutline.tsx
    PaperPdfPane.tsx
    PaperBlocksPane.tsx
    PaperInspector.tsx
    BlockCitationChip.tsx
    BlockCitationHoverCard.tsx
    AnnotationPalette.tsx
    ResearchAskPanel.tsx
```

Proposed Rust/Tauri additions:

```text
src-tauri/src/
  paper/
    mod.rs
    commands.rs
    paths.rs
    blocks.rs
    annotations.rs
    import.rs
    parse.rs
    memory.rs
```

Proposed MCP additions:

```text
mcp-server/
  paper-tools.js
```

### 13.2 Tauri Commands

Initial commands:

| Command | Purpose |
| --- | --- |
| `import_paper_pdf` | Copy PDF into vault and create `paper.md` |
| `get_paper_bundle` | Read paper metadata and sidecar status |
| `parse_paper` | Run selected parser provider |
| `read_paper_blocks` | Read `blocks.jsonl` |
| `read_paper_block` | Read one block by ID |
| `search_paper_blocks` | Search blocks |
| `save_paper_annotation` | Append/update annotation |
| `delete_paper_annotation` | Delete annotation |
| `compile_research_memory` | Generate/update `memory.md` |
| `validate_block_citations` | Validate citations in note text |

All commands must:

- Validate active vault boundary.
- Avoid path traversal.
- Use disk-first writes.
- Return structured errors.
- Have mock implementations for browser/dev mode.

### 13.3 Cache Strategy

Durable files:

- `paper.md`
- `source.pdf`
- `blocks.jsonl`
- `annotations.jsonl`
- `ask-traces.jsonl`
- `graph.json`
- `memory.md`

Disposable cache:

- Parsed block index cache.
- Citation lookup cache.
- Search index.
- Embedding index.
- Render thumbnails.
- Parser temp output.

Cache location should stay outside the vault unless it is a durable artifact.

### 13.4 Parser Adapter Contract

Parser adapters must normalize into this internal result:

```typescript
interface PaperParseResult {
  paperId: string
  parser: string
  parserVersion: string
  parsedAt: string
  blocks: SourceBlock[]
  assets: PaperAsset[]
  warnings: PaperParseWarning[]
}
```

Output writer:

- Writes `blocks.jsonl`.
- Writes the parser-owned Markdown projection into `paper.md` body with hidden block anchors.
- Writes extracted assets under `assets/` if needed.
- Writes parse metadata into `paper.md` system fields or a future `_parse` sidecar.
- Preserves previous block IDs when matching confidence is high.

## 14. Data and File Schemas

### 14.1 `blocks.jsonl`

Each line is one JSON object.

Required:

```json
{
  "id": "b0023",
  "paper_id": "vaswani-2017-attention",
  "kind": "paragraph",
  "page": 2,
  "hash": "sha256:..."
}
```

Optional:

- `text`
- `caption`
- `bbox`
- `section`
- `order`
- `source_asset`
- `confidence`
- `parser`

### 14.2 `annotations.jsonl`

Each line is one JSON object.

Required:

```json
{
  "id": "ann_001",
  "paper_id": "vaswani-2017-attention",
  "kind": "highlight",
  "created_at": "2026-07-02T10:15:00Z"
}
```

One of:

- `block_id`
- `page` plus `bbox`

Optional:

- `color`
- `text`
- `note`
- `updated_at`
- `deleted_at`

### 14.3 `ask-traces.jsonl`

Example:

```json
{
  "id": "ask_001",
  "paper_id": "vaswani-2017-attention",
  "created_at": "2026-07-02T11:00:00Z",
  "question": "What is the core architectural contribution?",
  "context": {
    "blocks": ["b0008", "b0023"],
    "notes": ["notes/critique.md"]
  },
  "answer_markdown": "The paper introduces...",
  "citations": ["@block[vaswani-2017-attention#b0008]"]
}
```

### 14.4 `graph.json`

Should remain simple in MVP. Graph editing is not required in early phases.

### 14.5 `memory.md`

Human-readable Markdown. AI may propose changes, but users can edit it directly.

## 15. Migration from Current Sapientia

### 15.1 Migration Goals

- Preserve PDFs.
- Preserve paper metadata.
- Preserve parsed blocks where possible.
- Preserve notes and block citations.
- Preserve highlights and annotations.
- Preserve research memory and interaction profile where useful.

### 15.2 Migration Tool

Add a one-time importer:

```text
Import Sapientia Workspace...
```

Inputs:

- Sapientia export folder, or
- Sapientia API export, or
- database/object storage export in a later tool.

Outputs:

- Tolaria research vault files.

### 15.3 Mapping

| Sapientia | Tolaria Research Edition |
| --- | --- |
| Paper row | `papers/<slug>/paper.md` |
| PDF object | `papers/<slug>/source.pdf` |
| Parsed blocks | `papers/<slug>/blocks.jsonl` |
| Notes | `papers/<slug>/notes/*.md` or root notes |
| Citation chips | `@block[paper#block]` |
| Highlights | `annotations.jsonl` |
| Paper graph | `graph.json` |
| Research memory capsule | `memory.md` |
| Ask traces | `ask-traces.jsonl` |
| User settings | App settings or ignored depending on scope |

## 16. Milestones

### Phase 0: Design Lock

Deliverables:

- This PRD.
- ADR: Paper vault model.
- ADR: Block-addressable paper sidecars.
- ADR: Research memory as vault artifact.
- Technical design for first Tauri commands.

Exit criteria:

- File conventions accepted.
- MVP scope frozen.
- No database source-of-truth dependency.

### Phase 1: Paper Entity MVP

Deliverables:

- Seed Paper Type document.
- Import Paper PDF command.
- `paper.md` creation.
- Paper rows in sidebar/list.
- PDF preview in existing file preview or Paper Reader shell.

Exit criteria:

- User can import a PDF and open it as a Paper.
- Git diff shows expected files.
- Tests cover paper path conventions.

### Phase 2: Block Sidecars and Citations

Deliverables:

- `blocks.jsonl` schema and reader.
- Parser fixture adapter.
- Block outline.
- Copy Block Citation.
- `@block[...]` parser and renderer.
- Citation hover preview.

Exit criteria:

- User can select a block and cite it in a note.
- Citation persists across save/reopen.
- Broken citations are visible.

### Phase 3: Paper Reader and Annotations

Deliverables:

- Paper Reader Mode.
- PDF/block pane toggle.
- Annotation palette.
- `annotations.jsonl` persistence.

Exit criteria:

- User can read, highlight, annotate, and cite blocks from ordinary notes.
- Annotations persist and are visible after reload.

### Phase 4D: Rendered Paper Note View

Deliverables:

- Continuous rendered Paper view from anchored `paper.md`.
- Stable hidden block anchors for selection and citation.
- Comment gutter with annotation counts.
- Block-level comment thread backed by `annotations.jsonl`.
- Copy citation actions from the comment thread.

Exit criteria:

- Paper reads like a rendered note rather than a debug block list.
- `blocks.jsonl` remains the machine index, not the primary reading surface.
- Users can add, edit, and delete block-level comments without changing `paper.md`.
- Long-form synthesis uses ordinary ResearchNotes created through Tolaria's normal note workflow.

### Phase 4E: Note Editor Comment Seam and Paper Markdown Read/Comment Mode

Deliverables:

- Generic comment provider interface for anchor-backed comment threads.
- Reusable comment gutter, thread, and composer UI.
- Paper adapter that maps `annotations.jsonl` records to comment threads by parsed block anchor.
- Paper Reader layout with a single Reading View surface that switches between Markdown and PDF modes.
- No standalone Paper Outline column; parsed `paper.md` should behave like a normal Tolaria note surface.

Exit criteria:

- Paper Markdown mode reads like a Tolaria note surface while comments remain sidecar-backed.
- Comment UI is generic enough to support future normal-note comments.
- `paper.md` is not mutated by comment create, edit, or delete actions.
- Existing citation and annotation workflows still work.

### Phase 4F: Shared NoteSurface for Paper and no Marginalia workflow

Deliverables:

- Paper Markdown mode mounts `paper.md` through the shared Note surface used by ordinary notes.
- Paper source content is read-only/commentable by default.
- Paper comments continue to persist through `annotations.jsonl`.
- Marginalia-specific mode, pane, commands, templates, and append actions are removed.
- Users can still create ordinary `ResearchNote` notes when they want long-form synthesis.

Exit criteria:

- Paper Reading View looks and behaves like a normal Tolaria note surface.
- Reading View has only Markdown and PDF modes.
- Comment create/edit/delete actions do not mutate `paper.md`.
- Ordinary note editing/rendering is unchanged.

### Phase 5: Grounded Ask

Deliverables:

- Research context builder.
- Ask About Current Block.
- Ask About Current Paper.
- Save Ask trace.
- Citation validation for AI outputs.

Exit criteria:

- AI answer about paper claims includes block citations.
- User can save an Ask trace.
- Insufficient evidence is handled explicitly.

### Phase 6: Research Memory Compiler

Deliverables:

- Compile Research Memory command.
- `memory.md` generation/update.
- Memory preview in inspector.
- Correction preservation.
- Ask traces feed memory compiler.

Exit criteria:

- User can compile memory from notes/annotations/traces.
- Paper facts have citations.
- User observations are separate.

### Phase 7: Sapientia Importer

Deliverables:

- Import from Sapientia export folder.
- Migration report.
- Citation repair suggestions.
- Sidecar validation.

Exit criteria:

- A representative Sapientia workspace migrates into a research vault.
- PDFs, notes, blocks, annotations, and memory are preserved.

## 17. Success Metrics

### 17.1 Activation

- User imports first paper.
- User parses first paper.
- User creates first block citation.
- User creates first ResearchNote with a block citation.

### 17.2 Engagement

- Papers read per week.
- Notes with block citations.
- Highlights per paper.
- Saved Ask traces.
- Memory compilations.

### 17.3 Quality

- Citation validation pass rate.
- Broken citations per vault.
- Re-parse citation preservation rate.
- Ask answers with required citations.

### 17.4 Retention

- Weekly active research vaults.
- Git-backed vault usage.
- Return after first memory compilation.

Metrics must avoid storing paper text, note content, or private research details in analytics.

## 18. Privacy and Security

Requirements:

- PDFs remain local unless user chooses a remote parser.
- Remote parser use must be explicit per paper or setting.
- API keys must remain outside the vault unless user deliberately references environment variables.
- AI context must be inspectable for research Ask.
- MCP tools must respect active vault boundaries.
- External agent operations must follow Tolaria Safe/Power User modes.
- No paper text or note content in telemetry.
- Parser temp files must be cleaned or stored in app cache.

Remote MinerU adapter requirements:

- Show what file will be uploaded.
- Show parser provider name.
- Store parse result locally.
- Record parse provider metadata.
- Allow user to delete parser output and reparse.

## 19. Accessibility and Keyboard UX

Requirements:

- Paper Reader controls keyboard accessible.
- Block outline navigable by keyboard.
- Citation chips focusable.
- Hover preview also available by focus.
- Annotation palette accessible without mouse.
- Commands available through Command Palette.
- Color semantics should not rely on color alone.

## 20. Localization

All new user-facing copy must use Tolaria's localization runtime.

Initial copy surfaces:

- Paper import dialog.
- Parser status messages.
- Paper Reader toolbar.
- Annotation palette labels.
- Citation validation messages.
- Research Ask labels.
- Memory compiler messages.

## 21. Testing Strategy

### 21.1 Unit Tests

Cover:

- Paper path conventions.
- Paper frontmatter parsing.
- `blocks.jsonl` parsing.
- Annotation JSONL append/update/delete.
- `@block[...]` parser.
- Citation validation.
- Research context builder.

### 21.2 Rust Tests

Cover:

- Tauri command path boundary.
- Import PDF file operations.
- Sidecar read/write.
- Block lookup.
- Re-parse ID matching helpers.

### 21.3 Playwright / Smoke Tests

Core flows:

1. Import PDF fixture.
2. Open Paper.
3. Load fixture blocks.
4. Copy block citation.
5. Insert citation into note.
6. Save and reload note.
7. Click citation to return to block.
8. Add annotation and verify persistence.

### 21.4 Manual Native QA

Cover:

- PDF preview on macOS, Windows, Linux.
- Drag/drop PDF import.
- Keyboard command flow.
- Git diff after annotation and note changes.
- AI workspace research context behavior.

## 22. Open Questions

1. Should paper directories always live under `papers/`, or should any `type: Paper` note be allowed anywhere?
2. Should `blocks.jsonl` be the only block source, or should `paper.md` include a parsed Markdown projection?
3. Should annotations be append-only JSONL, or should deletion rewrite the file?
4. How should re-parse repair map old block IDs to new block IDs?
5. Should remote parser metadata live in `paper.md` frontmatter or a separate sidecar?
6. Should research memory be paper-local only in MVP, or should project/vault-level memory ship early?
7. How much of Tolaria's existing BlockNote editor should be extended for citation chips versus rendering citation chips as Markdown decorations?
8. Should Zotero import/export be part of v1 or deferred?
9. Should embeddings be introduced before or after grounded Ask MVP?
10. What is the minimum viable local parser if MinerU credentials are unavailable?

## 23. Key Product Decisions

Recommended decisions for MVP:

| Decision | Recommendation |
| --- | --- |
| Base app | Fork Tolaria |
| Source of truth | Vault files |
| Main paper folder | `papers/<paper-slug>/` |
| Block format | `blocks.jsonl` |
| Annotation format | `annotations.jsonl` |
| Citation syntax | `@block[paper_id#block_id]` |
| Initial parser | Fixture/local adapter plus MinerU adapter |
| AI integration | Tolaria AI workspace research mode |
| MCP | Extend existing MCP server |
| Database | No knowledge database in MVP |
| Graph UI | Inspector/table first, visual graph later |
| Memory | `memory.md` as editable artifact |

## 24. MVP Definition

The smallest useful product is:

1. Import a PDF into a Tolaria vault as a Paper.
2. Parse or load fixture blocks into `blocks.jsonl`.
3. Open Paper Reader Mode.
4. Select a block and copy/insert a citation.
5. Write a ResearchNote with `@block[...]`.
6. Click citation to jump back to the source block.
7. Highlight a block and persist annotation.
8. Ask a question about the current block and receive cited answer.

Anything beyond this is not required for MVP.

## 25. v1 Definition

v1 should include:

- Stable paper import.
- Parser adapter system.
- Block citation editor integration.
- Paper Reader Mode.
- Annotation persistence.
- Research notes.
- Grounded Ask.
- Research memory compiler.
- Citation validation.
- MCP paper tools.
- Sapientia importer.
- Git-friendly sidecar diffs.
- Cross-platform desktop QA.

## 26. Appendix: Example User Journey

1. User opens a research vault.
2. User runs "Import Paper PDF".
3. App creates `papers/attention-is-all-you-need/source.pdf` and `paper.md`.
4. User clicks "Parse Paper".
5. App writes anchored parsed Markdown into `paper.md` and normalized blocks into `blocks.jsonl`.
6. User opens Paper Reader Mode.
7. User highlights a paragraph as Important.
8. App appends to `annotations.jsonl`.
9. User creates or opens an ordinary ResearchNote.
10. User inserts `@block[vaswani-2017-attention#b0023]`.
11. User asks "What is the key architectural contribution?"
12. AI answers with block citations.
13. User saves the answer as an Ask trace.
14. User compiles research memory.
15. App writes `memory.md`.
16. Git shows changes to `paper.md`, `blocks.jsonl`, `annotations.jsonl`, the user's ResearchNote, `ask-traces.jsonl`, and `memory.md`.

## 27. Appendix: Terminology

| Term | Definition |
| --- | --- |
| Vault | Local folder managed by Tolaria |
| Paper | Research paper entity in vault |
| SourceBlock | Stable unit extracted from paper |
| Block Citation | Markdown token pointing to SourceBlock |
| Sidecar | File stored beside source PDF containing derived or user-created data |
| Annotation | User-created sidecar mark such as comment, highlight, question, underline, or bookmark |
| ResearchMemory | Compiled memory artifact from notes and traces |
| Grounded Ask | AI question answering constrained by explicit evidence |
| MCP | Model Context Protocol bridge exposing vault tools to agents |

## 28. Implementation Notes

Start with file contracts and navigation before AI.

Do not start by integrating MinerU, building graph visualization, or designing memory prompts. Those depend on a stable paper/block/citation substrate.

Recommended first implementation order:

1. Type documents and paper path conventions.
2. Import Paper PDF.
3. Paper bundle loader.
4. Fixture `blocks.jsonl` reader.
5. Paper Reader shell.
6. Citation syntax parser.
7. Citation chip renderer.
8. Annotation sidecar.
9. Research context builder.
10. Grounded Ask.

This keeps the project aligned with Tolaria's architecture while gradually bringing Sapientia's distinctive research workflow into the app.
