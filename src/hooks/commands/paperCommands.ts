import type { CommandAction } from './types'

interface PaperCommandsConfig {
  onImportPaperPdf?: () => void
}

export function buildPaperCommands(config: PaperCommandsConfig): CommandAction[] {
  return [
    {
      id: 'import-paper-pdf',
      label: 'Import Paper PDF',
      group: 'Note',
      keywords: ['paper', 'pdf', 'research', 'import'],
      enabled: !!config.onImportPaperPdf,
      execute: () => config.onImportPaperPdf?.(),
    },
  ]
}
