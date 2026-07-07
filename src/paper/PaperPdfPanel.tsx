import { useMemo } from 'react'
import { FilePreview } from '../components/FilePreview'
import { translate, type AppLocale } from '../lib/i18n'
import type { VaultEntry } from '../types'
import {
  paperMetadataForReader,
  sourcePdfEntryForPaper,
} from './paperReaderModel'

export interface PaperPdfFocusRequest {
  blockId: string
  page: number
}

export function PaperPdfPanel({
  entry,
  metadata,
  focusRequest,
  locale,
  onCopyFilePath,
  onOpenExternalFile,
  onRevealFile,
}: {
  entry: VaultEntry
  focusRequest: PaperPdfFocusRequest | null
  locale: AppLocale
  metadata: NonNullable<ReturnType<typeof paperMetadataForReader>>
  onCopyFilePath?: (path: string) => void
  onOpenExternalFile?: (path: string) => void
  onRevealFile?: (path: string) => void
}) {
  const pdfEntry = useMemo(() => sourcePdfEntryForPaper(entry, metadata), [entry, metadata])
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-testid="paper-reader-pdf">
      {focusRequest ? (
        <div className="border-b border-border bg-muted/25 px-4 py-2 text-xs text-muted-foreground" data-testid="paper-reader-pdf-focus-request">
          {translate(locale, 'paper.reader.pdfFocusRequested', {
            block: focusRequest.blockId,
            page: focusRequest.page,
          })}
        </div>
      ) : null}
      <FilePreview
        entry={pdfEntry}
        locale={locale}
        onCopyFilePath={onCopyFilePath}
        onOpenExternalFile={onOpenExternalFile}
        onRevealFile={onRevealFile}
      />
    </section>
  )
}
