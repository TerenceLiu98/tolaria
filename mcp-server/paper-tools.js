import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { findMarkdownFiles } from './vault.js'

const PAPER_NOTE_RE = /(^|[/\\])papers[/\\]([^/\\]+)[/\\]paper\.md$/u
const MAX_SEARCH_RESULTS = 20
const DEFAULT_SEARCH_RESULTS = 10
const MAX_READ_BLOCKS = 25
const DEFAULT_READ_BLOCKS = 10

export async function listPaperCatalog(vaultPath) {
  const files = await findMarkdownFiles(vaultPath)
  const entries = []

  for (const filePath of files) {
    const relativePath = path.relative(vaultPath, filePath)
    const entry = await readPaperEntry(vaultPath, relativePath)
    if (entry) entries.push(entry)
  }

  return entries.sort((left, right) => paperSortKey(left).localeCompare(paperSortKey(right)))
}

export async function searchPaperCatalog(vaultPath, args = {}) {
  const query = stringArg(args.query).toLowerCase()
  const limit = limitArg(args.limit, DEFAULT_SEARCH_RESULTS, MAX_SEARCH_RESULTS)
  const entries = await listPaperCatalog(vaultPath)
  const filtered = filterPaperEntries(entries, args.filters ?? {}, query)
  return filtered.slice(0, limit).map(compactPaperEntry)
}

export async function readPaperMetadata(vaultPath, args = {}) {
  const paper = await findPaperById(vaultPath, requiredStringArg(args.paperId, 'paperId'))
  return {
    ...paperProvenance(paper),
    metadata: paper.metadata,
    frontmatter: compactPaperFrontmatter(paper.frontmatter),
  }
}

export async function readPaperOutline(vaultPath, args = {}) {
  const paper = await findPaperById(vaultPath, requiredStringArg(args.paperId, 'paperId'))
  const blocks = await readPaperBlocksForEntry(vaultPath, paper)
  return {
    ...paperProvenance(paper),
    outline: blocks
      .filter(block => ['title', 'heading'].includes(String(block.kind ?? '').toLowerCase()))
      .map(block => blockProvenance(paper, block)),
  }
}

export async function searchPaperBlocks(vaultPath, args = {}) {
  const query = requiredStringArg(args.query, 'query').toLowerCase()
  const limit = limitArg(args.limit, DEFAULT_SEARCH_RESULTS, MAX_SEARCH_RESULTS)
  const papers = args.paperId
    ? [await findPaperById(vaultPath, requiredStringArg(args.paperId, 'paperId'))]
    : await listPaperCatalog(vaultPath)
  const results = []

  for (const paper of papers) {
    const blocks = await readPaperBlocksForEntry(vaultPath, paper)
    for (const block of blocks) {
      const haystack = blockSearchText(block).toLowerCase()
      if (!haystack.includes(query)) continue
      results.push({
        ...blockProvenance(paper, block),
        snippet: blockSnippet(block, query),
      })
      if (results.length >= limit) return { query, results, truncated: true }
    }
  }

  return { query, results, truncated: false }
}

export async function readPaperBlocks(vaultPath, args = {}) {
  const paper = await findPaperById(vaultPath, requiredStringArg(args.paperId, 'paperId'))
  const blocks = await readPaperBlocksForEntry(vaultPath, paper)
  const selected = selectBlocks(blocks, args)
  const truncated = selected.length > MAX_READ_BLOCKS
  const returnedBlocks = selected.slice(0, MAX_READ_BLOCKS)

  return {
    ...paperProvenance(paper),
    blocks: returnedBlocks.map(block => ({
      ...blockProvenance(paper, block),
      kind: block.kind,
      text: block.text ?? null,
      caption: block.caption ?? null,
      section: block.section ?? null,
    })),
    truncated: truncated
      ? { returned: returnedBlocks.length, requested: selected.length, max: MAX_READ_BLOCKS }
      : null,
  }
}

export async function getPaperCitation(vaultPath, args = {}) {
  const paper = await findPaperById(vaultPath, requiredStringArg(args.paperId, 'paperId'))
  return {
    ...paperProvenance(paper),
    citation: bibliographicCitation(paper),
    wikilink: `[[${paper.title}]]`,
  }
}

export async function getBlockCitation(vaultPath, args = {}) {
  const paper = await findPaperById(vaultPath, requiredStringArg(args.paperId, 'paperId'))
  const blockId = requiredStringArg(args.blockId, 'blockId')
  const block = (await readPaperBlocksForEntry(vaultPath, paper)).find(candidate => candidate.id === blockId)
  if (!block) throw new Error(`Paper block not found: ${paper.paperId}#${blockId}`)

  return blockProvenance(paper, block)
}

