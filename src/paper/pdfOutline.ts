import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'
import type { PaperPdfOutlineItem } from './paperReaderBlocks'

export type PaperPdfOutlineState = 'empty' | 'missing' | 'ready' | 'unavailable'

export interface PaperPdfOutlineReadResult {
  items: PaperPdfOutlineItem[]
  message?: string | null
  paperId: string
  path: string
  state: PaperPdfOutlineState
}

function invokePaperPdfOutlineCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return isTauri()
    ? invoke<T>(command, args)
    : mockInvoke<T>(command, args)
}

export function loadPaperPdfOutline(vaultPath: string, paperId: string): Promise<PaperPdfOutlineReadResult> {
  return invokePaperPdfOutlineCommand<PaperPdfOutlineReadResult>('read_paper_pdf_outline', {
    paperId,
    vaultPath,
  })
}
