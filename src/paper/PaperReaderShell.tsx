import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  CaretLeft,
  CaretRight,
  Check,
  ClipboardText,
  ListBullets,
  MagnifyingGlass,
  NotePencil,
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
import { Input } from '@/components/ui/input'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { translate, type AppLocale, type TranslationKey } from '../lib/i18n'
import {
  trackPaperBlockCitationCopied,
  trackPaperMarginaliaCitationAdded,
  trackPaperMarginaliaOpened,
  trackPaperReaderModeChanged,
  trackPaperReaderOpened,
} from '../lib/productAnalytics'
import type { VaultEntry } from '../types'
import { FilePreview } from '../components/FilePreview'
import { parsePaper } from './parser'
import type { PaperParserProvider } from './parserSettings'
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
import {
  addBlockCitationToMarginalia,
  createOrOpenPaperMarginalia,
  defaultMarginaliaPathForPaper,
  readPaperMarginalia,
  type MarginaliaReadResult,
} from './marginalia'
import type { SourceBlock, SourceBlockLineError } from './sourceBlocks'
import {
  paperOutlineItems,
  paperSidecarHealth,
  renderedSourceBlockKind,
  searchPaperBlocks,
  sourceBlockCaptionText,
  sourceBlockPageLabel,
  sourceBlockPrimaryText,
  sourceBlockSectionLabel,
  type PaperOutlineItem,
} from './paperReaderBlocks'
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
  onOpenPaperNote?: (path: string) => void | Promise<void>
  onParsePaper?: (paperId: string) => void | Promise<void>
  paperParserProvider?: PaperParserProvider
  onRevealFile?: (path: string) => void
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error'
type ReaderMode = 'read' | 'marginalia'

interface PdfFocusRequest {
  blockId: string
  page: number
}

interface BlocksLoadState {
  result: PaperBlocksReadResult | null
  error: unknown
  state: LoadState
}

interface MarginaliaContentLoadState {
  error: unknown
  path: string
  result: MarginaliaReadResult | null
  state: LoadState
}

interface SettledBlocksLoadState extends BlocksLoadState {
  key: string
  state: 'loaded' | 'error'
}

