import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardText, FilePdf, ListBullets, WarningCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate, type AppLocale } from '../lib/i18n'
import { trackPaperBlockCitationCopied, trackPaperReaderOpened } from '../lib/productAnalytics'
import type { VaultEntry } from '../types'
import { FilePreview } from '../components/FilePreview'
import { formatBlockCitation } from './blockCitations'
import {
  BLOCK_CITATION_NAVIGATE_EVENT,
  clearPendingBlockFocus,
  getPendingBlockFocus,
  type BlockCitationNavigationEvent,
} from './blockCitationNavigation'
import { loadPaperBlocks, type PaperBlocksError, type PaperBlocksReadResult } from './blocks'
import {
  blockDisplayText,
  type PaperReaderBlocksState,
  paperMetadataForReader,
  paperReaderSummary,
  sourcePdfEntryForPaper,
} from './paperReaderModel'
import type { SourceBlock, SourceBlockLineError } from './sourceBlocks'

interface PaperReaderShellProps {
  entry: VaultEntry
  content: string
  vaultPath?: string
  locale?: AppLocale
  onCopyFilePath?: (path: string) => void
  onOpenExternalFile?: (path: string) => void
  onRevealFile?: (path: string) => void
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error'

interface BlocksLoadState {
  result: PaperBlocksReadResult | null
  error: unknown
  state: LoadState
}

interface SettledBlocksLoadState extends BlocksLoadState {
  key: string
  state: 'loaded' | 'error'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPaperBlocksError(error: unknown): error is PaperBlocksError {
  return isRecord(error)
    && typeof error.message === 'string'
    && Array.isArray(error.lineErrors)
}

function paperBlocksErrorMessage(error: unknown): string {
  if (isPaperBlocksError(error)) return error.message
  return error instanceof Error ? error.message : String(error)
}

function paperBlocksLineErrors(error: unknown): SourceBlockLineError[] {
  return isPaperBlocksError(error) ? error.lineErrors : []
}

function usePaperBlocks(vaultPath: string | undefined, paperId: string | null): BlocksLoadState {
  const requestKey = vaultPath && paperId ? `${vaultPath}\u0000${paperId}` : null
  const [settledLoadState, setSettledLoadState] = useState<SettledBlocksLoadState | null>(null)

  useEffect(() => {
    if (!vaultPath || !paperId || !requestKey) return

    let cancelled = false
    void loadPaperBlocks(vaultPath, paperId)
      .then((result) => {
        if (!cancelled) setSettledLoadState({ key: requestKey, result, error: null, state: 'loaded' })
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettledLoadState({ key: requestKey, result: null, error, state: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [paperId, requestKey, vaultPath])

  if (!requestKey) return { result: null, error: null, state: 'idle' }
  if (settledLoadState?.key !== requestKey) {
    return { result: null, error: null, state: 'loading' }
  }

  return settledLoadState
}

function useBlockCitationFocus(paperId: string | null, onFocusBlock: (blockId: string) => void): void {
  useEffect(() => {
    if (!paperId) return

    const pending = getPendingBlockFocus()
    if (pending?.paperId === paperId) {
      onFocusBlock(pending.blockId)
      clearPendingBlockFocus()
    }

    const handleNavigation = (event: Event) => {
      const { detail } = event as BlockCitationNavigationEvent
      if (detail.paperId === paperId) onFocusBlock(detail.blockId)
    }

    window.addEventListener(BLOCK_CITATION_NAVIGATE_EVENT, handleNavigation)
    return () => window.removeEventListener(BLOCK_CITATION_NAVIGATE_EVENT, handleNavigation)
  }, [onFocusBlock, paperId])
}

function useReaderOpenedAnalytics(paperId: string | null, blocksState: PaperReaderBlocksState): void {
  const trackedPaperIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!paperId || blocksState === 'loading' || trackedPaperIdRef.current === paperId) return
    trackedPaperIdRef.current = paperId
    trackPaperReaderOpened(blocksState)
  }, [blocksState, paperId])
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border bg-muted px-2 text-xs font-medium text-muted-foreground">
      {value}
    </span>
  )
}

function PaperMetadataPanel({
  locale,
  metadata,
  summary,
}: {
  locale: AppLocale
  metadata: NonNullable<ReturnType<typeof paperMetadataForReader>>
  summary: ReturnType<typeof paperReaderSummary>
}) {
  const sourcePdfStatus = metadata.sourcePdf
    ? translate(locale, 'paper.reader.statusConfigured')
    : translate(locale, 'paper.reader.statusMissing')

  return (
    <section className="border-b border-border px-5 py-4" data-testid="paper-reader-metadata">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">{translate(locale, 'paper.reader.paper')}</p>
          <h1 className="truncate text-xl font-semibold text-foreground">{metadata.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill value={translate(locale, 'paper.reader.sourcePdfStatus', { status: sourcePdfStatus })} />
          <StatusPill value={translate(locale, 'paper.reader.blocksStatus', { status: summary.blocksState })} />
          <StatusPill value={translate(locale, 'paper.reader.blocksCount', { count: summary.blockCount })} />
        </div>
      </div>
      <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="font-medium text-foreground">{translate(locale, 'paper.reader.paperId')}</dt>
          <dd className="truncate" data-testid="paper-reader-paper-id">{metadata.paperId}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">{translate(locale, 'paper.reader.parseStatus')}</dt>
          <dd>{metadata.parseStatus ?? 'unparsed'}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">{translate(locale, 'paper.reader.blocksField')}</dt>
          <dd>{metadata.blocks}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">{translate(locale, 'paper.reader.selectedBlock')}</dt>
          <dd data-testid="paper-reader-selected-block">{summary.selectedBlockId ?? translate(locale, 'paper.reader.none')}</dd>
        </div>
      </dl>
    </section>
  )
}

function BlocksStateNotice({
  locale,
  loadState,
  result,
  error,
}: {
  locale: AppLocale
  loadState: LoadState
  result: PaperBlocksReadResult | null
  error: unknown
}) {
  if (loadState === 'loading') {
    return <p className="px-4 py-3 text-sm text-muted-foreground">{translate(locale, 'paper.reader.blocksLoading')}</p>
  }

  if (loadState === 'error') {
    return (
      <div className="space-y-2 px-4 py-3 text-sm text-destructive" data-testid="paper-reader-blocks-error">
        <div className="flex items-center gap-2 font-medium">
          <WarningCircle className="size-4" />
          <span>{translate(locale, 'paper.reader.blocksError')}</span>
        </div>
        <p>{paperBlocksErrorMessage(error)}</p>
        {paperBlocksLineErrors(error).map((lineError) => (
          <p key={`${lineError.line}:${lineError.kind}`} className="text-xs text-muted-foreground">
            line {lineError.line}: {lineError.message}
          </p>
        ))}
      </div>
    )
  }

  if (result?.state === 'missing') {
    return <p className="px-4 py-3 text-sm text-muted-foreground">{translate(locale, 'paper.reader.blocksMissing')}</p>
  }

  if (result?.state === 'empty') {
    return <p className="px-4 py-3 text-sm text-muted-foreground">{translate(locale, 'paper.reader.blocksEmpty')}</p>
  }

  return null
}

async function writeClipboardText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
  await navigator.clipboard.writeText(text)
}

function BlockOutline({
  locale,
  blocks,
  loadState,
  result,
  error,
  selectedBlockId,
  onSelectBlock,
}: {
  locale: AppLocale
  blocks: SourceBlock[]
  loadState: LoadState
  result: PaperBlocksReadResult | null
  error: unknown
  selectedBlockId: string | null
  onSelectBlock: (blockId: string) => void
}) {
  const blockRefs = useRef(new Map<string, HTMLButtonElement>())

  const setBlockRef = useCallback((blockId: string) => (node: HTMLButtonElement | null) => {
    if (node) {
      blockRefs.current.set(blockId, node)
      return
    }
    blockRefs.current.delete(blockId)
  }, [])

  useEffect(() => {
    if (!selectedBlockId) return
    const selectedNode = blockRefs.current.get(selectedBlockId)
    selectedNode?.scrollIntoView?.({ block: 'center' })
    selectedNode?.focus()
  }, [blocks, selectedBlockId])

  const copyCitation = useCallback((block: SourceBlock) => {
    const citation = formatBlockCitation({ paperId: block.paper_id, blockId: block.id })
    void writeClipboardText(citation)
      .then(() => trackPaperBlockCitationCopied())
      .catch((copyError: unknown) => {
        console.warn('[paper-reader] Failed to copy block citation:', copyError)
      })
  }, [])

  return (
    <section className="flex min-h-0 flex-1 flex-col border-r border-border" data-testid="paper-reader-blocks">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ListBullets className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{translate(locale, 'paper.reader.blocksJsonl')}</h2>
      </div>
      <BlocksStateNotice locale={locale} loadState={loadState} result={result} error={error} />
      <ol className="min-h-0 flex-1 space-y-1 overflow-auto p-3">
        {blocks.map((block) => {
          const selected = block.id === selectedBlockId
          const citation = formatBlockCitation({ paperId: block.paper_id, blockId: block.id })
          return (
            <li
              key={block.id}
              className={cn(
                'flex items-start gap-2 rounded-md border border-transparent p-1',
                selected && 'border-primary/35 bg-primary/5',
              )}
              data-testid={`paper-reader-block-${block.id}`}
            >
              <Button
                ref={setBlockRef(block.id)}
                type="button"
                variant="ghost"
                className="h-auto min-w-0 flex-1 justify-start px-2 py-2 text-left"
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelectBlock(block.id)}
              >
                <span className="grid min-w-0 gap-1">
                  <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono text-[11px] text-foreground">{block.id}</span>
                    <span>{block.kind}</span>
                    <span>p.{block.page}</span>
                  </span>
                  <span className="line-clamp-3 whitespace-normal text-sm leading-5 text-foreground">
                    {blockDisplayText(block)}
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title={citation}
                aria-label={citation}
                onClick={() => copyCitation(block)}
              >
                <ClipboardText className="size-4" />
              </Button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function PaperPdfPanel({
  entry,
  metadata,
  locale,
  onCopyFilePath,
  onOpenExternalFile,
  onRevealFile,
}: Pick<PaperReaderShellProps, 'entry' | 'locale' | 'onCopyFilePath' | 'onOpenExternalFile' | 'onRevealFile'> & {
  metadata: NonNullable<ReturnType<typeof paperMetadataForReader>>
}) {
  const pdfEntry = useMemo(() => sourcePdfEntryForPaper(entry, metadata), [entry, metadata])
  return (
    <section className="flex min-h-0 flex-1 flex-col" data-testid="paper-reader-pdf">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <FilePdf className="size-4 text-muted-foreground" />
        <h2 className="truncate text-sm font-semibold text-foreground">{metadata.sourcePdf}</h2>
      </div>
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

function InvalidPaperMetadata({ entry, locale }: { entry: VaultEntry; locale: AppLocale }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center" data-testid="paper-reader-metadata-error">
      <WarningCircle className="size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold text-foreground">{translate(locale, 'paper.reader.metadataUnavailable')}</h1>
      <p className="max-w-lg text-sm text-muted-foreground">
        {entry.path}
      </p>
    </section>
  )
}

export function PaperReaderShell({
  entry,
  content,
  vaultPath,
  locale = 'en',
  onCopyFilePath,
  onOpenExternalFile,
  onRevealFile,
}: PaperReaderShellProps) {
  const metadata = useMemo(() => paperMetadataForReader(content), [content])
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const focusBlock = useCallback((blockId: string) => setSelectedBlockId(blockId), [])
  const paperId = metadata?.paperId ?? null
  const blocksState = usePaperBlocks(vaultPath, paperId)
  const loadingBlocks = blocksState.state === 'loading' || (Boolean(vaultPath && paperId) && blocksState.state === 'idle')
  const summary = paperReaderSummary(
    blocksState.result,
    loadingBlocks,
    Boolean(vaultPath),
    blocksState.state === 'error',
    selectedBlockId,
  )
  const blocks = blocksState.result?.blocks ?? []

  useBlockCitationFocus(paperId, focusBlock)
  useReaderOpenedAnalytics(paperId, summary.blocksState)

  if (!metadata) return <InvalidPaperMetadata entry={entry} locale={locale} />

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background text-foreground" data-testid="paper-reader-shell">
      <PaperMetadataPanel locale={locale} metadata={metadata} summary={summary} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,0.85fr)_minmax(360px,1.15fr)]">
        <BlockOutline
          locale={locale}
          blocks={blocks}
          loadState={loadingBlocks ? 'loading' : blocksState.state}
          result={blocksState.result}
          error={blocksState.error}
          selectedBlockId={selectedBlockId}
          onSelectBlock={focusBlock}
        />
        <PaperPdfPanel
          entry={entry}
          metadata={metadata}
          locale={locale}
          onCopyFilePath={onCopyFilePath}
          onOpenExternalFile={onOpenExternalFile}
          onRevealFile={onRevealFile}
        />
      </div>
    </section>
  )
}
