/**
 * AI contextual chat — builds a structured context snapshot from the active note,
 * open tabs, vault metadata, and optional explicit note references.
 */

import type { VaultEntry } from '../types'
import { parseBlockCitations } from '../paper/blockCitations'
import { isPaperEntry } from '../paper/types'
import { wikilinkTarget, resolveEntry } from './wikilink'
import { splitFrontmatter } from './wikilinks'

/** Extract only the body text from raw file content (strips YAML frontmatter). */
function extractBody(rawContent: string): string {
  const [, body] = splitFrontmatter(rawContent)
  return body.trim()
}

/** Resolve a link target string to a VaultEntry by matching title, aliases, or filename stem.
 *  Delegates to the unified resolveEntry for consistent matching. */
export function resolveTarget(target: string, entries: VaultEntry[]): VaultEntry | undefined {
  return resolveEntry(entries, target)
}

/** Collect first-degree linked notes from the active entry. */
export function collectLinkedEntries(
  active: VaultEntry,
  entries: VaultEntry[],
): VaultEntry[] {
  const seen = new Set<string>([active.path])
  const linked: VaultEntry[] = []

  const addTarget = (target: string) => {
    const entry = resolveTarget(target, entries)
    if (entry && !seen.has(entry.path)) {
      seen.add(entry.path)
      linked.push(entry)
    }
  }

  for (const target of active.outgoingLinks) {
    addTarget(target)
  }

  for (const refs of Object.values(active.relationships)) {
    for (const ref of refs) {
      addTarget(wikilinkTarget(ref))
    }
  }

  for (const ref of active.belongsTo) {
    addTarget(wikilinkTarget(ref))
  }
  for (const ref of active.relatedTo) {
    addTarget(wikilinkTarget(ref))
  }

  return linked
}

/** A note reference from the user's [[wikilink]] selection in the chat input. */
export interface NoteReference {
  title: string
  path: string
  type?: string | null
  content?: string
}

export type AiSelectedTextContext = AiSelectedTextSelectionContext | AiSelectedImageContext

export interface AiSelectedTextSelectionContext {
  kind: 'text'
  entryPath: string
  entryTitle: string
  text: string
  anchorId?: string
  paperId?: string
  blockCitation?: string
}

export interface AiSelectedImageContext {
  kind: 'image'
  entryPath: string
  entryTitle: string
  path: string
  sourceUrl?: string
}

/** Lightweight note summary for the context snapshot. */
export interface NoteListItem {
  path: string
  title: string
  type: string
}

/** Parameters for building the structured context snapshot. */
export interface ContextSnapshotParams {
  activeEntry: VaultEntry
  /** Direct content of the active note from the editor tab (most reliable source). */
  activeNoteContent?: string
  openTabs?: VaultEntry[]
  noteList?: NoteListItem[]
  noteListFilter?: { type: string | null; query: string }
  entries: VaultEntry[]
  references?: NoteReference[]
  selectedContext?: AiSelectedTextContext | null
  selectedPaperId?: string | null
  selectedBlockId?: string | null
}

const MAX_ACTIVE_NOTE_BODY_CHARS = 24_000
const ACTIVE_NOTE_BODY_HEAD_CHARS = 16_000
const ACTIVE_NOTE_BODY_TAIL_CHARS = 4_000
const MAX_REFERENCED_NOTE_BODY_CHARS = 12_000
const REFERENCED_NOTE_BODY_HEAD_CHARS = 8_000
const REFERENCED_NOTE_BODY_TAIL_CHARS = 2_000
const MAX_NOTE_LIST_ITEMS = 100
const MAX_RELATED_PAPERS = 8
const MAX_BLOCK_CITATIONS = 20
const MAX_SELECTED_TEXT_CHARS = 4_000

export interface PaperAiContextSummary {
  toolsAvailable: boolean
  contextIncluded: boolean
  activePaper: {
    paperId: string
    title: string
    year?: number
    venue?: string
    venueType?: string
  } | null
  relatedPaperCount: number
  blockCitationCount: number
  mountedPaperVaults: Array<{
    id: string
    label: string
    path: string
    paperCount: number
    readOnly: true
  }>
  selectedPaperId?: string
  selectedBlockId?: string
}

