import type { VaultEntry } from './types'

export interface ProjectCanvasDraftNoteInput {
  content: string
  title: string
  vaultPath: string
}

export type CreateProjectCanvasDraftNote = (
  input: ProjectCanvasDraftNoteInput,
) => Promise<VaultEntry | null>
