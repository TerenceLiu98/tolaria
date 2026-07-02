import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  Check,
  ClipboardText,
  FilePdf,
  ListBullets,
  Plus,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { translate, type AppLocale, type TranslationKey } from '../lib/i18n'
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
import type {
  AnnotationsByBlockId,
  PaperAnnotation,
  PaperAnnotationColor,
  PaperAnnotationKind,
} from './annotations'
import {
  PAPER_ANNOTATION_COLORS,
  PAPER_ANNOTATION_KINDS,
} from './annotations'
import {
  blockDisplayText,
  type PaperReaderBlocksState,
  paperMetadataForReader,
  paperReaderSummary,
  sourcePdfEntryForPaper,
} from './paperReaderModel'
import type { SourceBlock, SourceBlockLineError } from './sourceBlocks'
import {
  isPaperAnnotationsError,
  paperAnnotationsErrorMessage,
  usePaperAnnotations,
  type AnnotationLoadState,
} from './usePaperAnnotations'

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

const DEFAULT_ANNOTATION_KIND: PaperAnnotationKind = 'highlight'
const DEFAULT_ANNOTATION_COLOR: PaperAnnotationColor = 'important'

const ANNOTATION_KIND_LABEL_KEYS: Record<PaperAnnotationKind, TranslationKey> = {
  bookmark: 'paper.reader.addBookmark',
  comment: 'paper.reader.addComment',
  highlight: 'paper.reader.addHighlight',
  question: 'paper.reader.addQuestion',
  underline: 'paper.reader.addUnderline',
}

const ANNOTATION_COLOR_LABEL_KEYS: Record<PaperAnnotationColor, TranslationKey> = {
  conclusion: 'paper.reader.colorConclusion',
  important: 'paper.reader.colorImportant',
  original: 'paper.reader.colorOriginal',
  pending: 'paper.reader.colorPending',
  questioning: 'paper.reader.colorQuestioning',
}

function annotationKindLabel(locale: AppLocale, kind: PaperAnnotationKind): string {
  return translate(locale, ANNOTATION_KIND_LABEL_KEYS[kind])
}

function annotationColorLabel(locale: AppLocale, color: PaperAnnotationColor): string {
  return translate(locale, ANNOTATION_COLOR_LABEL_KEYS[color])
}

