import { useEffect } from 'react'
import type { VaultEntry } from '../types'
import {
  BLOCK_CITATION_NAVIGATE_EVENT,
  findPaperEntryForBlockCitation,
  setPendingBlockFocus,
  type BlockCitationNavigationRequest,
  type BlockCitationNavigationEvent,
} from './blockCitationNavigation'

interface UseBlockCitationNavigationConfig {
  entries: readonly VaultEntry[]
  onNavigateResolvedPaper?: (entry: VaultEntry, request: BlockCitationNavigationRequest) => boolean
  onSelectPaper: (entry: VaultEntry) => void | Promise<void>
  onSelectPaperSection?: () => void
}

export function useBlockCitationNavigation({
  entries,
  onNavigateResolvedPaper,
  onSelectPaper,
  onSelectPaperSection,
}: UseBlockCitationNavigationConfig): void {
  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const request = (event as BlockCitationNavigationEvent).detail
      setPendingBlockFocus(request)
      const paperEntry = findPaperEntryForBlockCitation(entries, request.paperId)
      if (!paperEntry) return
      if (onNavigateResolvedPaper?.(paperEntry, request)) return

      onSelectPaperSection?.()
      void onSelectPaper(paperEntry)
    }

    window.addEventListener(BLOCK_CITATION_NAVIGATE_EVENT, handleNavigate)
    return () => window.removeEventListener(BLOCK_CITATION_NAVIGATE_EVENT, handleNavigate)
  }, [entries, onNavigateResolvedPaper, onSelectPaper, onSelectPaperSection])
}