async function readPaperEntry(vaultPath, relativePath) {
  const absolutePath = path.join(vaultPath, relativePath)
  const raw = await readFile(absolutePath, 'utf-8')
  const parsed = matter(raw)
  if (parsed.data.type !== 'Paper') return null

  const canonicalMatch = relativePath.match(PAPER_NOTE_RE)
  const slug = canonicalMatch?.[2] ?? path.basename(relativePath, path.extname(relativePath))
  const paperId = stringValue(parsed.data.paper_id) ?? slug
  const paperDir = path.dirname(relativePath)
  const metadata = await readOptionalJson(path.join(vaultPath, paperDir, 'metadata.json'))
  const title = firstString(metadata?.title, parsed.data.title, parsed.data.display_name, extractTitle(parsed.content), paperId)

  return {
    paperId,
    path: relativePath,
    paperPath: relativePath,
    paperDir,
    vaultPath,
    vaultLabel: vaultLabel(vaultPath),
    title,
    authors: stringArray(firstDefined(metadata?.authors, parsed.data.authors)),
    year: numberValue(firstDefined(metadata?.year, parsed.data.year)),
    venue: stringValue(firstDefined(metadata?.venue, parsed.data.venue)),
    venueType: stringValue(firstDefined(metadata?.venueType, metadata?.venue_type, parsed.data.venue_type)),
    doi: stringValue(firstDefined(metadata?.doi, parsed.data.doi)),
    arxivId: stringValue(firstDefined(metadata?.arxivId, metadata?.arxiv_id, parsed.data.arxiv_id)),
    openalexId: stringValue(firstDefined(metadata?.openalexId, metadata?.openalex_id, parsed.data.openalex_id, metadata?.ids?.openalex)),
    semanticScholarId: stringValue(firstDefined(metadata?.semanticScholarId, metadata?.semantic_scholar_id, parsed.data.semantic_scholar_id)),
    parseStatus: stringValue(parsed.data.parse_status),
    metadataStatus: stringValue(firstDefined(metadata?.status, parsed.data.metadata_status)),
    metadataConfidence: numberValue(firstDefined(metadata?.confidence, parsed.data.metadata_confidence)),
    sourcePdfState: await fileExists(path.join(vaultPath, paperDir, 'source.pdf')) ? 'present' : 'missing',
    metadata,
    frontmatter: parsed.data,
    isCanonicalBundle: Boolean(canonicalMatch),
  }
}

async function findPaperById(vaultPath, paperId) {
  const papers = await listPaperCatalog(vaultPath)
  const matches = papers.filter(paper => paper.paperId === paperId || paper.path === paperId || paper.title === paperId)
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) throw new Error(`Paper identifier is ambiguous in vault ${vaultPath}: ${paperId}`)
  throw new Error(`Paper not found: ${paperId}`)
}

async function readPaperBlocksForEntry(vaultPath, paper) {
  const blocksPath = path.join(vaultPath, paper.paperDir, 'blocks.jsonl')
  const content = await readFile(blocksPath, 'utf-8').catch((error) => {
    if (error?.code === 'ENOENT') throw new Error(`Paper blocks are missing for ${paper.paperId}`)
    throw error
  })
  return parseBlocksJsonl(content, paper.paperId)
}

function parseBlocksJsonl(content, paperId) {
  const blocks = []
  const errors = []
  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const block = JSON.parse(trimmed)
      const missing = ['id', 'kind', 'hash'].find(field => !stringValue(block[field]))
      if (missing) {
        errors.push(`line ${index + 1}: invalid SourceBlock`)
        continue
      }
      blocks.push({ paper_id: paperId, ...block, page: normalizedPage(block.page) })
    } catch (error) {
      errors.push(`line ${index + 1}: ${error.message}`)
    }
  }
  if (errors.length) throw new Error(`blocks.jsonl contains malformed SourceBlock lines: ${errors.join('; ')}`)
  return blocks
}

function selectBlocks(blocks, args = {}) {
  if (Array.isArray(args.blockIds) && args.blockIds.length > 0) {
    const requestedIds = new Set(args.blockIds.map(String))
    return blocks.filter(block => requestedIds.has(block.id))
  }

  const range = typeof args.range === 'object' && args.range !== null ? args.range : null
  if (range) {
    const start = Math.max(0, Number(range.start ?? 0))
    const count = Math.max(1, Number(range.count ?? DEFAULT_READ_BLOCKS))
    return blocks.slice(start, start + count)
  }

  return blocks.slice(0, DEFAULT_READ_BLOCKS)
}