interface ActiveNoteBody {
  body: string
  bodyTruncated?: {
    shownChars: number
    totalChars: number
    strategy: 'head-tail'
  }
}

function isPresentValue(value: unknown): boolean {
  if (value === null) return false
  if (value === undefined) return false
  if (value === '') return false
  return true
}

function assignIfPresent(target: Record<string, unknown>, key: string, value: unknown): void {
  if (isPresentValue(value)) Reflect.set(target, key, value)
}

function assignIfNonEmpty(target: Record<string, unknown>, key: string, values: unknown[]): void {
  if (values.length > 0) {
    Reflect.set(target, key, values)
  }
}

function propertyString(value: unknown): string | undefined {
  if (!isPresentValue(value)) return undefined
  return typeof value === 'string' ? value : String(value)
}

function entryFrontmatter(e: VaultEntry): Record<string, unknown> {
  const fm: Record<string, unknown> = {}
  assignIfPresent(fm, 'type', e.isA)
  assignIfPresent(fm, 'status', e.status)
  assignIfPresent(fm, 'owner', propertyString(e.properties?.Owner ?? e.properties?.owner))
  assignIfPresent(fm, 'cadence', propertyString(e.properties?.Cadence ?? e.properties?.cadence))
  assignIfNonEmpty(fm, 'belongsTo', e.belongsTo)
  assignIfNonEmpty(fm, 'relatedTo', e.relatedTo)
  assignIfNonEmpty(fm, 'relationships', Object.keys(e.relationships))
  if (fm.relationships) fm.relationships = e.relationships
  return fm
}

function unavailableBodyInstruction(activeEntry: VaultEntry): string {
  return `[Content not available in editor context — use get_note("${activeEntry.path}") to read the full note (${activeEntry.wordCount} words)]`
}

function truncatedBodyInstruction(path: string, omittedChars: number): string {
  return [
    '[Active note body truncated by Sapientia to keep CLI agent context within provider limits.',
    `Omitted approximately ${omittedChars} characters from the middle.`,
    `Use get_note("${path}") to read the full note before making content-sensitive edits or summaries.]`,
  ].join(' ')
}

function truncatedReferencedBodyInstruction(path: string, omittedChars: number): string {
  return [
    '[Referenced note body truncated by Sapientia to keep CLI agent context within provider limits.',
    `Omitted approximately ${omittedChars} characters from the middle.`,
    `Use get_note("${path}") to read the full note before making content-sensitive edits or summaries.]`,
  ].join(' ')
}

function compactActiveNoteBody(body: string, path: string): ActiveNoteBody {
  if (body.length <= MAX_ACTIVE_NOTE_BODY_CHARS) {
    return { body }
  }

  const head = body.slice(0, ACTIVE_NOTE_BODY_HEAD_CHARS).trimEnd()
  const tail = body.slice(-ACTIVE_NOTE_BODY_TAIL_CHARS).trimStart()
  const omittedChars = Math.max(0, body.length - ACTIVE_NOTE_BODY_HEAD_CHARS - ACTIVE_NOTE_BODY_TAIL_CHARS)

  return {
    body: `${head}\n\n${truncatedBodyInstruction(path, omittedChars)}\n\n${tail}`,
    bodyTruncated: {
      shownChars: ACTIVE_NOTE_BODY_HEAD_CHARS + ACTIVE_NOTE_BODY_TAIL_CHARS,
      totalChars: body.length,
      strategy: 'head-tail',
    },
  }
}

