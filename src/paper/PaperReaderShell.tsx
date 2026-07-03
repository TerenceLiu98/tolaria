import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import {
  ArrowCounterClockwise,
  Check,
  ClipboardText,
  MagnifyingGlass,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { translate, type AppLocale, type TranslationKey } from '../lib/i18n'
import {
  trackPaperBlockCitationCopied,
  trackPaperReaderModeChanged,
  trackPaperReaderOpened,
} from '../lib/productAnalytics'
import type { VaultEntry } from '../types'
import { FilePreview } from '../components/FilePreview'
import { NoteSurface, type NoteSurfaceCommentAnchor } from '../components/NoteSurface'
import {
  CommentComposer,
  CommentThreadPanel,
} from '../components/comments/CommentUI'
import type { NoteComment } from '../comments/commentProvider'
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
import type { SourceBlock, SourceBlockLineError } from './sourceBlocks'
import {
  paperSidecarHealth,
  sourceBlockPrimaryText,
} from './paperReaderBlocks'
import {
  paperAnnotationToComment,
  paperCommentsByBlockId,
} from './paperCommentProvider'
import {
  isPaperAnnotationsError,
  paperAnnotationsErrorMessage,
  usePaperAnnotations,
  type AnnotationLoadState,
} from './usePaperAnnotations'

interface PaperReaderShellProps {
  entry: VaultEntry
  content: string
  editor: ReturnType<typeof useCreateBlockNote>
  entries: VaultEntry[]
  vaultPath?: string
  locale?: AppLocale
  onCopyFilePath?: (path: string) => void
  onOpenExternalFile?: (path: string) => void
  onNavigateWikilink: (target: string) => void
  onParsePaper?: (paperId: string) => void | Promise<void>
  paperParserProvider?: PaperParserProvider
  onRevealFile?: (path: string) => void
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error'
type ReaderMode = 'markdown' | 'pdf'

interface PdfFocusRequest {
  blockId: string
  page: number
}

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

function paperParseErrorMessage(error: unknown): string {
  if (isRecord(error) && typeof error.message === 'string') return error.message
  return error instanceof Error ? error.message : String(error)
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
  locale,
  metadata,
  onParsePaper,
  onSelectPdfMode,
  onSelectReadMode,
  parsePaperPending,
  parseProvider,
  summary,
}: {
  locale: AppLocale
  metadata: NonNullable<ReturnType<typeof paperMetadataForReader>>
  onParsePaper?: () => void
  onSelectPdfMode: () => void
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
            <TabsTrigger value="markdown" className="h-7 px-3 text-xs" onClick={onSelectReadMode}>
              {translate(locale, 'paper.reader.modeRead')}
            </TabsTrigger>
            <TabsTrigger value="pdf" className="h-7 px-3 text-xs" onClick={onSelectPdfMode}>
              PDF
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
}: {
  error: unknown
  loadState: AnnotationLoadState
  locale: AppLocale
  onResetAnnotations: () => void
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
  defaultKind = DEFAULT_ANNOTATION_KIND,
  locale,
  onCreateAnnotation,
}: {
  block: SourceBlock
  defaultKind?: PaperAnnotationKind
  locale: AppLocale
  onCreateAnnotation: (block: SourceBlock, input: {
    color: PaperAnnotationColor
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => void
}) {
  const [kind, setKind] = useState<PaperAnnotationKind>(defaultKind)
  const [color, setColor] = useState<PaperAnnotationColor>(DEFAULT_ANNOTATION_COLOR)
  const isDefaultComment = defaultKind === 'comment'

  const createAnnotation = useCallback((note: string) => {
    onCreateAnnotation(block, {
      color,
      kind,
      note: cleanOptionalNote(note),
      text: textSnapshotForAnnotation(block, kind),
    })
  }, [block, color, kind, onCreateAnnotation])

  return (
    <div
      className="grid gap-2 rounded-md border border-border/60 bg-muted/30 p-2"
      data-testid={`paper-reader-annotation-controls-${block.id}`}
    >
      {isDefaultComment ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <AnnotationKindSelect locale={locale} value={kind} onValueChange={setKind} />
          <AnnotationColorSelect locale={locale} value={color} onValueChange={setColor} />
        </div>
      )}
      <CommentComposer
        label={translate(locale, 'paper.reader.annotationNote')}
        placeholder={translate(locale, 'paper.reader.annotationNotePlaceholder')}
        submitLabel={kind === 'comment'
          ? translate(locale, 'paper.reader.addComment')
          : translate(locale, 'paper.reader.addAnnotation')}
        onSubmit={createAnnotation}
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

function BlockCommentThread({
  annotations,
  block,
  locale,
  onCreateAnnotation,
  onDeleteAnnotation,
  onSaveAnnotation,
  onCopyCitation,
  onClose,
}: {
  annotations: PaperAnnotation[]
  block: SourceBlock
  locale: AppLocale
  onCreateAnnotation: (block: SourceBlock, input: {
    color: PaperAnnotationColor
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => void
  onDeleteAnnotation: (annotationId: string) => void
  onSaveAnnotation: (annotation: PaperAnnotation) => void
  onCopyCitation: (block: SourceBlock) => void
  onClose: () => void
}) {
  const comments = annotations
    .map(paperAnnotationToComment)
    .filter((comment): comment is NoteComment => comment !== null)

  return (
    <CommentThreadPanel
      commentsListTestId={`paper-reader-annotations-${block.id}`}
      comments={comments}
      emptyText={translate(locale, 'paper.reader.noBlockComments')}
      closeLabel={translate(locale, 'window.close')}
      onClose={onClose}
      testId={`paper-reader-comment-thread-${block.id}`}
      title={translate(locale, 'paper.reader.commentThread')}
      actions={(
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onCopyCitation(block)}
        >
          <ClipboardText className="size-3.5" />
          {translate(locale, 'paper.reader.copyBlockCitation')}
        </Button>
      )}
      renderComment={(comment) => {
        const annotation = annotations.find((candidate) => candidate.id === comment.id)
        if (!annotation) return null
        return (
          <PaperAnnotationEditor
            key={annotation.id}
            annotation={annotation}
            locale={locale}
            onDeleteAnnotation={onDeleteAnnotation}
            onSaveAnnotation={onSaveAnnotation}
          />
        )
      }}
    >
      <BlockAnnotationComposer
        block={block}
        defaultKind="comment"
        locale={locale}
        onCreateAnnotation={onCreateAnnotation}
      />
    </CommentThreadPanel>
  )
}

async function writeClipboardText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
  await navigator.clipboard.writeText(text)
}

function PaperMarkdownNoteSurface({
  annotationError,
  annotationLoadState,
  annotationsByBlockId,
  blocks,
  blocksError,
  blocksLoadState,
  blocksReadResult,
  commentsByAnchorId,
  editor,
  entries,
  health,
  locale,
  onCloseCommentThread,
  onCreateAnnotation,
  onDeleteAnnotation,
  onNavigateWikilink,
  onResetAnnotations,
  onSaveAnnotation,
  onToggleCommentThread,
  openCommentBlockId,
  sourceEntry,
  vaultPath,
}: {
  annotationError: unknown
  annotationLoadState: AnnotationLoadState
  annotationsByBlockId: AnnotationsByBlockId
  blocks: SourceBlock[]
  blocksError: unknown
  blocksLoadState: LoadState
  blocksReadResult: PaperBlocksReadResult | null
  commentsByAnchorId: Record<string, NoteComment[]>
  editor: ReturnType<typeof useCreateBlockNote>
  entries: VaultEntry[]
  health: ReturnType<typeof paperSidecarHealth>
  locale: AppLocale
  onCloseCommentThread: () => void
  onCreateAnnotation: (block: SourceBlock, input: {
    color: PaperAnnotationColor
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => void
  onDeleteAnnotation: (annotationId: string) => void
  onNavigateWikilink: (target: string) => void
  onResetAnnotations: () => void
  onSaveAnnotation: (annotation: PaperAnnotation) => void
  onToggleCommentThread: (blockId: string) => void
  openCommentBlockId: string | null
  sourceEntry: VaultEntry
  vaultPath?: string
}) {
  const blocksById = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks])
  const commentAnchors = useMemo<NoteSurfaceCommentAnchor[]>(() => (
    blocks.map((block) => ({
      comments: commentsByAnchorId[block.id] ?? [],
      id: block.id,
      title: sourceBlockPrimaryText(block),
    }))
  ), [blocks, commentsByAnchorId])

  const copyCitation = useCallback((block: SourceBlock) => {
    const citation = formatBlockCitation({ paperId: block.paper_id, blockId: block.id })
    void writeClipboardText(citation)
      .then(() => trackPaperBlockCitationCopied())
      .catch((copyError: unknown) => {
        console.warn('[paper-reader] Failed to copy block citation:', copyError)
      })
  }, [])

  const renderCommentThread = useCallback((blockId: string) => {
    const block = blocksById.get(blockId)
    if (!block) return null
    return (
      <BlockCommentThread
        annotations={annotationsByBlockId[block.id] ?? []}
        block={block}
        locale={locale}
        onCopyCitation={copyCitation}
        onClose={onCloseCommentThread}
        onCreateAnnotation={onCreateAnnotation}
        onDeleteAnnotation={onDeleteAnnotation}
        onSaveAnnotation={onSaveAnnotation}
      />
    )
  }, [
    annotationsByBlockId,
    blocksById,
    copyCitation,
    locale,
    onCloseCommentThread,
    onCreateAnnotation,
    onDeleteAnnotation,
    onSaveAnnotation,
  ])

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="paper-reader-block-view">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">{translate(locale, 'paper.reader.readingView')}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {health.isZeroUsableBlocks ? <StatusPill value={translate(locale, 'paper.reader.zeroUsableBlocks')} /> : null}
          {health.hasMissingPageNumbers ? <StatusPill value={translate(locale, 'paper.reader.missingPageNumbers')} /> : null}
          {health.hasMinimallyNormalizedBlocks ? <StatusPill value={translate(locale, 'paper.reader.minimalBlocksWarning')} /> : null}
        </div>
      </div>
      <BlocksStateNotice
        locale={locale}
        loadState={blocksLoadState}
        result={blocksReadResult}
        error={blocksError}
      />
      <AnnotationStateNotice
        locale={locale}
        loadState={annotationLoadState}
        error={annotationError}
        onResetAnnotations={onResetAnnotations}
      />
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        data-testid="paper-reader-read-scroll-area"
      >
        <NoteSurface
          className="min-h-full flex-none"
          commentOptions={{
            anchors: commentAnchors,
            onOpenThread: onToggleCommentThread,
            renderThread: renderCommentThread,
            selectedAnchorId: openCommentBlockId,
          }}
          editable={false}
          editor={editor}
          entries={entries}
          locale={locale}
          onNavigateWikilink={onNavigateWikilink}
          sourceEntry={sourceEntry}
          vaultPath={vaultPath}
        />
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
  editor,
  entries,
  vaultPath,
  locale = 'en',
  onCopyFilePath,
  onOpenExternalFile,
  onNavigateWikilink,
  onParsePaper,
  paperParserProvider = 'none',
  onRevealFile,
}: PaperReaderShellProps) {
  const metadata = useMemo(() => paperMetadataForReader(content), [content])
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [openCommentBlockId, setOpenCommentBlockId] = useState<string | null>(null)
  const [readerMode, setReaderMode] = useState<ReaderMode>('markdown')
  const [blocksRefreshKey, setBlocksRefreshKey] = useState(0)
  const [pdfFocusRequest, setPdfFocusRequest] = useState<PdfFocusRequest | null>(null)
  const [parsePaperPending, setParsePaperPending] = useState(false)
  const handleReaderModeChange = useCallback((nextValue: string) => {
    if (nextValue === 'markdown' || nextValue === 'pdf') setReaderMode(nextValue)
  }, [])
  const selectReadMode = useCallback(() => setReaderMode('markdown'), [])
  const selectPdfMode = useCallback(() => setReaderMode('pdf'), [])
  const paperId = metadata?.paperId ?? null
  const blocksState = usePaperBlocks(vaultPath, paperId, blocksRefreshKey)
  const canParsePaper = Boolean(onParsePaper || vaultPath)
  const handleParsePaper = useCallback(() => {
    if (!paperId || (!onParsePaper && !vaultPath)) return

    setParsePaperPending(true)
    const parseRequest = onParsePaper
      ? onParsePaper(paperId)
      : parsePaper(vaultPath!, paperId)
    void Promise.resolve(parseRequest)
      .then(() => setBlocksRefreshKey((currentKey) => currentKey + 1))
      .catch((error: unknown) => {
        console.warn('[paper-reader] Failed to parse paper:', paperParseErrorMessage(error))
      })
      .finally(() => setParsePaperPending(false))
  }, [onParsePaper, paperId, vaultPath])
  const loadingBlocks = blocksState.state === 'loading' || (Boolean(vaultPath && paperId) && blocksState.state === 'idle')
  const summary = paperReaderSummary(
    blocksState.result,
    loadingBlocks,
    Boolean(vaultPath),
    blocksState.state === 'error',
    selectedBlockId,
  )
  const blocks = blocksState.result?.blocks ?? EMPTY_SOURCE_BLOCKS
  const sidecarHealth = useMemo(
    () => paperSidecarHealth(blocks, blocksState.result?.state ?? null),
    [blocks, blocksState.result?.state],
  )
  const handleSelectBlock = useCallback((blockId: string) => {
    setSelectedBlockId(blockId)
    const block = blocks.find((candidate) => candidate.id === blockId)
    if (block && Number.isInteger(block.page) && block.page > 0) {
      setPdfFocusRequest({ blockId: block.id, page: block.page })
    }
  }, [blocks])
  const closeCommentThread = useCallback(() => setOpenCommentBlockId(null), [])
  const handleToggleCommentThread = useCallback((blockId: string) => {
    setOpenCommentBlockId((currentBlockId) => {
      if (currentBlockId === blockId) return null
      handleSelectBlock(blockId)
      return blockId
    })
  }, [handleSelectBlock])
  const handleFocusBlockFromCitation = useCallback((blockId: string) => {
    handleSelectBlock(blockId)
    setOpenCommentBlockId(blockId)
  }, [handleSelectBlock])
  const annotations = usePaperAnnotations(vaultPath, paperId)
  const commentsByAnchorId = useMemo(
    () => paperCommentsByBlockId(annotations.annotations),
    [annotations.annotations],
  )
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

  useBlockCitationFocus(paperId, handleFocusBlockFromCitation)
  useReaderOpenedAnalytics(paperId, summary.blocksState)
  useReaderModeAnalytics(readerMode)

  if (!metadata) return <InvalidPaperMetadata entry={entry} locale={locale} />

  return (
    <Tabs
      value={readerMode}
      onValueChange={handleReaderModeChange}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
      data-testid="paper-reader-shell"
    >
      <PaperMetadataPanel
        locale={locale}
        metadata={metadata}
        onParsePaper={canParsePaper ? handleParsePaper : undefined}
        onSelectPdfMode={selectPdfMode}
        onSelectReadMode={selectReadMode}
        parsePaperPending={parsePaperPending}
        parseProvider={paperParserProvider}
        summary={summary}
      />
      <TabsContent value="markdown" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex h-full min-h-0 flex-1"
          data-testid="paper-reader-markdown-layout"
        >
          <PaperMarkdownNoteSurface
            annotationError={annotations.error}
            annotationLoadState={annotations.loadState}
            annotationsByBlockId={annotations.annotationsByBlockId}
            blocks={blocks}
            blocksError={blocksState.error}
            blocksLoadState={loadingBlocks ? 'loading' : blocksState.state}
            blocksReadResult={blocksState.result}
            commentsByAnchorId={commentsByAnchorId}
            editor={editor}
            entries={entries}
            health={sidecarHealth}
            locale={locale}
            onCloseCommentThread={closeCommentThread}
            onCreateAnnotation={createAnnotation}
            onDeleteAnnotation={deleteAnnotation}
            onNavigateWikilink={onNavigateWikilink}
            onResetAnnotations={resetAnnotations}
            onSaveAnnotation={saveAnnotation}
            onToggleCommentThread={handleToggleCommentThread}
            openCommentBlockId={openCommentBlockId}
            sourceEntry={entry}
            vaultPath={vaultPath}
          />
        </div>
      </TabsContent>
      <TabsContent value="pdf" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex h-full min-h-0 flex-1"
          data-testid="paper-reader-pdf-layout"
        >
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
    </Tabs>
  )
}