interface SettledMarginaliaContentLoadState extends Omit<MarginaliaContentLoadState, 'path'> {
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

function paperParseErrorMessage(error: unknown): string {
  if (isRecord(error) && typeof error.message === 'string') return error.message
  return error instanceof Error ? error.message : String(error)
}

function isMineruAuthenticationFailure(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('authenticate')
    || normalized.includes('unauthorized')
    || normalized.includes('token is invalid')
    || normalized.includes('token expired')
    || normalized.includes('401')
    || normalized.includes('a0202')
}

function paperParseFailureDetail(locale: AppLocale, parseProvider: PaperParserProvider, message: string): string {
  if (parseProvider === 'mineru' && isMineruAuthenticationFailure(message)) {
    return translate(locale, 'paper.reader.parseAuthFailed', { message })
  }
  return message
}

function usePaperBlocks(vaultPath: string | undefined, paperId: string | null, refreshKey: number): BlocksLoadState {
  const requestKey = vaultPath && paperId ? `${vaultPath}\u0000${paperId}\u0000${refreshKey}` : null
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

function usePaperMarginaliaContent({
  enabled,
  paperPath,
  refreshKey,
  vaultPath,
}: {
  enabled: boolean
  paperPath: string
  refreshKey: number
  vaultPath?: string
}): MarginaliaContentLoadState {
  const path = defaultMarginaliaPathForPaper(paperPath)
  const requestKey = enabled ? `${paperPath}\u0000${vaultPath ?? ''}\u0000${refreshKey}` : null
  const [settledLoadState, setSettledLoadState] = useState<SettledMarginaliaContentLoadState | null>(null)

  useEffect(() => {
    if (!enabled || !requestKey) return

    let cancelled = false
    void readPaperMarginalia({ paperPath, vaultPath })
      .then((result) => {
        if (!cancelled) setSettledLoadState({ key: requestKey, result, error: null, state: 'loaded' })
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettledLoadState({ key: requestKey, result: null, error, state: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [enabled, paperPath, requestKey, vaultPath])

  if (!requestKey) return { error: null, path, result: null, state: 'idle' }
  if (settledLoadState?.key !== requestKey) {
    return { error: null, path, result: null, state: 'loading' }
  }

  return { ...settledLoadState, path }
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

function useReaderModeAnalytics(readerMode: ReaderMode): void {
  const previousModeRef = useRef(readerMode)
  useEffect(() => {
    if (previousModeRef.current === readerMode) return
    previousModeRef.current = readerMode
    trackPaperReaderModeChanged(readerMode)
  }, [readerMode])
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border bg-muted px-2 text-xs font-medium text-muted-foreground">
      {value}
    </span>
  )
}

function paperParseButtonLabel(
  locale: AppLocale,
  provider: PaperParserProvider | undefined,
  pending: boolean,
): string {
  if (pending) return translate(locale, 'paper.reader.parsing')
  return translate(locale, provider === 'mineru' ? 'paper.reader.parseWithMineru' : 'paper.reader.parsePaper')
}

function paperStructureStatusLabel(locale: AppLocale, blocksState: PaperReaderBlocksState): string {
  const labelKeys: Record<PaperReaderBlocksState, TranslationKey> = {
    empty: 'paper.reader.structureEmpty',
    error: 'paper.reader.structureError',
    loading: 'paper.reader.structureLoading',
    missing: 'paper.reader.structureMissing',
    ready: 'paper.reader.structureReady',
    unavailable: 'paper.reader.structureUnavailable',
  }
  return translate(locale, labelKeys[blocksState])
}

const DEFAULT_ANNOTATION_KIND: PaperAnnotationKind = 'highlight'
const DEFAULT_ANNOTATION_COLOR: PaperAnnotationColor = 'important'
const EMPTY_SOURCE_BLOCKS: SourceBlock[] = []

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
  canAddSelectedBlock,
  locale,
  metadata,
  marginaliaError,
  onAddSelectedBlockToMarginalia,
  onOpenMarginalia,
  onParsePaper,
  onSelectMarginaliaMode,
  onSelectReadMode,
  parsePaperPending,
  parseProvider,
  summary,
}: {
  canAddSelectedBlock: boolean
  locale: AppLocale
  metadata: NonNullable<ReturnType<typeof paperMetadataForReader>>
  marginaliaError: string | null
  onAddSelectedBlockToMarginalia: () => void
  onOpenMarginalia: () => void
  onParsePaper?: () => void
  onSelectMarginaliaMode: () => void
  onSelectReadMode: () => void
  parsePaperPending: boolean
  parseProvider?: PaperParserProvider
  summary: ReturnType<typeof paperReaderSummary>
}) {
  const sourcePdfStatus = metadata.sourcePdf
    ? translate(locale, 'paper.reader.statusConfigured')
    : translate(locale, 'paper.reader.statusMissing')
  const structureStatus = paperStructureStatusLabel(locale, summary.blocksState)

  return (
    <section className="border-b border-border px-5 py-4" data-testid="paper-reader-metadata">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">{translate(locale, 'paper.reader.paper')}</p>
          <h1 className="truncate text-xl font-semibold text-foreground">{metadata.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList aria-label={translate(locale, 'paper.reader.modeTabs')} className="h-8">
            <TabsTrigger value="read" className="h-7 px-3 text-xs" onClick={onSelectReadMode}>
              {translate(locale, 'paper.reader.modeRead')}
            </TabsTrigger>
            <TabsTrigger value="marginalia" className="h-7 px-3 text-xs" onClick={onSelectMarginaliaMode}>
              {translate(locale, 'paper.reader.modeMarginalia')}
            </TabsTrigger>
          </TabsList>
          <StatusPill value={translate(locale, 'paper.reader.sourcePdfStatus', { status: sourcePdfStatus })} />
          <StatusPill value={translate(locale, 'paper.reader.blocksStatus', { status: structureStatus })} />
          <StatusPill value={translate(locale, 'paper.reader.blocksCount', { count: summary.blockCount })} />
          {onParsePaper ? (
            <Button type="button" variant="secondary" size="sm" disabled={parsePaperPending} onClick={onParsePaper}>
              <MagnifyingGlass className="size-4" />
              {paperParseButtonLabel(locale, parseProvider, parsePaperPending)}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onOpenMarginalia}>
            <NotePencil className="size-4" />
            {translate(locale, 'paper.reader.openMarginalia')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canAddSelectedBlock}
            onClick={onAddSelectedBlockToMarginalia}
          >
            <Plus className="size-4" />
            {translate(locale, 'paper.reader.addSelectedBlockToMarginalia')}
          </Button>
        </div>
      </div>
      {marginaliaError && (
        <p className="mt-3 text-xs text-destructive" data-testid="paper-reader-marginalia-error">
          {translate(locale, 'paper.reader.marginaliaError', { message: marginaliaError })}
        </p>
      )}
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
          <dd>{translate(locale, 'paper.reader.blocksCount', { count: summary.blockCount })}</dd>
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
  onParsePaper,
  locale,
  loadState,
  parseProvider = 'none',
  parseStatus,
  parseError,
  parsePending,
  result,
  error,
}: {
  locale: AppLocale
  loadState: LoadState
  onParsePaper?: () => void
  parseProvider?: PaperParserProvider
  parseStatus: string | null
  parseError: string | null
  parsePending: boolean
  result: PaperBlocksReadResult | null
  error: unknown
}) {
  const parseButtonLabel = paperParseButtonLabel(locale, parseProvider, parsePending)

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

  if (parseStatus === 'failed') {
    const failureDetail = parseError?.trim()
    return (
      <div className="space-y-2 px-4 py-3 text-sm text-muted-foreground" data-testid="paper-reader-parse-failed">
        <p className="text-destructive">{translate(locale, 'paper.reader.parseFailedRetry')}</p>
        {failureDetail ? (
          <p className="text-xs text-destructive">
            {paperParseFailureDetail(locale, parseProvider, failureDetail)}
          </p>
        ) : null}
        {onParsePaper ? (
          <Button type="button" variant="secondary" size="sm" disabled={parsePending} onClick={onParsePaper}>
            <MagnifyingGlass className="size-4" />
            {parseButtonLabel}
          </Button>
        ) : null}
      </div>
    )
  }

  if (result?.state === 'missing') {
    return (
      <div className="space-y-2 px-4 py-3 text-sm text-muted-foreground" data-testid="paper-reader-blocks-missing">
        <p>{translate(locale, 'paper.reader.blocksMissing')}</p>
        <p>{translate(locale, 'paper.reader.blocksMissingParseHelp')}</p>
        {onParsePaper ? (
          <Button type="button" variant="secondary" size="sm" disabled={parsePending} onClick={onParsePaper}>
            <MagnifyingGlass className="size-4" />
            {parseButtonLabel}
          </Button>
        ) : null}
        {parseError ? <p className="text-xs text-destructive">{parseError}</p> : null}
      </div>
    )
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
  collapsed,
  locale,
  blocks,
  loadState,
  result,
  error,
  outlineItems,
  searchQuery,
  searchResults,
  selectedBlockId,
  onParsePaper,
  onSearchQueryChange,
  onToggleCollapsed,
  parseProvider,
  parsePaperError,
  parsePaperPending,
  parseStatus,
  onSelectBlock,
}: {
  locale: AppLocale
  blocks: SourceBlock[]
  loadState: LoadState
  result: PaperBlocksReadResult | null
  error: unknown
  collapsed: boolean
  outlineItems: PaperOutlineItem[]
  searchQuery: string
  searchResults: SourceBlock[]
  selectedBlockId: string | null
  onParsePaper?: () => void
  onSearchQueryChange: (value: string) => void
  onToggleCollapsed: () => void
  parseProvider?: PaperParserProvider
  parsePaperError: string | null
  parsePaperPending: boolean
  parseStatus: string | null
  onSelectBlock: (blockId: string) => void
}) {
  if (collapsed) {
    return (
      <aside
        className="flex min-h-0 w-12 shrink-0 flex-col items-center border-r border-border bg-muted/20 py-3"
        data-testid="paper-reader-blocks"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={translate(locale, 'paper.reader.expandOutline')}
          aria-label={translate(locale, 'paper.reader.expandOutline')}
          onClick={onToggleCollapsed}
        >
          <CaretRight className="size-4" />
        </Button>
        <ListBullets className="mt-4 size-4 text-muted-foreground" />
        <span
          className="mt-3 [writing-mode:vertical-rl] text-xs font-medium text-muted-foreground"
          aria-hidden="true"
        >
          {translate(locale, 'paper.reader.outlineCollapsed')}
        </span>
        <span className="mt-auto rounded-md bg-muted px-1.5 py-1 text-[11px] font-medium text-muted-foreground">
          {blocks.length}
        </span>
      </aside>
    )
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col border-r border-border" data-testid="paper-reader-outline">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ListBullets className="size-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-sm font-semibold text-foreground">{translate(locale, 'paper.reader.blocksJsonl')}</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title={translate(locale, 'paper.reader.collapseOutline')}
          aria-label={translate(locale, 'paper.reader.collapseOutline')}
          onClick={onToggleCollapsed}
        >
          <CaretLeft className="size-4" />
        </Button>
      </div>
      <BlocksStateNotice
        locale={locale}
        loadState={loadState}
        result={result}
        error={error}
        onParsePaper={onParsePaper}
        parseProvider={parseProvider}
        parseStatus={parseStatus}
        parseError={parsePaperError}
          parsePending={parsePaperPending}
      />
      <div className="grid gap-2 border-b border-border px-3 py-3">
        <Input
          aria-label={translate(locale, 'paper.reader.searchBlocks')}
          className="h-8 text-xs"
          placeholder={translate(locale, 'paper.reader.searchBlocks')}
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {searchQuery.trim().length > 0 ? (
          <ol className="grid gap-1" data-testid="paper-reader-search-results">
            {searchResults.length === 0 ? (
              <li className="px-2 py-2 text-xs text-muted-foreground">{translate(locale, 'paper.reader.searchEmpty')}</li>
            ) : searchResults.map((block) => (
              <li key={block.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start px-2 py-2 text-left"
                  aria-current={block.id === selectedBlockId ? 'true' : undefined}
                  onClick={() => onSelectBlock(block.id)}
                >
                  <span className="grid min-w-0 gap-1">
                    <span className="truncate text-xs font-medium text-foreground">{sourceBlockPrimaryText(block)}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {[block.id, sourceBlockPageLabel(block), sourceBlockSectionLabel(block)].filter(Boolean).join(' / ')}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <ol className="grid gap-1" data-testid="paper-reader-outline-items">
            {outlineItems.length === 0 ? (
              <li className="px-2 py-2 text-xs text-muted-foreground">{translate(locale, 'paper.reader.outlineEmpty')}</li>
            ) : outlineItems.map((item) => (
              <li key={`${item.blockId}:${item.label}`}>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    'h-auto w-full justify-start px-2 py-2 text-left',
                    item.depth === 1 && 'pl-4',
                    item.depth >= 2 && 'pl-6',
                  )}
                  aria-current={item.blockId === selectedBlockId ? 'true' : undefined}
                  onClick={() => onSelectBlock(item.blockId)}
                >
                  <span className="grid min-w-0 gap-1">
                    <span className="truncate text-xs font-medium text-foreground">{item.label}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {[item.page ? `p.${item.page}` : null, item.section].filter(Boolean).join(' / ')}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function SourceBlockMeta({
  block,
  locale,
}: {
  block: SourceBlock
  locale: AppLocale
}) {
  const pageLabel = sourceBlockPageLabel(block)
  const sectionLabel = sourceBlockSectionLabel(block)
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="font-mono text-[11px] text-foreground">{block.id}</span>
      <span>{renderedSourceBlockKind(block)}</span>
      {pageLabel ? <span>{pageLabel}</span> : <span>{translate(locale, 'paper.reader.pageMissing')}</span>}
      {sectionLabel ? <span>{sectionLabel}</span> : null}
    </div>
  )
}

function RenderedSourceBlock({
  block,
}: {
  block: SourceBlock
}) {
  const kind = renderedSourceBlockKind(block)
  const text = sourceBlockPrimaryText(block)
  const caption = sourceBlockCaptionText(block)

  if (kind === 'title') return <h1 className="text-2xl font-semibold leading-8 text-foreground">{text}</h1>
  if (kind === 'heading') return <h2 className="text-lg font-semibold leading-7 text-foreground">{text}</h2>
  if (kind === 'paragraph') return <p className="text-sm leading-7 text-foreground">{text}</p>
  if (kind === 'caption') return <p className="border-l-2 border-border pl-3 text-sm italic leading-6 text-muted-foreground">{text}</p>
  if (kind === 'equation') {
    return <pre className="overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-sm text-foreground">{text}</pre>
  }

  return (
    <div className="grid gap-2 rounded-md border border-border bg-muted/25 p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{kind}</p>
      <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{text}</div>
      {caption ? <p className="text-sm italic leading-6 text-muted-foreground">{caption}</p> : null}
    </div>
  )
}

function PaperBlockReader({
  annotationError,
  annotationLoadState,
  annotationsByBlockId,
  annotationResult,
  blocks,
  health,
  locale,
  onCreateAnnotation,
  onDeleteAnnotation,
  onResetAnnotations,
  onSaveAnnotation,
  onSelectBlock,
  selectedBlockId,
}: {
  annotationError: unknown
  annotationLoadState: AnnotationLoadState
  annotationsByBlockId: AnnotationsByBlockId
  annotationResult: ReturnType<typeof usePaperAnnotations>['result']
  blocks: SourceBlock[]
  health: ReturnType<typeof paperSidecarHealth>
  locale: AppLocale
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
  selectedBlockId: string | null
}) {
  const blockRefs = useRef(new Map<string, HTMLElement>())

  const setBlockRef = useCallback((blockId: string) => (node: HTMLElement | null) => {
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
    <section className="flex min-h-0 flex-1 flex-col" data-testid="paper-reader-block-view">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">{translate(locale, 'paper.reader.readingView')}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {health.isZeroUsableBlocks ? <StatusPill value={translate(locale, 'paper.reader.zeroUsableBlocks')} /> : null}
          {health.hasMissingPageNumbers ? <StatusPill value={translate(locale, 'paper.reader.missingPageNumbers')} /> : null}
          {health.hasMinimallyNormalizedBlocks ? <StatusPill value={translate(locale, 'paper.reader.minimalBlocksWarning')} /> : null}
        </div>
      </div>
      <AnnotationStateNotice
        locale={locale}
        loadState={annotationLoadState}
        error={annotationError}
        result={annotationResult}
        onResetAnnotations={onResetAnnotations}
      />
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <article className="mx-auto grid max-w-3xl gap-3">
          {blocks.map((block) => {
            const selected = block.id === selectedBlockId
            const annotations = annotationsByBlockId[block.id] ?? []
            return (
              <section
                key={block.id}
                ref={setBlockRef(block.id)}
                className={cn(
                  'grid gap-2 rounded-md border border-transparent px-3 py-2',
                  selected && 'border-primary/40 bg-primary/5',
                )}
                data-testid={`paper-reader-block-${block.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-w-0 flex-1 justify-start px-0 py-0 text-left hover:bg-transparent"
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => onSelectBlock(block.id)}
                  >
                    <span className="grid min-w-0 flex-1 gap-2">
                      <SourceBlockMeta block={block} locale={locale} />
                      <RenderedSourceBlock block={block} />
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title={formatBlockCitation({ paperId: block.paper_id, blockId: block.id })}
                    aria-label={formatBlockCitation({ paperId: block.paper_id, blockId: block.id })}
                    onClick={() => copyCitation(block)}
                  >
                    <ClipboardText className="size-4" />
                  </Button>
                </div>
                {annotations.length > 0 && (
                  <span
                    className="w-fit rounded-sm bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground"
                    data-testid={`paper-reader-annotation-count-${block.id}`}
                  >
                    {translate(locale, 'paper.reader.annotationCount', { count: annotations.length })}
                  </span>
                )}
                {selected && (
                  <BlockAnnotationComposer
                    block={block}
                    locale={locale}
                    onCreateAnnotation={onCreateAnnotation}
                  />
                )}
                {annotations.length > 0 && (
                  <ul className="grid gap-1 pb-1" data-testid={`paper-reader-annotations-${block.id}`}>
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
              </section>
            )
          })}
        </article>
      </div>
    </section>
  )
}

function PaperPdfPanel({
  entry,
  metadata,
  focusRequest,
  locale,
  onCopyFilePath,
  onOpenExternalFile,
  onRevealFile,
}: Pick<PaperReaderShellProps, 'entry' | 'onCopyFilePath' | 'onOpenExternalFile' | 'onRevealFile'> & {
  focusRequest: PdfFocusRequest | null
  locale: AppLocale
  metadata: NonNullable<ReturnType<typeof paperMetadataForReader>>
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

function marginaliaErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function marginaliaStatusText(locale: AppLocale, result: MarginaliaReadResult): string {
  const statusKey: TranslationKey = result.state === 'ready'
    ? 'paper.reader.marginaliaReady'
    : 'paper.reader.marginaliaMissing'
  return translate(locale, 'paper.reader.marginaliaStatus', {
    status: translate(locale, statusKey),
  })
}

function CurrentBlockPanel({
  block,
  locale,
}: {
  block: SourceBlock | null
  locale: AppLocale
}) {
  return (
    <section
      className="grid gap-2 border-b border-border bg-muted/25 px-4 py-3"
      data-testid="paper-reader-current-block"
    >
      <div className="flex items-center gap-2">
        <ListBullets className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{translate(locale, 'paper.reader.currentBlock')}</h2>
      </div>
      {block ? (
        <div className="grid gap-1 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono text-[11px] text-foreground">{block.id}</span>
            <span>{block.kind}</span>
            <span>p.{block.page}</span>
          </div>
          <p className="line-clamp-3 text-foreground">{blockDisplayText(block)}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{translate(locale, 'paper.reader.noSelectedBlock')}</p>
      )}
    </section>
  )
}

function MarginaliaPane({
  canAddSelectedBlock,
  contentState,
  locale,
  onAddSelectedBlockToMarginalia,
  onCreateMarginalia,
  onOpenMarginaliaInEditor,
}: {
  canAddSelectedBlock: boolean
  contentState: MarginaliaContentLoadState
  locale: AppLocale
  onAddSelectedBlockToMarginalia: () => void
  onCreateMarginalia: () => void
  onOpenMarginaliaInEditor: () => void
}) {
  const result = contentState.result
  const statusText = result
    ? marginaliaStatusText(locale, result)
    : translate(locale, contentState.state === 'error'
      ? 'paper.reader.marginaliaLoadError'
      : 'paper.reader.marginaliaLoading')

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      data-testid={contentState.state === 'loading' ? undefined : 'paper-reader-marginalia-pane'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{translate(locale, 'paper.reader.marginaliaPane')}</h2>
          <p className="truncate text-xs text-muted-foreground">{contentState.path}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result?.state === 'missing' && (
            <Button type="button" variant="outline" size="sm" onClick={onCreateMarginalia}>
              <NotePencil className="size-4" />
              {translate(locale, 'paper.reader.createMarginalia')}
            </Button>
          )}
          {result?.state === 'ready' && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenMarginaliaInEditor}>
              <NotePencil className="size-4" />
              {translate(locale, 'paper.reader.openMarginaliaInEditor')}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canAddSelectedBlock || contentState.state === 'loading'}
            onClick={onAddSelectedBlockToMarginalia}
          >
            <Plus className="size-4" />
            {translate(locale, 'paper.reader.addSelectedBlockToMarginalia')}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        <p className="mb-3 text-xs font-medium text-muted-foreground">{statusText}</p>
        {contentState.state === 'error' && (
          <p className="text-sm text-destructive" data-testid="paper-reader-marginalia-load-error">
            {marginaliaErrorMessage(contentState.error)}
          </p>
        )}
        {result?.state === 'missing' && (
          <p className="text-sm text-muted-foreground">{translate(locale, 'paper.reader.marginaliaMissingHelp')}</p>
        )}
        {result?.state === 'ready' && result.content.length === 0 && (
          <p className="text-sm text-muted-foreground">{translate(locale, 'paper.reader.marginaliaEmpty')}</p>
        )}
        {result?.state === 'ready' && result.content.length > 0 && (
          <pre
            aria-label={translate(locale, 'paper.reader.marginaliaPreview')}
            className="min-h-0 whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm leading-6 text-foreground"
            data-testid="paper-reader-marginalia-preview"
          >
            {result.content}
          </pre>
        )}
      </div>
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
  onOpenPaperNote,
  onParsePaper,
  paperParserProvider = 'none',
  onRevealFile,
}: PaperReaderShellProps) {
  const metadata = useMemo(() => paperMetadataForReader(content), [content])
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [readerMode, setReaderMode] = useState<ReaderMode>('read')
  const [outlineCollapsed, setOutlineCollapsed] = useState(false)
  const [blocksRefreshKey, setBlocksRefreshKey] = useState(0)
  const [blockSearchQuery, setBlockSearchQuery] = useState('')
  const [pdfFocusRequest, setPdfFocusRequest] = useState<PdfFocusRequest | null>(null)
  const [parsePaperError, setParsePaperError] = useState<string | null>(null)
  const [parsePaperPending, setParsePaperPending] = useState(false)
  const [marginaliaRefreshKey, setMarginaliaRefreshKey] = useState(0)
  const [marginaliaError, setMarginaliaError] = useState<string | null>(null)
  const handleReaderModeChange = useCallback((nextValue: string) => {
    if (nextValue === 'read' || nextValue === 'marginalia') setReaderMode(nextValue)
  }, [])
  const selectReadMode = useCallback(() => setReaderMode('read'), [])
  const selectMarginaliaMode = useCallback(() => setReaderMode('marginalia'), [])
  const toggleOutlineCollapsed = useCallback(() => {
    setOutlineCollapsed((collapsed) => !collapsed)
  }, [])
  const refreshMarginaliaContent = useCallback(() => {
    setMarginaliaRefreshKey((currentKey) => currentKey + 1)
  }, [])
  const paperId = metadata?.paperId ?? null
  const blocksState = usePaperBlocks(vaultPath, paperId, blocksRefreshKey)
  const canParsePaper = Boolean(onParsePaper || vaultPath)
  const handleParsePaper = useCallback(() => {
    if (!paperId || (!onParsePaper && !vaultPath)) return

    setParsePaperPending(true)
    setParsePaperError(null)
    const parseRequest = onParsePaper
      ? onParsePaper(paperId)
      : parsePaper(vaultPath!, paperId)
    void Promise.resolve(parseRequest)
      .then(() => setBlocksRefreshKey((currentKey) => currentKey + 1))
      .catch((error: unknown) => setParsePaperError(paperParseErrorMessage(error)))
      .finally(() => setParsePaperPending(false))
  }, [onParsePaper, paperId, vaultPath])
  const marginaliaContent = usePaperMarginaliaContent({
    enabled: readerMode === 'marginalia' && Boolean(metadata),
    paperPath: entry.path,
    refreshKey: marginaliaRefreshKey,
    vaultPath,
  })
  const loadingBlocks = blocksState.state === 'loading' || (Boolean(vaultPath && paperId) && blocksState.state === 'idle')
  const summary = paperReaderSummary(
    blocksState.result,
    loadingBlocks,
    Boolean(vaultPath),
    blocksState.state === 'error',
    selectedBlockId,
  )
  const blocks = blocksState.result?.blocks ?? EMPTY_SOURCE_BLOCKS
  const effectiveParseError = parsePaperError ?? metadata?.parseError ?? null
  const outlineItems = useMemo(() => paperOutlineItems(blocks), [blocks])
  const blockSearchResults = useMemo(() => searchPaperBlocks(blocks, blockSearchQuery), [blockSearchQuery, blocks])
  const sidecarHealth = useMemo(
    () => paperSidecarHealth(blocks, blocksState.result?.state ?? null),
    [blocks, blocksState.result?.state],
  )
  const selectedBlock = useMemo(
    () => blocks.find((block) => block.id === selectedBlockId) ?? null,
    [blocks, selectedBlockId],
  )
  const handleSelectBlock = useCallback((blockId: string) => {
    setSelectedBlockId(blockId)
    const block = blocks.find((candidate) => candidate.id === blockId)
    if (block && Number.isInteger(block.page) && block.page > 0) {
      setPdfFocusRequest({ blockId: block.id, page: block.page })
    }
  }, [blocks])
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
  const openMarginaliaPath = useCallback(async (path: string) => {
    await onOpenPaperNote?.(path)
  }, [onOpenPaperNote])
  const handleOpenMarginalia = useCallback(() => {
    if (!metadata) return
    setMarginaliaError(null)
    void createOrOpenPaperMarginalia({
      paperPath: entry.path,
      paperTitle: metadata.title,
      vaultPath,
    })
      .then(async (result) => {
        trackPaperMarginaliaOpened({ created: result.created })
        refreshMarginaliaContent()
        await openMarginaliaPath(result.path)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[paper-reader] Failed to create/open marginalia:', error)
        setMarginaliaError(message)
      })
  }, [entry.path, metadata, openMarginaliaPath, refreshMarginaliaContent, vaultPath])
  const handleCreateMarginaliaInPane = useCallback(() => {
    if (!metadata) return
    setMarginaliaError(null)
    void createOrOpenPaperMarginalia({
      paperPath: entry.path,
      paperTitle: metadata.title,
      vaultPath,
    })
      .then((result) => {
        trackPaperMarginaliaOpened({ created: result.created })
        refreshMarginaliaContent()
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[paper-reader] Failed to create marginalia:', error)
        setMarginaliaError(message)
      })
  }, [entry.path, metadata, refreshMarginaliaContent, vaultPath])
  const handleAddSelectedBlockToMarginalia = useCallback(() => {
    if (!metadata || !selectedBlockId) return
    setMarginaliaError(null)
    void addBlockCitationToMarginalia({
      blockId: selectedBlockId,
      paperId: metadata.paperId,
      paperPath: entry.path,
      paperTitle: metadata.title,
      vaultPath,
    })
      .then(async (result) => {
        trackPaperMarginaliaCitationAdded({ created: result.created })
        refreshMarginaliaContent()
        await openMarginaliaPath(result.path)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[paper-reader] Failed to add selected block to marginalia:', error)
        setMarginaliaError(message)
      })
  }, [entry.path, metadata, openMarginaliaPath, refreshMarginaliaContent, selectedBlockId, vaultPath])
  const handleAddSelectedBlockToMarginaliaInPane = useCallback(() => {
    if (!metadata || !selectedBlockId) return
    setMarginaliaError(null)
    void addBlockCitationToMarginalia({
      blockId: selectedBlockId,
      paperId: metadata.paperId,
      paperPath: entry.path,
      paperTitle: metadata.title,
      vaultPath,
    })
      .then((result) => {
        trackPaperMarginaliaCitationAdded({ created: result.created })
        refreshMarginaliaContent()
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[paper-reader] Failed to add selected block to marginalia:', error)
        setMarginaliaError(message)
      })
  }, [entry.path, metadata, refreshMarginaliaContent, selectedBlockId, vaultPath])

  useBlockCitationFocus(paperId, handleSelectBlock)
  useReaderOpenedAnalytics(paperId, summary.blocksState)
  useReaderModeAnalytics(readerMode)

  if (!metadata) return <InvalidPaperMetadata entry={entry} locale={locale} />

  return (
    <Tabs
      value={readerMode}
      onValueChange={handleReaderModeChange}
      className="min-h-0 flex-1 gap-0 bg-background text-foreground"
      data-testid="paper-reader-shell"
    >
      <PaperMetadataPanel
        canAddSelectedBlock={selectedBlockId !== null}
        locale={locale}
        marginaliaError={marginaliaError}
        metadata={metadata}
        onAddSelectedBlockToMarginalia={handleAddSelectedBlockToMarginalia}
        onOpenMarginalia={handleOpenMarginalia}
        onParsePaper={canParsePaper ? handleParsePaper : undefined}
        onSelectMarginaliaMode={selectMarginaliaMode}
        onSelectReadMode={selectReadMode}
        parsePaperPending={parsePaperPending}
        parseProvider={paperParserProvider}
        summary={summary}
      />
      <TabsContent value="read" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            'grid h-full min-h-0 flex-1 grid-cols-1',
            outlineCollapsed
              ? 'lg:grid-cols-[3rem_minmax(0,1fr)_minmax(320px,0.75fr)]'
              : 'lg:grid-cols-[18rem_minmax(0,1fr)_minmax(320px,0.75fr)]',
          )}
          data-testid="paper-reader-read-layout"
        >
          <BlockOutline
            collapsed={outlineCollapsed}
            locale={locale}
            blocks={blocks}
            loadState={loadingBlocks ? 'loading' : blocksState.state}
            result={blocksState.result}
            error={blocksState.error}
            outlineItems={outlineItems}
            searchQuery={blockSearchQuery}
            searchResults={blockSearchResults}
            selectedBlockId={selectedBlockId}
            onParsePaper={canParsePaper ? handleParsePaper : undefined}
            onSearchQueryChange={setBlockSearchQuery}
            onToggleCollapsed={toggleOutlineCollapsed}
            parseProvider={paperParserProvider}
            parsePaperError={effectiveParseError}
            parsePaperPending={parsePaperPending}
            parseStatus={metadata.parseStatus}
            onSelectBlock={handleSelectBlock}
          />
          <PaperBlockReader
            annotationError={annotations.error}
            annotationLoadState={annotations.loadState}
            annotationsByBlockId={annotations.annotationsByBlockId}
            annotationResult={annotations.result}
            blocks={blocks}
            health={sidecarHealth}
            locale={locale}
            onCreateAnnotation={createAnnotation}
            onDeleteAnnotation={deleteAnnotation}
            onResetAnnotations={resetAnnotations}
            onSaveAnnotation={saveAnnotation}
            onSelectBlock={handleSelectBlock}
            selectedBlockId={selectedBlockId}
          />
          <PaperPdfPanel
            entry={entry}
            focusRequest={pdfFocusRequest}
            metadata={metadata}
            locale={locale}
            onCopyFilePath={onCopyFilePath}
            onOpenExternalFile={onOpenExternalFile}
            onRevealFile={onRevealFile}
          />
        </div>
      </TabsContent>
      <TabsContent value="marginalia" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            'grid h-full min-h-0 flex-1 grid-cols-1',
            outlineCollapsed
              ? 'xl:grid-cols-[3rem_minmax(360px,1fr)]'
              : 'xl:grid-cols-[18rem_minmax(0,1fr)]',
          )}
          data-testid="paper-reader-marginalia-layout"
        >
          <BlockOutline
            collapsed={outlineCollapsed}
            locale={locale}
            blocks={blocks}
            loadState={loadingBlocks ? 'loading' : blocksState.state}
            result={blocksState.result}
            error={blocksState.error}
            outlineItems={outlineItems}
            searchQuery={blockSearchQuery}
            searchResults={blockSearchResults}
            selectedBlockId={selectedBlockId}
            onParsePaper={canParsePaper ? handleParsePaper : undefined}
            onSearchQueryChange={setBlockSearchQuery}
            onToggleCollapsed={toggleOutlineCollapsed}
            parseProvider={paperParserProvider}
            parsePaperError={effectiveParseError}
            parsePaperPending={parsePaperPending}
            parseStatus={metadata.parseStatus}
            onSelectBlock={handleSelectBlock}
          />
          <div className="flex min-h-0 flex-col">
            <CurrentBlockPanel block={selectedBlock} locale={locale} />
            {pdfFocusRequest ? (
              <div
                className="border-b border-border bg-muted/25 px-4 py-2 text-xs text-muted-foreground"
                data-testid="paper-reader-marginalia-pdf-focus-request"
              >
                {translate(locale, 'paper.reader.pdfFocusRequested', {
                  block: pdfFocusRequest.blockId,
                  page: pdfFocusRequest.page,
                })}
              </div>
            ) : null}
            <MarginaliaPane
              canAddSelectedBlock={selectedBlockId !== null}
              contentState={marginaliaContent}
              locale={locale}
              onAddSelectedBlockToMarginalia={handleAddSelectedBlockToMarginaliaInPane}
              onCreateMarginalia={handleCreateMarginaliaInPane}
              onOpenMarginaliaInEditor={handleOpenMarginalia}
            />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}
