import { parseBlockCitations } from './paper/blockCitations'
import { paperIdForEntry } from './paper/blockCitationNavigation'
import type { SourceBlock } from './paper/sourceBlocks'
import type {
  ProjectCanvas,
  ProjectCanvasEdge,
  ProjectCanvasNode,
  ProjectCanvasResolvedRef,
} from './projectCanvas'
import type { VaultEntry, VaultPropertyValue } from './types'

const MAX_NEARBY_NODES = 8
const MAX_PAPERS = 8
const MAX_NOTES = 6
const MAX_NODE_TEXT = 320
const MAX_NOTE_SNIPPET = 400
const MAX_BLOCK_TEXT = 800

export interface ProjectCanvasAiContextSummary {
  citedBlockCount: number
  edgeCount: number
  nodeCount: number
  referencedPaperCount: number
  staleReferenceCount: number
}

export interface ProjectCanvasAiNode {
  id: string
  type: ProjectCanvasNode['type']
  title?: string
  ref?: string
  text?: string
  completed?: boolean
}

export interface ProjectCanvasAiContext {
  project: { id: string; path: string; title: string }
  summary: ProjectCanvasAiContextSummary
  selectedNode: ProjectCanvasAiNode | null
  nearbyNodes: ProjectCanvasAiNode[]
  relationships: Array<{
    id: string
    from: string
    to: string
    kind: ProjectCanvasEdge['kind']
    note?: string
  }>
  papers: Array<{ paperId: string; title: string; authors?: string[]; year?: number; venue?: string }>
  citedBlocks: Array<{
    nodeId: string
    paperId: string
    paperTitle: string
    blockId: string
    page: number | null
    text: string
    blockCitation: string
  }>
  notes: Array<{ nodeId: string; path: string; title: string; snippet: string }>
}

interface BuildProjectCanvasAiContextArgs {
  canvas: ProjectCanvas
  entries: VaultEntry[]
  projectEntry: VaultEntry
  refs: ProjectCanvasResolvedRef[]
  selectedNodeId: string | null
  vaultPath: string
  readBlock: (vaultPath: string, paperId: string, blockId: string) => Promise<SourceBlock | null>
}

