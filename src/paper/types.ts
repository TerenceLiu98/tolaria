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
  year: number | null
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
    year: numberValue(frontmatter.year),
  }
}

export function isPaperEntry(entry: Pick<VaultEntry, 'isA'>): boolean {
  return entry.isA === 'Paper'
}