function compactReferencedNoteBody(body: string, path: string): ActiveNoteBody {
  if (body.length <= MAX_REFERENCED_NOTE_BODY_CHARS) {
    return { body }
  }

  const head = body.slice(0, REFERENCED_NOTE_BODY_HEAD_CHARS).trimEnd()
  const tail = body.slice(-REFERENCED_NOTE_BODY_TAIL_CHARS).trimStart()
  const omittedChars = Math.max(0, body.length - REFERENCED_NOTE_BODY_HEAD_CHARS - REFERENCED_NOTE_BODY_TAIL_CHARS)

  return {
    body: `${head}\n\n${truncatedReferencedBodyInstruction(path, omittedChars)}\n\n${tail}`,
    bodyTruncated: {
      shownChars: REFERENCED_NOTE_BODY_HEAD_CHARS + REFERENCED_NOTE_BODY_TAIL_CHARS,
      totalChars: body.length,
      strategy: 'head-tail',
    },
  }
}

function activeNoteBody(activeEntry: VaultEntry, activeNoteContent?: string): ActiveNoteBody {
  const body = extractBody(activeNoteContent || '')
  if (!body && activeEntry.wordCount > 0) {
    return { body: unavailableBodyInstruction(activeEntry) }
  }
  return compactActiveNoteBody(body, activeEntry.path)
}

function activeNoteSnapshot(activeEntry: VaultEntry, activeNoteContent?: string): Record<string, unknown> {
  const bodySnapshot = activeNoteBody(activeEntry, activeNoteContent)
  const note: Record<string, unknown> = {
    path: activeEntry.path,
    title: activeEntry.title,
    type: activeEntry.isA ?? 'Note',
    frontmatter: entryFrontmatter(activeEntry),
    body: bodySnapshot.body,
    wordCount: activeEntry.wordCount,
  }
  assignIfPresent(note, 'bodyTruncated', bodySnapshot.bodyTruncated)
  return note
}

function propertyStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map(item => item.trim()).filter(Boolean)
  }
  const scalar = propertyString(value)
  return scalar
    ? scalar.split(/;|\n|\sand\s/iu).map(item => item.trim()).filter(Boolean)
    : []
}

function propertyNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function paperIdForEntry(entry: VaultEntry): string | undefined {
  return propertyString(entry.properties?.paper_id)
    ?? entry.path.match(/\/papers\/([^/]+)\/paper\.md$/u)?.[1]
}

function paperSummary(entry: VaultEntry): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    paper_id: paperIdForEntry(entry) ?? entry.title,
    title: propertyString(entry.properties?.title) ?? entry.title,
    path: entry.path,
  }
  assignIfNonEmpty(summary, 'authors', propertyStringArray(entry.properties?.authors))
  assignIfPresent(summary, 'year', propertyNumber(entry.properties?.year))
  assignIfPresent(summary, 'venue', propertyString(entry.properties?.venue))
  assignIfPresent(summary, 'venue_type', propertyString(entry.properties?.venue_type))
  assignIfPresent(summary, 'doi', propertyString(entry.properties?.doi))
  assignIfPresent(summary, 'arxiv_id', propertyString(entry.properties?.arxiv_id))
  assignIfPresent(summary, 'metadata_status', propertyString(entry.properties?.metadata_status))
  assignIfPresent(summary, 'parse_status', propertyString(entry.properties?.parse_status))
  assignIfPresent(summary, 'source_pdf', propertyString(entry.properties?.source_pdf))
  assignIfPresent(summary, 'blocks', propertyString(entry.properties?.blocks))
  assignIfPresent(summary, 'comments_sidecar', propertyString(entry.properties?.comments) ?? propertyString(entry.properties?.annotations))
  assignIfPresent(summary, 'workspace', entry.workspace ? {
    id: entry.workspace.id,
    label: entry.workspace.label,
    path: entry.workspace.path,
  } : null)
  return summary
}

function compactPaperForSummary(entry: VaultEntry): NonNullable<PaperAiContextSummary['activePaper']> {
  const paper: NonNullable<PaperAiContextSummary['activePaper']> = {
    paperId: paperIdForEntry(entry) ?? entry.title,
    title: propertyString(entry.properties?.title) ?? entry.title,
  }
  const year = propertyNumber(entry.properties?.year)
  if (year !== undefined) paper.year = year
  const venue = propertyString(entry.properties?.venue)
  if (venue) paper.venue = venue
  const venueType = propertyString(entry.properties?.venue_type)
  if (venueType) paper.venueType = venueType
  return paper
}

