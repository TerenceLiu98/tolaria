import type { VaultEntry, VaultPropertyValue } from '../types'
import { trackEvent } from '../lib/telemetry'
import { isPaperEntry } from './types'

export const BLOCK_CITATION_NAVIGATE_EVENT = 'tolaria:block-citation-navigate'

export interface BlockCitationNavigationRequest {
  paperId: string
  blockId: string
  label?: string | null
}

export type BlockCitationNavigationEvent = CustomEvent<BlockCitationNavigationRequest>

let pendingBlockFocus: BlockCitationNavigationRequest | null = null

function stringProperty(value: VaultPropertyValue | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function normalizedPath(path: string): string {
  return path.replace(/\\/g, '/')
}

export function setPendingBlockFocus(request: BlockCitationNavigationRequest): void {
  pendingBlockFocus = { ...request }
}

export function getPendingBlockFocus(): BlockCitationNavigationRequest | null {
  return pendingBlockFocus ? { ...pendingBlockFocus } : null
}

export function clearPendingBlockFocus(): void {
  pendingBlockFocus = null
}

export function dispatchBlockCitationNavigation(request: BlockCitationNavigationRequest): void {
  setPendingBlockFocus(request)
  trackEvent('block_citation_opened', {
    has_label: request.label ? 1 : 0,
  })
  window.dispatchEvent(new CustomEvent(BLOCK_CITATION_NAVIGATE_EVENT, {
    detail: request,
  }))
}

export function paperIdForEntry(entry: VaultEntry): string | null {
  return stringProperty(entry.properties.paper_id)
}

export function findPaperEntryForBlockCitation(
  entries: readonly VaultEntry[],
  paperId: string,
): VaultEntry | null {
  const byFrontmatter = entries.find((entry) => isPaperEntry(entry) && paperIdForEntry(entry) === paperId)
  if (byFrontmatter) return byFrontmatter

  const paperPathSuffix = `/papers/${paperId}/paper.md`
  return entries.find((entry) => (
    isPaperEntry(entry)
    && normalizedPath(entry.path).endsWith(paperPathSuffix)
  )) ?? null
}
