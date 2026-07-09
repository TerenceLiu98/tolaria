import { useMemo } from 'react'
import type { VaultEntry } from '../types'
import {
  buildContextSnapshot,
  collectLinkedEntries,
  paperAiContextSummary,
  type AiSelectedTextContext,
  type NoteListItem,
} from '../utils/ai-context'
import { extractInlineWikilinkReferences } from './inlineWikilinkText'
import { useProjectCanvasAiContext } from '../hooks/useProjectCanvasAiContext'

interface UseAiPanelContextSnapshotArgs {
  activeEntry?: VaultEntry | null
  activeNoteContent?: string | null
  entries?: VaultEntry[]
  input: string
  openTabs?: VaultEntry[]
  noteList?: NoteListItem[]
  noteListFilter?: { type: string | null; query: string }
  selectedContext?: AiSelectedTextContext | null
  vaultPath: string
}

export function useAiPanelContextSnapshot({
  activeEntry,
  activeNoteContent,
  entries,
  input,
  openTabs,
  noteList,
  noteListFilter,
  selectedContext,
  vaultPath,
}: UseAiPanelContextSnapshotArgs) {
  const projectContext = useProjectCanvasAiContext({
    activeEntry,
    entries: entries ?? [],
    vaultPath,
  })
  const linkedEntries = useMemo(() => {
    if (!activeEntry || !entries) return []
    return collectLinkedEntries(activeEntry, entries)
  }, [activeEntry, entries])

  const draftReferences = useMemo(
    () => extractInlineWikilinkReferences(input, entries ?? []),
    [entries, input],
  )

  const contextPrompt = useMemo(() => {
    if (!activeEntry || !entries) return undefined
    return buildContextSnapshot({
      activeEntry,
      activeNoteContent: activeNoteContent ?? undefined,
      openTabs,
      noteList,
      noteListFilter,
      entries,
      references: draftReferences.length > 0 ? draftReferences : undefined,
      selectedContext,
      projectContext,
    })
  }, [activeEntry, activeNoteContent, draftReferences, entries, noteList, noteListFilter, openTabs, projectContext, selectedContext])

  const paperContext = useMemo(() => {
    if (!activeEntry || !entries) return null
    return paperAiContextSummary({
      activeEntry,
      activeNoteContent: activeNoteContent ?? undefined,
      entries,
    })
  }, [activeEntry, activeNoteContent, entries])

  return { linkedEntries, contextPrompt, paperContext, projectContext }
}