function findPaperById(entries: VaultEntry[], paperId: string): VaultEntry | undefined {
  return entries.find(entry => isPaperEntry(entry) && paperIdForEntry(entry) === paperId)
}

function blockCitationContext(activeNoteContent: string | undefined, entries: VaultEntry[]): Record<string, unknown>[] {
  if (!activeNoteContent) return []
  return parseBlockCitations(activeNoteContent)
    .filter(citation => !citation.malformed)
    .slice(0, MAX_BLOCK_CITATIONS)
    .map(citation => {
      const paper = findPaperById(entries, citation.paperId)
      const item: Record<string, unknown> = {
        paper_id: citation.paperId,
        block_id: citation.blockId,
        raw: citation.raw,
        citation: `@block[${citation.paperId}#${citation.blockId}]`,
      }
      if (paper) {
        item.paper_title = propertyString(paper.properties?.title) ?? paper.title
        item.paper_path = paper.path
      }
      return item
    })
}

export function paperAiContextSummary(params: ContextSnapshotParams): PaperAiContextSummary {
  const { activeEntry, activeNoteContent, entries } = params
  const relatedPapers = collectLinkedEntries(activeEntry, entries)
    .filter(isPaperEntry)
    .slice(0, MAX_RELATED_PAPERS)
  const blockCitations = blockCitationContext(activeNoteContent, entries)
  const activeWorkspacePath = activeEntry.workspace?.path
  const mountedPaperVaultMap = new Map<string, NonNullable<PaperAiContextSummary['mountedPaperVaults']>[number]>()

  for (const entry of entries) {
    if (!isPaperEntry(entry) || !entry.workspace?.mounted) continue
    if (activeWorkspacePath && entry.workspace.path === activeWorkspacePath) continue
    const existing = mountedPaperVaultMap.get(entry.workspace.id)
    if (existing) {
      existing.paperCount += 1
      continue
    }
    mountedPaperVaultMap.set(entry.workspace.id, {
      id: entry.workspace.id,
      label: entry.workspace.label,
      path: entry.workspace.path,
      paperCount: 1,
      readOnly: true,
    })
  }

  const mountedPaperVaults = [...mountedPaperVaultMap.values()]
  const summary: PaperAiContextSummary = {
    toolsAvailable: isPaperEntry(activeEntry) || relatedPapers.length > 0 || blockCitations.length > 0 || mountedPaperVaults.length > 0,
    contextIncluded: isPaperEntry(activeEntry) || relatedPapers.length > 0 || blockCitations.length > 0,
    activePaper: isPaperEntry(activeEntry) ? compactPaperForSummary(activeEntry) : null,
    relatedPaperCount: relatedPapers.length,
    blockCitationCount: blockCitations.length,
    mountedPaperVaults,
  }

  if (params.selectedPaperId) summary.selectedPaperId = params.selectedPaperId
  if (params.selectedBlockId) summary.selectedBlockId = params.selectedBlockId
  return summary
}

function appendPaperContext(snapshot: Record<string, unknown>, params: ContextSnapshotParams): void {
  const { activeEntry, activeNoteContent, entries } = params
  const papers = collectLinkedEntries(activeEntry, entries)
    .filter(isPaperEntry)
    .slice(0, MAX_RELATED_PAPERS)
    .map(paperSummary)
  const citations = blockCitationContext(activeNoteContent, entries)
  const summary = paperAiContextSummary(params)

  if (isPaperEntry(activeEntry)) {
    snapshot.activePaper = {
      ...paperSummary(activeEntry),
      comments: {
        storage: propertyString(activeEntry.properties?.comments) ?? propertyString(activeEntry.properties?.annotations) ?? 'comments.jsonl',
        note: 'Paper comments are stored outside paper.md; use paper tools for block provenance before citing claims.',
      },
    }
  }
  if (papers.length > 0) snapshot.relatedPapers = papers
  if (citations.length > 0) snapshot.blockCitations = citations
  if (summary.toolsAvailable) {
    snapshot.paperTools = {
      available: true,
      mountedPaperVaults: summary.mountedPaperVaults,
      readOnlyMountedVaults: summary.mountedPaperVaults.map(vault => vault.path),
      guidance: 'Use search_papers for discovery, read_paper_metadata for bibliographic claims, and search/read_paper_blocks for evidence. Mounted Paper Vaults are read-only through Paper tools.',
    }
  }
}

