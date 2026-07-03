import type { VaultEntry } from '../types'
import { parseFrontmatter } from '../utils/frontmatter'

export type PaperParseStatus = 'unparsed' | 'parsed' | 'error'

export interface PaperMetadata {
  type: 'Paper'
  paperId: string
  title: string
  sourcePdf: string
  blocks: string
  annotations: string
  status: string | null
  parseStatus: PaperParseStatus | string | null
  parseError: string | null
  year: number | null
  authors: string[]
  venue: string | null
  venueShort: string | null
  venueType: string | null
  publicationDate: string | null
  publicationStage: string | null
  doi: string | null
  arxivId: string | null
  metadataStatus: string | null
  metadataConfidence: number | null
}

export interface PaperBundle {
  metadata: PaperMetadata
  entry: VaultEntry
}

export interface ImportPaperPdfResult {
  paperId: string
  title: string
  paperPath: string
  sourcePdfPath: string
  blocksPath: string
  annotationsPath: string
  createdFiles: string[]
  deduplicated: boolean
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return typeof value === 'string' && value.trim().length > 0 ? [value] : []
}

export function parsePaperMetadata(content: string | null): PaperMetadata | null {
  const frontmatter = parseFrontmatter(content)
  if (frontmatter.type !== 'Paper') return null

  const paperId = stringValue(frontmatter.paper_id)
  const sourcePdf = stringValue(frontmatter.source_pdf)
  if (!paperId || !sourcePdf) return null

  return {
    type: 'Paper',
    paperId,
    title: stringValue(frontmatter.title) ?? paperId,
    sourcePdf,
    blocks: stringValue(frontmatter.blocks) ?? 'blocks.jsonl',
    annotations: stringValue(frontmatter.annotations) ?? 'annotations.jsonl',
    status: stringValue(frontmatter.status),
    parseStatus: stringValue(frontmatter.parse_status),
    parseError: stringValue(frontmatter.parse_error),
    year: numberValue(frontmatter.year),
    authors: stringArrayValue(frontmatter.authors),
    venue: stringValue(frontmatter.venue),
    venueShort: stringValue(frontmatter.venue_short),
    venueType: stringValue(frontmatter.venue_type),
    publicationDate: stringValue(frontmatter.publication_date),
    publicationStage: stringValue(frontmatter.publication_stage),
    doi: stringValue(frontmatter.doi),
    arxivId: stringValue(frontmatter.arxiv_id),
    metadataStatus: stringValue(frontmatter.metadata_status),
    metadataConfidence: numberValue(frontmatter.metadata_confidence),
  }
}

export function isPaperEntry(entry: Pick<VaultEntry, 'isA'>): boolean {
  return entry.isA === 'Paper'
}
