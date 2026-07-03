import { blockDisplayText } from './paperReaderModel'
import type { SourceBlock } from './sourceBlocks'

export type RenderedSourceBlockKind =
  | 'caption'
  | 'equation'
  | 'figure'
  | 'heading'
  | 'paragraph'
  | 'table'
  | 'title'

export interface PaperOutlineItem {
  blockId: string
  depth: number
  id: string
  label: string
  page: number | null
  section: string | null
  source: 'blocks' | 'pdf'
}

export interface PaperPdfOutlineItem {
  depth: number
  id: string
  page: number | null
  title: string
}

export interface PaperSidecarHealth {
  hasMissingPageNumbers: boolean
  hasMinimallyNormalizedBlocks: boolean
  isZeroUsableBlocks: boolean
}

export function renderedSourceBlockKind(block: SourceBlock): RenderedSourceBlockKind {
  const kind = block.kind.trim().toLowerCase()
  if (kind === 'title') return 'title'
  if (kind === 'heading' || kind === 'header') return 'heading'
  if (kind === 'figure' || kind === 'image') return 'figure'
  if (kind === 'table') return 'table'
  if (kind === 'equation' || kind === 'formula' || kind === 'interline_equation' || kind === 'inline_equation') {
    return 'equation'
  }
  if (kind === 'caption' || kind === 'image_caption' || kind === 'table_caption') return 'caption'
  return 'paragraph'
}

export function sourceBlockPrimaryText(block: SourceBlock): string {
  return blockDisplayText(block)
}

export function sourceBlockCaptionText(block: SourceBlock): string | null {
  return typeof block.caption === 'string' && block.caption.trim().length > 0
    ? block.caption.trim()
    : null
}

export function sourceBlockPageLabel(block: SourceBlock): string | null {
  return Number.isInteger(block.page) && block.page > 0 ? `p.${block.page}` : null
}

export function sourceBlockSectionLabel(block: SourceBlock): string | null {
  return typeof block.section === 'string' && block.section.trim().length > 0
    ? block.section.trim()
    : null
}

function outlineLabel(block: SourceBlock): string {
  return sourceBlockPrimaryText(block).replace(/\s+/gu, ' ').trim()
}

export function paperOutlineItems(blocks: readonly SourceBlock[]): PaperOutlineItem[] {
  const items: PaperOutlineItem[] = []

  for (const block of blocks) {
    const kind = renderedSourceBlockKind(block)
    if (kind !== 'heading') continue

    items.push({
      blockId: block.id,
      depth: 1,
      id: block.id,
      label: outlineLabel(block),
      page: Number.isInteger(block.page) && block.page > 0 ? block.page : null,
      section: sourceBlockSectionLabel(block),
      source: 'blocks',
    })
  }

  return items
}

export function paperOutlineItemsFromPdf(
  pdfOutline: readonly PaperPdfOutlineItem[],
  blocks: readonly SourceBlock[],
): PaperOutlineItem[] {
  const items: PaperOutlineItem[] = []

  for (const item of pdfOutline) {
    const title = item.title.replace(/\s+/gu, ' ').trim()
    if (title.length === 0) continue
    const block = blockForOutlinePage(blocks, item.page)
    items.push({
      blockId: block?.id ?? '',
      depth: Math.max(1, item.depth),
      id: item.id,
      label: title,
      page: item.page,
      section: null,
      source: 'pdf',
    })
  }

  return items
}

function blockForOutlinePage(blocks: readonly SourceBlock[], page: number | null): SourceBlock | null {
  if (!Number.isInteger(page) || page === null || page <= 0) return null
  return blocks.find((block) => Number.isInteger(block.page) && block.page >= page) ?? null
}

export function searchPaperBlocks(blocks: readonly SourceBlock[], query: string): SourceBlock[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []

  return blocks.filter((block) => [
    block.text,
    block.caption,
    block.section,
    block.kind,
    block.id,
  ].some((value) => typeof value === 'string' && value.toLowerCase().includes(normalizedQuery)))
}

export function paperSidecarHealth(blocks: readonly SourceBlock[], state: 'empty' | 'missing' | 'ready' | null): PaperSidecarHealth {
  return {
    hasMissingPageNumbers: blocks.some((block) => !Number.isInteger(block.page) || block.page <= 0),
    hasMinimallyNormalizedBlocks: blocks.some((block) => !block.text && !block.caption),
    isZeroUsableBlocks: state === 'ready' && blocks.length === 0,
  }
}