function appendOpenTabs(snapshot: Record<string, unknown>, activeEntry: VaultEntry, openTabs?: VaultEntry[]): void {
  const otherTabs = openTabs?.filter(t => t.path !== activeEntry.path)
  if (!otherTabs?.length) return

  snapshot.openTabs = otherTabs.map(t => ({
    path: t.path,
    title: t.title,
    type: t.isA ?? 'Note',
    frontmatter: entryFrontmatter(t),
  }))
}

function appendNoteList(snapshot: Record<string, unknown>, noteList?: NoteListItem[]): void {
  if (!noteList?.length) return

  snapshot.noteList = noteList.slice(0, MAX_NOTE_LIST_ITEMS)
  if (noteList.length > MAX_NOTE_LIST_ITEMS) {
    snapshot.noteListTruncated = { shown: MAX_NOTE_LIST_ITEMS, total: noteList.length }
  }
}

function hasNoteListFilter(noteListFilter?: { type: string | null; query: string }): boolean {
  return Boolean(noteListFilter?.type || noteListFilter?.query)
}

function referencedNoteSnapshot(ref: NoteReference): Record<string, unknown> {
  const note: Record<string, unknown> = {
    path: ref.path,
    title: ref.title,
    type: ref.type ?? 'Note',
  }

  if (ref.content === undefined) {
    note.body = `[Referenced note content not embedded — use get_note("${ref.path}") to read the full note before answering about it.]`
    return note
  }

  const bodySnapshot = compactReferencedNoteBody(extractBody(ref.content), ref.path)
  note.body = bodySnapshot.body
  assignIfPresent(note, 'bodyTruncated', bodySnapshot.bodyTruncated)
  return note
}

function referencedNotesSnapshot(references?: NoteReference[]): Record<string, unknown>[] {
  return references?.map(referencedNoteSnapshot) ?? []
}

function appendReferencedNotes(snapshot: Record<string, unknown>, references?: NoteReference[]): void {
  const referencedNotes = referencedNotesSnapshot(references)
  if (!referencedNotes.length) return

  snapshot.referencedNotes = referencedNotes
}

function selectedTextContextSnapshot(selectedContext: AiSelectedTextSelectionContext): Record<string, unknown> | null {
  const text = selectedContext.text.trim()
  if (!text) return null

  const snapshot: Record<string, unknown> = {
    kind: selectedContext.kind,
    entryPath: selectedContext.entryPath,
    entryTitle: selectedContext.entryTitle,
    text: text.length > MAX_SELECTED_TEXT_CHARS ? text.slice(0, MAX_SELECTED_TEXT_CHARS).trimEnd() : text,
  }
  assignIfPresent(snapshot, 'anchorId', selectedContext.anchorId)
  assignIfPresent(snapshot, 'paperId', selectedContext.paperId)
  assignIfPresent(snapshot, 'blockCitation', selectedContext.blockCitation)
  if (text.length > MAX_SELECTED_TEXT_CHARS) {
    snapshot.textTruncated = {
      shownChars: MAX_SELECTED_TEXT_CHARS,
      totalChars: text.length,
    }
  }
  return snapshot
}

function selectedImageContextSnapshot(selectedContext: AiSelectedImageContext): Record<string, unknown> | null {
  const path = selectedContext.path.trim()
  if (!path) return null

  const snapshot: Record<string, unknown> = {
    kind: selectedContext.kind,
    entryPath: selectedContext.entryPath,
    entryTitle: selectedContext.entryTitle,
    path,
  }
  assignIfPresent(snapshot, 'sourceUrl', selectedContext.sourceUrl)
  return snapshot
}

