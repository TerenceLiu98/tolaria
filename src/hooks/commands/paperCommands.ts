import type { CommandAction } from './types'
import type { VaultEntry } from '../../types'

interface PaperCommandsConfig {
  activeEntry?: VaultEntry
  onImportPaperPdf?: () => void
  onOpenPaperMarginalia?: () => void
  onParsePaper?: () => void
}

function isPaperEntry(entry: VaultEntry | undefined): boolean {
  return entry?.isA === 'Paper'
}

export function buildPaperCommands(config: PaperCommandsConfig): CommandAction[] {
  const canOpenMarginalia = isPaperEntry(config.activeEntry) && !!config.onOpenPaperMarginalia
  const canParsePaper = isPaperEntry(config.activeEntry) && !!config.onParsePaper
  return [
    {
      id: 'import-paper-pdf',
      label: 'Import Paper PDF',
      group: 'Note',
      keywords: ['paper', 'pdf', 'research', 'import'],
      enabled: !!config.onImportPaperPdf,
      execute: () => config.onImportPaperPdf?.(),
    },
    {
      id: 'parse-current-paper',
      label: 'Parse Current Paper',
      group: 'Note',
      keywords: ['paper', 'pdf', 'parse', 'blocks', 'mineru'],
      enabled: canParsePaper,
      execute: () => {
        if (canParsePaper) config.onParsePaper?.()
      },
    },
    {
      id: 'open-paper-marginalia',
      label: 'Create/Open Marginalia Note',
      group: 'Note',
      keywords: ['paper', 'marginalia', 'research note', 'notes'],
      enabled: canOpenMarginalia,
      execute: () => {
        if (canOpenMarginalia) config.onOpenPaperMarginalia?.()
      },
    },
  ]
}
