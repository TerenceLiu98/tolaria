import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { createTranslator, type AppLocale } from '../lib/i18n'
import { trackPaperImported } from '../lib/productAnalytics'
import { isTauri, mockInvoke } from '../mock-tauri'
import type { ImportPaperPdfResult } from './types'
import { pickPaperPdf } from './paperImportDialog'

export type PaperImportSource = 'command_palette'

interface UsePaperImportConfig {
  locale?: AppLocale
  onImported?: (result: ImportPaperPdfResult) => void | Promise<void>
  onToast?: (message: string | null) => void
  source?: PaperImportSource
  vaultPath: string
}

export function invokeImportPaperPdf(
  vaultPath: string,
  sourcePath: string,
): Promise<ImportPaperPdfResult> {
  const args = { vaultPath, sourcePath }
  return isTauri()
    ? invoke<ImportPaperPdfResult>('import_paper_pdf', args)
    : mockInvoke<ImportPaperPdfResult>('import_paper_pdf', args)
}

export function usePaperImport({
  locale = 'en',
  onImported,
  onToast,
  source = 'command_palette',
  vaultPath,
}: UsePaperImportConfig): () => Promise<ImportPaperPdfResult | null> {
  return useCallback(async () => {
    const t = createTranslator(locale)
    const sourcePath = await pickPaperPdf(t('paper.import.dialogTitle'))
    if (!sourcePath) return null

    try {
      const result = await invokeImportPaperPdf(vaultPath, sourcePath)
      trackPaperImported({ deduplicated: result.deduplicated, source })
      onToast?.(t('paper.import.success', { title: result.title }))
      await onImported?.(result)
      return result
    } catch (error) {
      onToast?.(t('paper.import.failure', { error: String(error) }))
      return null
    }
  }, [locale, onImported, onToast, source, vaultPath])
}
