import { useEffect } from 'react'
import type { VaultEntry } from '../types'
import {
  BLOCK_CITATION_NAVIGATE_EVENT,
  findPaperEntryForBlockCitation,
  setPendingBlockFocus,
  type BlockCitationNavigationEvent,
} from './blockCitationNavigation'

interface UseBlockCitationNavigationConfig {
  entries: readonly VaultEntry[]
  onSelectPaper: (entry: VaultEntry) => void | Promise<void>
  onSelectPaperSection?: () => void
}

export function useBlockCitationNavigation({
  entries,
  onSelectPaper,
  onSelectPaperSection,
}: UseBlockCitationNavigationConfig): void {
  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const request = (event as BlockCitationNavigationEvent).detail
      setPendingBlockFocus(request)
      const paperEntry = findPaperEntryForBlockCitation(entries, request.paperId)
      if (!paperEntry) return

      onSelectPaperSection?.()
      void onSelectPaper(paperEntry)
    }

    window.addEventListener(BLOCK_CITATION_NAVIGATE_EVENT, handleNavigate)
    return () => window.removeEventListener(BLOCK_CITATION_NAVIGATE_EVENT, handleNavigate)
  }, [entries, onSelectPaper, onSelectPaperSection])
}
