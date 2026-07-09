import { useEffect } from 'react'
import type { NoteSurfaceCommentAnchor } from '../components/NoteSurface'
import type { NoteComment } from '../comments/commentProvider'
import type { AiSelectedTextContext } from '../utils/ai-context'
import type { VaultEntry } from '../types'
import { formatBlockCitation } from './blockCitations'
import {
  BLOCK_CITATION_NAVIGATE_EVENT,
  clearPendingBlockFocus,
  getPendingBlockFocus,
  type BlockCitationNavigationEvent,
} from './blockCitationNavigation'
import { sourceBlockPrimaryText } from './paperReaderBlocks'
import type { SourceBlock } from './sourceBlocks'

export interface PaperPdfBlockFocusRequest {
  blockId: string
  page: number
}

function cssAttributeValue(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/gu, '\\$&')
}

function queryBlockTarget(container: Element | null | undefined, selector: string): HTMLElement | null {
  const target = container?.querySelector(selector)
  return target instanceof HTMLElement ? target : null
}

export function sourceBlocksById(blocks: readonly SourceBlock[]): Map<string, SourceBlock> {
  return new Map(blocks.map((block) => [block.id, block]))
}

export function paperCommentAnchors(
  blocks: readonly SourceBlock[],
  commentsByAnchorId: Record<string, NoteComment[]>,
): NoteSurfaceCommentAnchor[] {
  return blocks.map((block) => ({
    comments: commentsByAnchorId[block.id] ?? [],
    id: block.id,
    title: sourceBlockPrimaryText(block),
  }))
}

export function selectedQuoteForPaperBlock(
  selectedTextContext: AiSelectedTextContext | null,
  sourceEntry: VaultEntry,
): string | null {
  if (selectedTextContext?.kind !== 'text') return null
  if (selectedTextContext.entryPath !== sourceEntry.path) return null
  const selectedQuote = selectedTextContext.text.trim()
  return selectedQuote.length > 0 ? selectedQuote : null
}

function normalizedQuoteText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().toLowerCase()
}

export function sourceBlockForSelectedQuote(
  blocks: readonly SourceBlock[],
  quote: string | null | undefined,
): SourceBlock | null {
  const normalizedQuote = normalizedQuoteText(quote ?? '')
  if (normalizedQuote.length === 0) return null

  return blocks.find((block) => {
    const sourceText = normalizedQuoteText([
      typeof block.text === 'string' ? block.text : '',
      typeof block.caption === 'string' ? block.caption : '',
      typeof block.section === 'string' ? block.section : '',
    ].filter(Boolean).join(' '))
    return sourceText.includes(normalizedQuote)
  }) ?? null
}

export function paperBlockPdfFocusRequest(block: SourceBlock | null | undefined): PaperPdfBlockFocusRequest | null {
  if (!block || !Number.isInteger(block.page) || block.page <= 0) return null
  return { blockId: block.id, page: block.page }
}

export function paperBlockCitation(block: SourceBlock): string {
  return formatBlockCitation({ paperId: block.paper_id, blockId: block.id })
}

export function scrollPaperMarkdownBlockIntoView({
  blockId,
  container,
  focusBlock,
}: {
  blockId: string
  container: HTMLElement | null
  focusBlock?: (blockId: string) => void
}) {
  const sourceBlockTarget = queryBlockTarget(
    container,
    `[data-paper-source-block-id="${cssAttributeValue(blockId)}"]`,
  )

  focusBlock?.(blockId)
  sourceBlockTarget?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
}

export function useBlockCitationFocus(paperId: string | null, onFocusBlock: (blockId: string) => void): void {
  useEffect(() => {
    if (!paperId) return

    const pending = getPendingBlockFocus()
    if (pending?.paperId === paperId) {
      onFocusBlock(pending.blockId)
      clearPendingBlockFocus()
    }

    const handleNavigation = (event: Event) => {
      const { detail } = event as BlockCitationNavigationEvent
      if (detail.paperId === paperId) onFocusBlock(detail.blockId)
    }

    window.addEventListener(BLOCK_CITATION_NAVIGATE_EVENT, handleNavigation)
    return () => window.removeEventListener(BLOCK_CITATION_NAVIGATE_EVENT, handleNavigation)
  }, [onFocusBlock, paperId])
}
