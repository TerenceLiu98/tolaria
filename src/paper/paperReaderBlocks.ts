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
  label: string
  page: number | null
  section: string | null
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
  const pageAnchors = new Set<number>()

  for (const block of blocks) {
    const kind = renderedSourceBlockKind(block)
    const page = Number.isInteger(block.page) && block.page > 0 ? block.page : null
    const isPageAnchor = page !== null && !pageAnchors.has(page)
    const isStructuralBlock = kind === 'title' || kind === 'heading'
    if (!isStructuralBlock && !isPageAnchor) continue

    if (page !== null) pageAnchors.add(page)
    const label = isStructuralBlock ? outlineLabel(block) : `Page ${page}`
    items.push({
      blockId: block.id,
      depth: kind === 'title' ? 0 : isStructuralBlock ? 1 : 2,
      label,
      page,
      section: sourceBlockSectionLabel(block),
    })
  }

  return items
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