function compactText(value: string | undefined, limit: number): string | undefined {
  const text = value?.trim()
  if (!text) return undefined
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`
}

function compactNode(node: ProjectCanvasNode | undefined): ProjectCanvasAiNode | null {
  if (!node) return null
  return {
    id: node.id,
    type: node.type,
    title: compactText(node.title, 160),
    ref: node.ref,
    text: compactText(node.text, MAX_NODE_TEXT),
    completed: node.type === 'task' ? Boolean(node.completed) : undefined,
  }
}

function scalarString(value: VaultPropertyValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function scalarNumber(value: VaultPropertyValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringList(value: VaultPropertyValue | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
  return strings.length > 0 ? strings : undefined
}

function normalizedPath(value: string): string {
  return value.replace(/\\/gu, '/').replace(/^\.\//u, '')
}

function entryByPath(entries: VaultEntry[], targetPath: string | undefined): VaultEntry | undefined {
  if (!targetPath) return undefined
  const target = normalizedPath(targetPath)
  return entries.find(entry => {
    const candidate = normalizedPath(entry.path)
    return candidate === target || candidate.endsWith(`/${target}`) || target.endsWith(`/${candidate}`)
  })
}

function citationForNode(node: ProjectCanvasNode) {
  if (node.type !== 'paper_block' || !node.ref) return null
  const citation = parseBlockCitations(node.ref).find(item => !item.malformed)
  return citation && !citation.malformed ? citation : null
}

function nearbyNodeIds(canvas: ProjectCanvas, selectedNodeId: string | null): string[] {
  if (!selectedNodeId) return []
  const ids: string[] = []
  for (const edge of canvas.edges) {
    const adjacent = edge.from === selectedNodeId ? edge.to : edge.to === selectedNodeId ? edge.from : null
    if (adjacent && !ids.includes(adjacent)) ids.push(adjacent)
  }
  return ids.slice(0, MAX_NEARBY_NODES)
}

function nearbyRelationships(canvas: ProjectCanvas, selectedNodeId: string | null) {
  if (!selectedNodeId) return []
  return canvas.edges
    .filter(edge => edge.from === selectedNodeId || edge.to === selectedNodeId)
    .slice(0, MAX_NEARBY_NODES)
    .map(edge => {
      const note = compactText(edge.note, MAX_NODE_TEXT)
      return {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
        ...(note ? { note } : {}),
      }
    })
}

function paperEntryById(entries: VaultEntry[], paperId: string): VaultEntry | undefined {
  return entries.find(entry => entry.isA === 'Paper' && paperIdForEntry(entry) === paperId)
}

function paperSummary(entry: VaultEntry) {
  return {
    paperId: paperIdForEntry(entry) ?? entry.path,
    title: entry.title,
    authors: stringList(entry.properties.authors),
    year: scalarNumber(entry.properties.year),
    venue: scalarString(entry.properties.venue),
  }
}

function referencedPaperEntries(
  canvas: ProjectCanvas,
  entries: VaultEntry[],
  refs: ProjectCanvasResolvedRef[],
): VaultEntry[] {
  const refMap = new Map(refs.map(ref => [ref.nodeId, ref]))
  const papers = new Map<string, VaultEntry>()
  for (const node of canvas.nodes) {
    const citation = citationForNode(node)
    const entry = node.type === 'paper'
      ? entryByPath(entries, refMap.get(node.id)?.targetPath ?? node.ref)
      : citation ? paperEntryById(entries, citation.paperId) : undefined
    if (entry) papers.set(paperIdForEntry(entry) ?? entry.path, entry)
  }
  return [...papers.values()].slice(0, MAX_PAPERS)
}

async function citedBlockContext(
  node: ProjectCanvasNode,
  entries: VaultEntry[],
  vaultPath: string,
  readBlock: BuildProjectCanvasAiContextArgs['readBlock'],
) {
  const citation = citationForNode(node)
  if (!citation) return null
  const paper = paperEntryById(entries, citation.paperId)
  const blockVaultPath = paper?.workspace?.path ?? vaultPath
  const block = await readBlock(blockVaultPath, citation.paperId, citation.blockId)
  const text = compactText(block?.text ?? block?.caption, MAX_BLOCK_TEXT)
  if (!block || !text) return null
  return {
    nodeId: node.id,
    paperId: citation.paperId,
    paperTitle: paper?.title ?? citation.paperId,
    blockId: citation.blockId,
    page: Number.isInteger(block.page) && block.page > 0 ? block.page : null,
    text,
    blockCitation: citation.raw,
  }
}

export async function buildProjectCanvasAiContext({
  canvas,
  entries,
  projectEntry,
  refs,
  selectedNodeId,
  vaultPath,
  readBlock,
}: BuildProjectCanvasAiContextArgs): Promise<ProjectCanvasAiContext> {
  const nearbyIds = nearbyNodeIds(canvas, selectedNodeId)
  const relevantIds = new Set([selectedNodeId, ...nearbyIds].filter((id): id is string => Boolean(id)))
  const refMap = new Map(refs.map(ref => [ref.nodeId, ref]))
  const relevantNodes = canvas.nodes.filter(node => relevantIds.has(node.id))
  const citedNodes = relevantNodes.filter(node => node.type === 'paper_block')
  const citedBlocks = (await Promise.all(
    citedNodes.map(node => citedBlockContext(node, entries, vaultPath, readBlock)),
  )).filter((block): block is NonNullable<typeof block> => block !== null)
  const notes = relevantNodes.flatMap(node => {
    if (node.type !== 'note') return []
    const entry = entryByPath(entries, refMap.get(node.id)?.targetPath ?? node.ref)
    const snippet = compactText(entry?.snippet, MAX_NOTE_SNIPPET)
    return entry && snippet ? [{ nodeId: node.id, path: entry.path, title: entry.title, snippet }] : []
  }).slice(0, MAX_NOTES)
  const papers = referencedPaperEntries(canvas, entries, refs)

  return {
    project: {
      id: scalarString(projectEntry.properties.project_id) ?? projectEntry.path,
      path: projectEntry.path,
      title: projectEntry.title,
    },
    summary: {
      citedBlockCount: canvas.nodes.filter(node => node.type === 'paper_block').length,
      edgeCount: canvas.edges.length,
      nodeCount: canvas.nodes.length,
      referencedPaperCount: papers.length,
      staleReferenceCount: refs.filter(ref => ref.state === 'stale').length,
    },
    selectedNode: compactNode(canvas.nodes.find(node => node.id === selectedNodeId)),
    nearbyNodes: nearbyIds.flatMap(id => {
      const node = compactNode(canvas.nodes.find(candidate => candidate.id === id))
      return node ? [node] : []
    }),
    relationships: nearbyRelationships(canvas, selectedNodeId),
    papers: papers.map(paperSummary),
    citedBlocks,
    notes,
  }
}