function cleanOptionalNote(note: string): string | undefined {
  const trimmed = note.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function textSnapshotForAnnotation(block: SourceBlock, kind: PaperAnnotationKind): string | undefined {
  return kind === 'highlight' || kind === 'underline'
    ? blockDisplayText(block)
    : undefined
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

function AnnotationStateNotice({
  error,
  loadState,
  locale,
  onResetAnnotations,
  result,
}: {
  error: unknown
  loadState: AnnotationLoadState
  locale: AppLocale
  onResetAnnotations: () => void
  result: ReturnType<typeof usePaperAnnotations>['result']
}) {
  if (loadState === 'loading') {
    return <p className="px-4 pb-3 text-sm text-muted-foreground">{translate(locale, 'paper.reader.annotationsLoading')}</p>
  }

  if (loadState === 'error') {
    const lineErrors = isPaperAnnotationsError(error) ? error.lineErrors : []
    return (
      <div className="space-y-2 px-4 pb-3 text-sm text-destructive" data-testid="paper-reader-annotations-error">
        <div className="flex items-center gap-2 font-medium">
          <WarningCircle className="size-4" />
          <span>{translate(locale, 'paper.reader.annotationsError')}</span>
        </div>
        <p>{paperAnnotationsErrorMessage(error)}</p>
        {lineErrors.map((lineError) => (
          <p key={`${lineError.line}:${lineError.kind}`} className="text-xs text-muted-foreground">
            line {lineError.line}: {lineError.message}
          </p>
        ))}
        <Button type="button" variant="outline" size="xs" onClick={onResetAnnotations}>
          <ArrowCounterClockwise className="size-3.5" />
          {translate(locale, 'paper.reader.resetAnnotationSidecar')}
        </Button>
      </div>
    )
  }

  if (result?.state === 'missing') {
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-sm text-muted-foreground" data-testid="paper-reader-annotations-missing">
        <span>{translate(locale, 'paper.reader.annotationsMissing')}</span>
        <Button type="button" variant="outline" size="xs" onClick={onResetAnnotations}>
          <Plus className="size-3.5" />
          {translate(locale, 'paper.reader.createAnnotationSidecar')}
        </Button>
      </div>
    )
  }

  if (result?.state === 'empty') {
    return <p className="px-4 pb-3 text-sm text-muted-foreground">{translate(locale, 'paper.reader.annotationsEmpty')}</p>
  }

  return null
}

function AnnotationKindSelect({
  locale,
  value,
  onValueChange,
}: {
  locale: AppLocale
  value: PaperAnnotationKind
  onValueChange: (value: PaperAnnotationKind) => void
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        const nextKind = PAPER_ANNOTATION_KINDS.find((kind) => kind === nextValue)
        if (nextKind) onValueChange(nextKind)
      }}
    >
      <SelectTrigger
        size="sm"
        className="h-7 w-[8.5rem] text-xs"
        aria-label={translate(locale, 'paper.reader.annotationKind')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PAPER_ANNOTATION_KINDS.map((kind) => (
          <SelectItem key={kind} value={kind}>
            {annotationKindLabel(locale, kind)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function AnnotationColorSelect({
  locale,
  value,
  onValueChange,
}: {
  locale: AppLocale
  value: PaperAnnotationColor
  onValueChange: (value: PaperAnnotationColor) => void
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        const nextColor = PAPER_ANNOTATION_COLORS.find((color) => color === nextValue)
        if (nextColor) onValueChange(nextColor)
      }}
    >
      <SelectTrigger
        size="sm"
        className="h-7 w-[8.5rem] text-xs"
        aria-label={translate(locale, 'paper.reader.annotationColor')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PAPER_ANNOTATION_COLORS.map((color) => (
          <SelectItem key={color} value={color}>
            {annotationColorLabel(locale, color)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function BlockAnnotationComposer({
  block,
  locale,
  onCreateAnnotation,
}: {
  block: SourceBlock
  locale: AppLocale
  onCreateAnnotation: (block: SourceBlock, input: {
    color: PaperAnnotationColor
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => void
}) {
  const [kind, setKind] = useState<PaperAnnotationKind>(DEFAULT_ANNOTATION_KIND)
  const [color, setColor] = useState<PaperAnnotationColor>(DEFAULT_ANNOTATION_COLOR)
  const [note, setNote] = useState('')

  const createAnnotation = useCallback(() => {
    onCreateAnnotation(block, {
      color,
      kind,
      note: cleanOptionalNote(note),
      text: textSnapshotForAnnotation(block, kind),
    })
    setNote('')
  }, [block, color, kind, note, onCreateAnnotation])

  return (
    <div
      className="grid gap-2 rounded-md border border-border/60 bg-muted/30 p-2"
      data-testid={`paper-reader-annotation-controls-${block.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <AnnotationKindSelect locale={locale} value={kind} onValueChange={setKind} />
        <AnnotationColorSelect locale={locale} value={color} onValueChange={setColor} />
        <Button type="button" variant="secondary" size="xs" onClick={createAnnotation}>
          <Plus className="size-3.5" />
          {translate(locale, 'paper.reader.addAnnotation')}
        </Button>
      </div>
      <Textarea
        aria-label={translate(locale, 'paper.reader.annotationNote')}
        className="min-h-14 resize-y text-xs"
        placeholder={translate(locale, 'paper.reader.annotationNotePlaceholder')}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
      />
    </div>
  )
}

function PaperAnnotationEditor({
  annotation,
  locale,
  onDeleteAnnotation,
  onSaveAnnotation,
}: {
  annotation: PaperAnnotation
  locale: AppLocale
  onDeleteAnnotation: (annotationId: string) => void
  onSaveAnnotation: (annotation: PaperAnnotation) => void
}) {
  const [kind, setKind] = useState<PaperAnnotationKind>(annotation.kind)
  const [color, setColor] = useState<PaperAnnotationColor>(annotation.color ?? DEFAULT_ANNOTATION_COLOR)
  const [note, setNote] = useState(annotation.note ?? '')

  const saveAnnotation = useCallback(() => {
    onSaveAnnotation({
      ...annotation,
      color,
      kind,
      note: cleanOptionalNote(note),
      updated_at: new Date().toISOString(),
    })
  }, [annotation, color, kind, note, onSaveAnnotation])

  return (
    <li
      className="grid gap-2 rounded-md bg-muted/60 px-2 py-2 text-xs text-muted-foreground"
      data-testid={`paper-reader-annotation-editor-${annotation.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <AnnotationKindSelect locale={locale} value={kind} onValueChange={setKind} />
        <AnnotationColorSelect locale={locale} value={color} onValueChange={setColor} />
        <Button
          type="button"
          variant="secondary"
          size="xs"
          onClick={saveAnnotation}
        >
          <Check className="size-3.5" />
          {translate(locale, 'paper.reader.saveAnnotation')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title={translate(locale, 'paper.reader.deleteAnnotation')}
          aria-label={translate(locale, 'paper.reader.deleteAnnotation')}
          onClick={() => onDeleteAnnotation(annotation.id)}
        >
          <Trash className="size-4" />
        </Button>
      </div>
      <Textarea
        aria-label={translate(locale, 'paper.reader.annotationNote')}
        className="min-h-14 resize-y text-xs"
        placeholder={translate(locale, 'paper.reader.annotationNotePlaceholder')}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
      />
    </li>
  )
}

async function writeClipboardText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
  await navigator.clipboard.writeText(text)
}

function BlockOutline({
  annotationError,
  annotationLoadState,
  annotationsByBlockId,
  annotationResult,
  locale,
  blocks,
  loadState,
  result,
  error,
  selectedBlockId,
  onCreateAnnotation,
  onDeleteAnnotation,
  onResetAnnotations,
  onSaveAnnotation,
  onSelectBlock,
}: {
  locale: AppLocale
  blocks: SourceBlock[]
  loadState: LoadState
  result: PaperBlocksReadResult | null
  error: unknown
  annotationError: unknown
  annotationLoadState: AnnotationLoadState
  annotationsByBlockId: AnnotationsByBlockId
  annotationResult: ReturnType<typeof usePaperAnnotations>['result']
  selectedBlockId: string | null
  onCreateAnnotation: (block: SourceBlock, input: {
    color: PaperAnnotationColor
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => void
  onDeleteAnnotation: (annotationId: string) => void
  onResetAnnotations: () => void
  onSaveAnnotation: (annotation: PaperAnnotation) => void
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
      <AnnotationStateNotice
        locale={locale}
        loadState={annotationLoadState}
        error={annotationError}
        result={annotationResult}
        onResetAnnotations={onResetAnnotations}
      />
      <ol className="min-h-0 flex-1 space-y-1 overflow-auto p-3">
        {blocks.map((block) => {
          const selected = block.id === selectedBlockId
          const citation = formatBlockCitation({ paperId: block.paper_id, blockId: block.id })
          const annotations = annotationsByBlockId[block.id] ?? []
          return (
            <li
              key={block.id}
              className={cn(
                'grid gap-2 rounded-md border border-transparent p-1',
                selected && 'border-primary/35 bg-primary/5',
              )}
              data-testid={`paper-reader-block-${block.id}`}
            >
              <div className="flex items-start gap-2">
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
                      {annotations.length > 0 && (
                        <span
                          className="rounded-sm bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground"
                          data-testid={`paper-reader-annotation-count-${block.id}`}
                        >
                          {translate(locale, 'paper.reader.annotationCount', { count: annotations.length })}
                        </span>
                      )}
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
              </div>
              {selected && (
                <BlockAnnotationComposer
                  block={block}
                  locale={locale}
                  onCreateAnnotation={onCreateAnnotation}
                />
              )}
              {annotations.length > 0 && (
                <ul className="grid gap-1 px-2 pb-1" data-testid={`paper-reader-annotations-${block.id}`}>
                  {annotations.map((annotation) => (
                    <PaperAnnotationEditor
                      key={annotation.id}
                      annotation={annotation}
                      locale={locale}
                      onDeleteAnnotation={onDeleteAnnotation}
                      onSaveAnnotation={onSaveAnnotation}
                    />
                  ))}
                </ul>
              )}
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
  const annotations = usePaperAnnotations(vaultPath, paperId)
  const createAnnotation = useCallback((block: SourceBlock, input: {
    color: PaperAnnotationColor
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => {
    void annotations.createBlockLevelAnnotation({
      blockId: block.id,
      color: input.color,
      kind: input.kind,
      note: input.note,
      text: input.text,
    }).catch((error: unknown) => {
      console.warn('[paper-reader] Failed to save annotation:', error)
    })
  }, [annotations])
  const saveAnnotation = useCallback((annotation: PaperAnnotation) => {
    void annotations.saveAnnotation(annotation).catch((error: unknown) => {
      console.warn('[paper-reader] Failed to update annotation:', error)
    })
  }, [annotations])
  const deleteAnnotation = useCallback((annotationId: string) => {
    void annotations.deleteAnnotation(annotationId).catch((error: unknown) => {
      console.warn('[paper-reader] Failed to delete annotation:', error)
    })
  }, [annotations])
  const resetAnnotations = useCallback(() => {
    void annotations.resetAnnotations().catch((error: unknown) => {
      console.warn('[paper-reader] Failed to reset annotation sidecar:', error)
    })
  }, [annotations])

  useBlockCitationFocus(paperId, focusBlock)
  useReaderOpenedAnalytics(paperId, summary.blocksState)

  if (!metadata) return <InvalidPaperMetadata entry={entry} locale={locale} />

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background text-foreground" data-testid="paper-reader-shell">
      <PaperMetadataPanel locale={locale} metadata={metadata} summary={summary} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,0.85fr)_minmax(360px,1.15fr)]">
        <BlockOutline
          annotationError={annotations.error}
          annotationLoadState={annotations.loadState}
          annotationsByBlockId={annotations.annotationsByBlockId}
          annotationResult={annotations.result}
          locale={locale}
          blocks={blocks}
          loadState={loadingBlocks ? 'loading' : blocksState.state}
          result={blocksState.result}
          error={blocksState.error}
          selectedBlockId={selectedBlockId}
          onCreateAnnotation={createAnnotation}
          onDeleteAnnotation={deleteAnnotation}
          onResetAnnotations={resetAnnotations}
          onSaveAnnotation={saveAnnotation}
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