function selectedContextSnapshot(selectedContext?: AiSelectedTextContext | null): Record<string, unknown> | null {
  if (!selectedContext) return null

  return selectedContext.kind === 'image'
    ? selectedImageContextSnapshot(selectedContext)
    : selectedTextContextSnapshot(selectedContext)
}

function appendSelectedContext(snapshot: Record<string, unknown>, selectedContext?: AiSelectedTextContext | null): void {
  const selected = selectedContextSnapshot(selectedContext)
  if (!selected) return

  snapshot.selectedContext = selected
}

function vaultSummary(entries: VaultEntry[]): Record<string, unknown> {
  const types = new Set<string>()
  for (const e of entries) {
    if (e.isA) types.add(e.isA)
  }
  return {
    types: [...types].sort(),
    totalNotes: entries.length,
  }
}

function contextSnapshot(params: ContextSnapshotParams): Record<string, unknown> {
  const { activeEntry, activeNoteContent, openTabs, noteList, noteListFilter, entries, references, selectedContext } = params
  const snapshot: Record<string, unknown> = {
    activeNote: activeNoteSnapshot(activeEntry, activeNoteContent),
  }

  appendOpenTabs(snapshot, activeEntry, openTabs)
  appendNoteList(snapshot, noteList)
  if (hasNoteListFilter(noteListFilter)) snapshot.noteListFilter = noteListFilter
  snapshot.vault = vaultSummary(entries)
  appendReferencedNotes(snapshot, references)
  appendSelectedContext(snapshot, selectedContext)
  appendPaperContext(snapshot, params)
  return snapshot
}

/** Build a structured context snapshot as a system prompt for Claude. */
export function buildContextSnapshot(params: ContextSnapshotParams): string {
  const snapshot = contextSnapshot(params)

  const preamble = [
    'You are an AI assistant integrated into Sapientia, a personal knowledge management app.',
    'The user is viewing a specific note. Use the structured context below to answer questions accurately.',
    'You can also use MCP tools to search, read, create, or edit notes in the vault.',
    'For Paper notes, use paper MCP tools such as search_papers, read_paper_metadata, search_paper_blocks, read_paper_blocks, and get_block_citation for citation-safe paper context. Paper-grounded claims should cite exact evidence as @block[paper_id#block_id]; call search_paper_blocks/read_paper_blocks first if exact block evidence is not already in context.',
    'If selectedContext is present, the user explicitly included that selected text or image; treat it as the most local context for the next answer.',
    'If the body field is empty or truncated, use get_note to read the full note from disk before content-sensitive edits or summaries.',
    'When you mention or reference a note by name, always use [[Note Title]] wikilink syntax so the user can click to open it.',
  ].join('\n')

  return `${preamble}\n\n## Context Snapshot\n\`\`\`json\n${JSON.stringify(snapshot, null, 2)}\n\`\`\``
}

export function formatPromptWithReferences(text: string, references?: NoteReference[]): string {
  const referencedNotes = referencedNotesSnapshot(references)
  if (!referencedNotes.length) return text

  return [
    text,
    '',
    '## Referenced Notes',
    'The user explicitly referenced these notes in the prompt. Use their bodies as first-class context.',
    '```json',
    JSON.stringify(referencedNotes, null, 2),
    '```',
  ].join('\n')
}

/** Legacy: Build a contextual system prompt (text-based). */
export function buildContextualPrompt(
  active: VaultEntry,
  linkedEntries: VaultEntry[],
): string {
  const parts: string[] = [
    'You are an AI assistant integrated into Sapientia, a personal knowledge management app.',
    'The user is viewing a specific note. Use the note and its linked context to answer questions accurately.',
    'You can also use MCP tools to search, read, create, or edit notes in the vault.',
    '',
    `## Active Note: ${active.title}`,
    `Type: ${active.isA ?? 'Note'} | Path: ${active.path}`,
  ]

  if (linkedEntries.length > 0) {
    parts.push('', '## Linked Notes')
    for (const entry of linkedEntries) {
      parts.push(
        '',
        `### ${entry.title} (${entry.isA ?? 'Note'})`,
      )
    }
  }

  return parts.join('\n')
}