function filterPaperEntries(entries, filters, query) {
  return entries.filter((entry) => {
    if (query && !paperSearchText(entry).includes(query)) return false
    if (filters.venueType && entry.venueType !== filters.venueType) return false
    if (filters.metadataStatus && entry.metadataStatus !== filters.metadataStatus) return false
    if (filters.parseStatus && entry.parseStatus !== filters.parseStatus) return false
    if (filters.year && entry.year !== Number(filters.year)) return false
    if (filters.author && !entry.authors.some(author => author.toLowerCase().includes(String(filters.author).toLowerCase()))) return false
    return true
  })
}

function compactPaperEntry(entry) {
  const {
    metadata,
    frontmatter,
    ...compact
  } = entry
  return {
    ...compact,
    wikilink: `[[${entry.title}]]`,
  }
}

function compactPaperFrontmatter(frontmatter) {
  return {
    title: frontmatter.title ?? null,
    authors: frontmatter.authors ?? null,
    year: frontmatter.year ?? null,
    venue: frontmatter.venue ?? null,
    venue_type: frontmatter.venue_type ?? null,
    doi: frontmatter.doi ?? null,
    arxiv_id: frontmatter.arxiv_id ?? null,
    metadata_status: frontmatter.metadata_status ?? null,
    metadata_confidence: frontmatter.metadata_confidence ?? null,
    parse_status: frontmatter.parse_status ?? null,
  }
}

function paperProvenance(paper) {
  return {
    paperId: paper.paperId,
    title: paper.title,
    path: paper.path,
    vaultPath: paper.vaultPath,
    vaultLabel: paper.vaultLabel,
    wikilink: `[[${paper.title}]]`,
  }
}

function blockProvenance(paper, block) {
  return {
    ...paperProvenance(paper),
    blockId: block.id,
    page: Number.isInteger(block.page) ? block.page : null,
    blockCitation: `@block[${paper.paperId}#${block.id}]`,
    text: oneLine(block.text ?? block.caption ?? ''),
  }
}

function bibliographicCitation(paper) {
  const authorPart = paper.authors.length > 0 ? paper.authors.join(', ') : paper.title
  const yearPart = paper.year ? ` (${paper.year})` : ''
  const venuePart = paper.venue ? `. ${paper.venue}` : ''
  return `${authorPart}${yearPart}. ${paper.title}${venuePart}.`
}

function paperSearchText(entry) {
  return [
    entry.title,
    ...entry.authors,
    entry.year,
    entry.venue,
    entry.venueType,
    entry.doi,
    entry.arxivId,
    entry.openalexId,
    entry.semanticScholarId,
  ].filter(Boolean).join(' ').toLowerCase()
}

function blockSearchText(block) {
  return [block.text, block.caption, block.section].filter(Boolean).join('\n')
}

function blockSnippet(block, query) {
  const text = oneLine(blockSearchText(block))
  const index = text.toLowerCase().indexOf(query)
  if (index === -1) return text.slice(0, 240)
  const start = Math.max(0, index - 80)
  const end = Math.min(text.length, index + query.length + 160)
  return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`
}

function oneLine(value) {
  return String(value).replace(/\s+/gu, ' ').trim().slice(0, 600)
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'))
  } catch {
    return null
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function requiredStringArg(value, name) {
  const result = stringValue(value)
  if (!result) throw new Error(`${name} is required`)
  return result
}

function stringArg(value) {
  return stringValue(value) ?? ''
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function firstString(...values) {
  for (const value of values) {
    const string = stringValue(value)
    if (string) return string
  }
  return 'Untitled Paper'
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null)
}

function numberValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizedPage(value) {
  if (Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return null
}

function stringArray(value) {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean)
  const scalar = stringValue(value)
  return scalar ? scalar.split(/;|\n|\sand\s/iu).map(item => item.trim()).filter(Boolean) : []
}

function limitArg(value, fallback, max) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), max) : fallback
}

function extractTitle(content) {
  return content.match(/^#\s+(.+)$/mu)?.[1]?.trim() ?? null
}

function paperSortKey(entry) {
  return `${entry.isCanonicalBundle ? '0' : '1'}:${entry.year ?? '9999'}:${entry.title}`.toLowerCase()
}

function vaultLabel(vaultPath) {
  return path.basename(vaultPath) || vaultPath
}
