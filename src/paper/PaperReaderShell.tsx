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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { translate, type AppLocale } from '../lib/i18n'
import {
  trackPaperBlockCitationCopied,
  trackPaperReaderModeChanged,
  trackPaperReaderOpened,
} from '../lib/productAnalytics'
import type { VaultEntry } from '../types'
import type { AiSelectedTextContext } from '../utils/ai-context'
import { FilePreview } from '../components/FilePreview'
import { NoteSurface, type NoteSurfaceCommentAnchor } from '../components/NoteSurface'
import {
  CommentComposer,
  CommentThreadPanel,
} from '../components/comments/CommentUI'
import type { NoteComment } from '../comments/commentProvider'
import { parsePaper } from './parser'
import type { PaperParserProvider } from './parserSettings'
import {
  applyPaperMetadataCandidate,
  extractPaperMetadata,
  readPaperMetadata,
  refreshPaperMetadata,
  savePaperMetadata,
  type PaperMetadata as ResolvedPaperMetadata,
  type PaperMetadataValues,
  type PaperMetadataReadResult,
} from './metadata'
import { formatBlockCitation } from './blockCitations'
import {
  BLOCK_CITATION_NAVIGATE_EVENT,
  clearPendingBlockFocus,
  getPendingBlockFocus,
  type BlockCitationNavigationEvent,
} from './blockCitationNavigation'
import { loadPaperBlocks, type PaperBlocksError, type PaperBlocksReadResult } from './blocks'
import {
  createBlockAnnotationId,
  type AnnotationsByBlockId,
  type PaperAnnotation,
  type PaperAnnotationReaction,
  type PaperAnnotationKind,
  type PaperAnnotationReply,
} from './annotations'
import {
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
  onEditorChange?: () => void
  onOpenExternalFile?: (path: string) => void
  onNavigateWikilink: (target: string) => void
  onSelectedTextContextChange?: (context: AiSelectedTextContext | null) => void
  onParsePaper?: (paperId: string, options?: { force?: boolean }) => void | Promise<void>
  paperParserProvider?: PaperParserProvider
  onRevealFile?: (path: string) => void
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error'
type ReaderMode = 'markdown' | 'pdf'
type PaperActionConfirmation = 'parse' | 'refreshMetadata'
type CommentThreadFilter = 'all' | 'open' | 'resolved'
type CommentThreadSort = 'newest' | 'oldest'

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

interface MetadataLoadState {
  result: PaperMetadataReadResult | null
  error: unknown
  state: LoadState
}

interface SettledMetadataLoadState extends MetadataLoadState {
  key: string
  state: 'loaded' | 'error'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function cssAttributeValue(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/gu, '\\$&')
}

function sourceBlockEditorBlockId(
  editor: ReturnType<typeof useCreateBlockNote>,
  sourceBlockIndex: number,
): string | null {
  const editorBlock = editor.document?.[sourceBlockIndex]
  return isRecord(editorBlock) && typeof editorBlock.id === 'string' ? editorBlock.id : null
}

function queryBlockTarget(container: Element | null | undefined, selector: string): HTMLElement | null {
  const target = container?.querySelector(selector)
  return target instanceof HTMLElement ? target : null
}

function scrollPaperMarkdownBlockIntoView({
  blockId,
  blocks,
  container,
  editor,
}: {
  blockId: string
  blocks: readonly SourceBlock[]
  container: HTMLElement | null
  editor: ReturnType<typeof useCreateBlockNote>
}) {
  const sourceBlockIndex = blocks.findIndex((block) => block.id === blockId)
  const editorBlockId = sourceBlockIndex >= 0 ? sourceBlockEditorBlockId(editor, sourceBlockIndex) : null
  const editorTarget = editorBlockId
    ? queryBlockTarget(editor.domElement, `[data-id="${cssAttributeValue(editorBlockId)}"]`)
    : null
  const sourceBlockTarget = queryBlockTarget(
    container,
    `[data-paper-source-block-id="${cssAttributeValue(blockId)}"]`,
  )

  const target = editorTarget ?? sourceBlockTarget
  target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
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
    return { result: settledLoadState?.result ?? null, error: null, state: 'loading' }
  }

  return settledLoadState
}

function usePaperMetadata(vaultPath: string | undefined, paperId: string | null, refreshKey: number): MetadataLoadState {
  const requestKey = vaultPath && paperId ? `${vaultPath}\u0000${paperId}\u0000${refreshKey}` : null
  const [settledLoadState, setSettledLoadState] = useState<SettledMetadataLoadState | null>(null)

  useEffect(() => {
    if (!vaultPath || !paperId || !requestKey) return

    let cancelled = false
    void readPaperMetadata(vaultPath, paperId)
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
    return { result: settledLoadState?.result ?? null, error: null, state: 'loading' }
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

function metadataConfidenceLabel(confidence: number | null | undefined): string {
  if (!Number.isFinite(confidence)) return '0%'
  return `${Math.round(Math.max(0, Math.min(1, Number(confidence))) * 100)}%`
}

interface PaperMetadataFormState {
  title: string
  authors: string
  year: string
  venue: string
  venueShort: string
  doi: string
  arxivId: string
}

function metadataFormState(metadata: ResolvedPaperMetadata | null): PaperMetadataFormState {
  return {
    title: metadata?.title ?? '',
    authors: metadata?.authors.join('\n') ?? '',
    year: metadata?.year ? String(metadata.year) : '',
    venue: metadata?.venue ?? '',
    venueShort: metadata?.venueShort ?? '',
    doi: metadata?.doi ?? '',
    arxivId: metadata?.arxivId ?? '',
  }
}

function cleanOptional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function metadataValuesFromForm(
  form: PaperMetadataFormState,
  current: ResolvedPaperMetadata | null,
): PaperMetadataValues {
  const year = Number.parseInt(form.year.trim(), 10)
  return {
    title: cleanOptional(form.title),
    authors: form.authors
      .split(/[\n,;]/u)
      .map(author => author.trim())
      .filter(author => author.length > 0),
    year: Number.isFinite(year) ? year : null,
    venue: cleanOptional(form.venue),
    venueShort: cleanOptional(form.venueShort),
    venueType: current?.venueType ?? null,
    publicationDate: current?.publicationDate ?? null,
    publicationStage: current?.publicationStage ?? null,
    doi: cleanOptional(form.doi),
    arxivId: cleanOptional(form.arxivId),
    abstract: current?.abstract ?? null,
  }
}

function metadataValuesFromCurrent(current: ResolvedPaperMetadata): PaperMetadataValues {
  return {
    title: current.title ?? null,
    authors: current.authors,
    year: current.year ?? null,
    venue: current.venue ?? null,
    venueShort: current.venueShort ?? null,
    venueType: current.venueType ?? null,
    publicationDate: current.publicationDate ?? null,
    publicationStage: current.publicationStage ?? null,
    doi: current.doi ?? null,
    arxivId: current.arxivId ?? null,
    abstract: current.abstract ?? null,
  }
}

const EMPTY_SOURCE_BLOCKS: SourceBlock[] = []
const PAPER_COMMENT_KIND: PaperAnnotationKind = 'comment'
const PAPER_COMMENT_REACTION_EMOJI = '👍'

function cleanOptionalNote(note: string): string | undefined {
  const trimmed = note.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function activeAnnotationReplies(annotation: PaperAnnotation): PaperAnnotationReply[] {
  return Array.isArray(annotation.replies)
    ? annotation.replies.filter((reply) => typeof reply.deleted_at !== 'string')
    : []
}

function activeAnnotationReactions(annotation: PaperAnnotation): PaperAnnotationReaction[] {
  return Array.isArray(annotation.reactions)
    ? annotation.reactions.filter((reaction) => typeof reaction.deleted_at !== 'string')
    : []
}

function createAnnotationReply(note: string, now = new Date()): PaperAnnotationReply {
  return {
    id: createBlockAnnotationId().replace(/^ann_/u, 'reply_'),
    note,
    created_at: now.toISOString(),
  }
}

function createAnnotationReaction(emoji: string, now = new Date()): PaperAnnotationReaction {
  return {
    emoji,
    count: 1,
    created_at: now.toISOString(),
  }
}

function annotationIsResolved(annotation: PaperAnnotation): boolean {
  return typeof annotation.resolved_at === 'string' && annotation.resolved_at.trim().length > 0
}

function annotationThreadTimestamp(annotation: PaperAnnotation): number {
  const timestamp = Date.parse(annotation.updated_at ?? annotation.created_at)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function PaperActionConfirmDialog({
  action,
  locale,
  onCancel,
  onConfirm,
}: {
  action: PaperActionConfirmation | null
  locale: AppLocale
  onCancel: () => void
  onConfirm: () => void
}) {
  const titleKey = action === 'parse'
    ? 'paper.reader.confirmParseAgainTitle'
    : 'paper.reader.confirmRefreshMetadataTitle'
  const messageKey = action === 'parse'
    ? 'paper.reader.confirmParseAgainMessage'
    : 'paper.reader.confirmRefreshMetadataMessage'
  const confirmKey = action === 'parse'
    ? 'paper.reader.confirmParseAgainAction'
    : 'paper.reader.confirmRefreshMetadataAction'

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate(locale, titleKey)}</DialogTitle>
          <DialogDescription>{translate(locale, messageKey)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {translate(locale, 'common.cancel')}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {translate(locale, confirmKey)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PaperMetadataPanel({
  locale,
  metadataError,
  metadataReadyForAction,
  metadataPending,
  metadataResult,
  metadata,
  onApplyMetadataCandidate,
  onSaveMetadata,
  onParsePaper,
  onRefreshMetadata,
  onSelectPdfMode,
  onSelectReadMode,
  parsePaperPending,
  parseProvider,
  summary,
}: {
  locale: AppLocale
  metadataError: unknown
  metadataReadyForAction: boolean
  metadataPending: boolean
  metadataResult: PaperMetadataReadResult | null
  metadata: NonNullable<ReturnType<typeof paperMetadataForReader>>
  onApplyMetadataCandidate: (candidateId: string) => void
  onSaveMetadata: (values: PaperMetadataValues) => void
  onParsePaper?: () => void
  onRefreshMetadata?: () => void
  onSelectPdfMode: () => void
  onSelectReadMode: () => void
  parsePaperPending: boolean
  parseProvider?: PaperParserProvider
  summary: ReturnType<typeof paperReaderSummary>
}) {
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false)
  const resolvedMetadata = metadataResult?.metadata ?? null

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
          {onParsePaper ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={parsePaperPending}
              onClick={onParsePaper}
            >
              <MagnifyingGlass className="size-4" />
              {paperParseButtonLabel(locale, parseProvider, parsePaperPending)}
            </Button>
          ) : null}
          {onRefreshMetadata ? (
            <Dialog open={metadataDialogOpen} onOpenChange={setMetadataDialogOpen}>
              <Button type="button" variant="secondary" size="sm" onClick={() => setMetadataDialogOpen(true)}>
                <ClipboardText className="size-4" />
                {translate(locale, 'paper.reader.metadata')}
              </Button>
              <DialogContent className="max-h-[calc(100vh-4rem)] w-[min(42rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-2xl">
                <DialogHeader className="min-w-0">
                  <DialogTitle>{translate(locale, 'paper.reader.metadata')}</DialogTitle>
                  <DialogDescription>{translate(locale, 'paper.reader.metadataEditDescription')}</DialogDescription>
                </DialogHeader>
                <PaperMetadataInspector
                  locale={locale}
                  metadata={resolvedMetadata}
                  metadataError={metadataError}
                  metadataPending={metadataPending}
                  metadataReadyForAction={metadataReadyForAction}
                  onApplyCandidate={onApplyMetadataCandidate}
                  onRefreshMetadata={onRefreshMetadata}
                  onSaveMetadata={onSaveMetadata}
                />
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>
      <span className="sr-only" data-testid="paper-reader-paper-id">{metadata.paperId}</span>
      <span className="sr-only" data-testid="paper-reader-selected-block">{summary.selectedBlockId ?? translate(locale, 'paper.reader.none')}</span>
    </section>
  )
}

function PaperMetadataInspector({
  locale,
  metadata,
  metadataError,
  metadataPending,
  metadataReadyForAction,
  onApplyCandidate,
  onRefreshMetadata,
  onSaveMetadata,
}: {
  locale: AppLocale
  metadata: ResolvedPaperMetadata | null
  metadataError: unknown
  metadataPending: boolean
  metadataReadyForAction: boolean
  onApplyCandidate: (candidateId: string) => void
  onRefreshMetadata?: () => void
  onSaveMetadata: (values: PaperMetadataValues) => void
}) {
  const [form, setForm] = useState(() => metadataFormState(metadata))
  useEffect(() => {
    setForm(metadataFormState(metadata))
  }, [metadata])

  if (metadataError) {
    return (
      <div className="grid gap-3" data-testid="paper-reader-metadata-inspector">
        <p className="text-xs text-destructive" data-testid="paper-reader-metadata-error">
          {paperParseErrorMessage(metadataError)}
        </p>
        {onRefreshMetadata ? (
          <Button type="button" variant="secondary" size="sm" disabled={metadataPending || !metadataReadyForAction} onClick={onRefreshMetadata}>
            <ArrowCounterClockwise className="size-4" />
            {metadataPending ? translate(locale, 'paper.reader.metadataRefreshing') : translate(locale, 'paper.reader.refreshMetadata')}
          </Button>
        ) : null}
      </div>
    )
  }
  if (!metadata) {
    return (
      <div className="grid gap-3" data-testid="paper-reader-metadata-inspector">
        <p className="text-sm text-muted-foreground">{translate(locale, 'paper.reader.metadataUnavailable')}</p>
        {onRefreshMetadata ? (
          <Button type="button" variant="secondary" size="sm" disabled={metadataPending || !metadataReadyForAction} onClick={onRefreshMetadata}>
            <ArrowCounterClockwise className="size-4" />
            {metadataPending ? translate(locale, 'paper.reader.metadataRefreshing') : translate(locale, 'paper.reader.refreshMetadata')}
          </Button>
        ) : null}
      </div>
    )
  }

  const details = [
    metadata.authors.length > 0 ? metadata.authors.join(', ') : null,
    metadata.year ? String(metadata.year) : null,
    metadata.venueShort ?? metadata.venue,
    metadata.doi ? `DOI ${metadata.doi}` : null,
    metadata.arxivId ? `arXiv ${metadata.arxivId}` : null,
  ].filter((detail): detail is string => Boolean(detail))

  return (
    <section className="grid min-w-0 gap-4 overflow-y-auto overflow-x-hidden pr-1" data-testid="paper-reader-metadata-inspector">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{translate(locale, 'paper.reader.metadata')}</p>
          {details.length > 0 ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{details.join(' · ')}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{translate(locale, 'paper.reader.metadataUnavailable')}</p>
          )}
        </div>
        <StatusPill value={translate(locale, 'paper.reader.metadataConfidence', { confidence: metadataConfidenceLabel(metadata.confidence) })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onRefreshMetadata ? (
          <Button type="button" variant="secondary" size="xs" disabled={metadataPending || !metadataReadyForAction} onClick={onRefreshMetadata}>
            <ArrowCounterClockwise className="size-4" />
            {metadataPending ? translate(locale, 'paper.reader.metadataRefreshing') : translate(locale, 'paper.reader.refreshMetadata')}
          </Button>
        ) : null}
        {metadata.status === 'needs_review' ? (
          <Button type="button" variant="outline" size="xs" onClick={() => onSaveMetadata(metadataValuesFromCurrent(metadata))}>
            {translate(locale, 'paper.reader.keepCurrentMetadata')}
          </Button>
        ) : null}
      </div>
      {metadata.candidates.length > 0 ? (
        <div className="mt-3 grid min-w-0 gap-2" data-testid="paper-reader-metadata-candidates">
          <p className="text-xs font-medium text-foreground">{translate(locale, 'paper.reader.metadataNeedsReview')}</p>
          {metadata.candidates.map((candidate) => (
            <div key={candidate.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md bg-background/70 px-2 py-2 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">
                {candidate.metadata.title ?? candidate.reason}
              </span>
              <Button type="button" variant="secondary" size="xs" onClick={() => onApplyCandidate(candidate.id)}>
                {translate(locale, 'paper.reader.applyMetadataCandidate')}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid min-w-0 gap-3">
        <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
          {translate(locale, 'paper.reader.metadataTitle')}
          <Input value={form.title} onChange={(event) => setForm(current => ({ ...current, title: event.target.value }))} />
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
          {translate(locale, 'paper.reader.metadataAuthors')}
          <Textarea
            className="min-h-20 min-w-0 resize-y"
            value={form.authors}
            onChange={(event) => setForm(current => ({ ...current, authors: event.target.value }))}
          />
        </label>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
            {translate(locale, 'paper.reader.metadataYear')}
            <Input value={form.year} onChange={(event) => setForm(current => ({ ...current, year: event.target.value }))} />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
            {translate(locale, 'paper.reader.metadataVenue')}
            <Input value={form.venue} onChange={(event) => setForm(current => ({ ...current, venue: event.target.value }))} />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
            {translate(locale, 'paper.reader.metadataVenueShort')}
            <Input value={form.venueShort} onChange={(event) => setForm(current => ({ ...current, venueShort: event.target.value }))} />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
            {translate(locale, 'paper.reader.metadataDoi')}
            <Input value={form.doi} onChange={(event) => setForm(current => ({ ...current, doi: event.target.value }))} />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground sm:col-span-2">
            {translate(locale, 'paper.reader.metadataArxivId')}
            <Input value={form.arxivId} onChange={(event) => setForm(current => ({ ...current, arxivId: event.target.value }))} />
          </label>
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">{translate(locale, 'common.cancel')}</Button>
        </DialogClose>
        <Button type="button" onClick={() => onSaveMetadata(metadataValuesFromForm(form, metadata))}>
          {translate(locale, 'common.save')}
        </Button>
      </DialogFooter>
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
    return null
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

function BlockAnnotationComposer({
  block,
  locale,
  onCreateAnnotation,
  selectedQuote,
}: {
  block: SourceBlock
  locale: AppLocale
  onCreateAnnotation: (block: SourceBlock, input: {
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => void
  selectedQuote?: string | null
}) {
  const createAnnotation = useCallback((note: string) => {
    onCreateAnnotation(block, {
      kind: PAPER_COMMENT_KIND,
      note: cleanOptionalNote(note),
      text: cleanOptionalNote(selectedQuote ?? undefined),
    })
  }, [block, onCreateAnnotation, selectedQuote])

  return (
    <div
      className="grid gap-2 rounded-md border border-border/60 bg-muted/30 p-2"
      data-testid={`paper-reader-annotation-controls-${block.id}`}
    >
      {selectedQuote ? (
        <blockquote
          className="line-clamp-3 rounded border-l-2 border-primary/50 bg-background/70 px-2 py-1 text-xs text-muted-foreground"
          data-testid={`paper-reader-comment-selected-quote-${block.id}`}
        >
          {selectedQuote}
        </blockquote>
      ) : null}
      <CommentComposer
        label={translate(locale, 'paper.reader.addComment')}
        placeholder={translate(locale, 'paper.reader.addComment')}
        submitLabel={translate(locale, 'paper.reader.addComment')}
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
  const [note, setNote] = useState(annotation.note ?? annotation.text ?? '')
  const isResolved = typeof annotation.resolved_at === 'string' && annotation.resolved_at.trim().length > 0
  const reactions = activeAnnotationReactions(annotation)
  const replies = activeAnnotationReplies(annotation)
  const hasPrimaryReaction = reactions.some((reaction) => reaction.emoji === PAPER_COMMENT_REACTION_EMOJI && reaction.count > 0)

  const saveAnnotation = useCallback(() => {
    onSaveAnnotation({
      ...annotation,
      note: cleanOptionalNote(note),
      updated_at: new Date().toISOString(),
    })
  }, [annotation, note, onSaveAnnotation])
  const toggleResolved = useCallback(() => {
    onSaveAnnotation({
      ...annotation,
      resolved_at: isResolved ? undefined : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }, [annotation, isResolved, onSaveAnnotation])
  const addReply = useCallback((replyNote: string) => {
    const cleanedReply = cleanOptionalNote(replyNote)
    if (!cleanedReply) return
    const now = new Date().toISOString()
    onSaveAnnotation({
      ...annotation,
      replies: [
        ...activeAnnotationReplies(annotation),
        createAnnotationReply(cleanedReply, new Date(now)),
      ],
      updated_at: now,
    })
  }, [annotation, onSaveAnnotation])
  const toggleReaction = useCallback(() => {
    const now = new Date().toISOString()
    const currentReactions = activeAnnotationReactions(annotation)
    const hasCurrentReaction = currentReactions.some((reaction) => reaction.emoji === PAPER_COMMENT_REACTION_EMOJI && reaction.count > 0)
    onSaveAnnotation({
      ...annotation,
      reactions: hasCurrentReaction
        ? currentReactions
          .filter((reaction) => reaction.emoji !== PAPER_COMMENT_REACTION_EMOJI)
        : [
          ...currentReactions,
          createAnnotationReaction(PAPER_COMMENT_REACTION_EMOJI, new Date(now)),
        ],
      updated_at: now,
    })
  }, [annotation, onSaveAnnotation])

  return (
    <li
      className="grid gap-2 rounded-md bg-muted/60 px-2 py-2 text-xs text-muted-foreground"
      data-testid={`paper-reader-annotation-editor-${annotation.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isResolved ? (
          <span
            className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            data-testid={`paper-reader-annotation-resolved-${annotation.id}`}
          >
            {translate(locale, 'paper.reader.commentResolved')}
          </span>
        ) : null}
        {replies.length > 0 ? (
          <span
            className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            data-testid={`paper-reader-annotation-reply-count-${annotation.id}`}
          >
            {translate(locale, 'paper.reader.commentReplies', { count: replies.length })}
          </span>
        ) : null}
        {reactions.map((reaction) => (
          <span
            key={reaction.emoji}
            className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            data-testid={`paper-reader-annotation-reaction-${annotation.id}-${reaction.emoji}`}
          >
            {reaction.emoji} {reaction.count}
          </span>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="xs"
          onClick={saveAnnotation}
        >
          <Check className="size-3.5" />
          {translate(locale, 'common.save')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={toggleResolved}
        >
          {isResolved ? translate(locale, 'paper.reader.reopenComment') : translate(locale, 'paper.reader.resolveComment')}
        </Button>
        <Button
          type="button"
          variant={hasPrimaryReaction ? 'secondary' : 'ghost'}
          size="xs"
          aria-pressed={hasPrimaryReaction}
          onClick={toggleReaction}
        >
          {hasPrimaryReaction
            ? translate(locale, 'paper.reader.removeCommentReaction', { emoji: PAPER_COMMENT_REACTION_EMOJI })
            : translate(locale, 'paper.reader.reactToComment', { emoji: PAPER_COMMENT_REACTION_EMOJI })}
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
        aria-label={translate(locale, 'paper.reader.addComment')}
        className="min-h-14 resize-y text-xs"
        placeholder={translate(locale, 'paper.reader.addComment')}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
      />
      {replies.length > 0 ? (
        <ul
          className="grid gap-1 border-l border-border/70 pl-2"
          data-testid={`paper-reader-annotation-replies-${annotation.id}`}
        >
          {replies.map((reply) => (
            <li key={reply.id} className="rounded bg-background/70 px-2 py-1 text-xs text-foreground">
              {reply.note}
            </li>
          ))}
        </ul>
      ) : null}
      <CommentComposer
        label={translate(locale, 'paper.reader.replyToComment')}
        placeholder={translate(locale, 'paper.reader.replyToComment')}
        submitLabel={translate(locale, 'paper.reader.replyToComment')}
        onSubmit={addReply}
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
  selectedQuote,
}: {
  annotations: PaperAnnotation[]
  block: SourceBlock
  locale: AppLocale
  onCreateAnnotation: (block: SourceBlock, input: {
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => void
  onDeleteAnnotation: (annotationId: string) => void
  onSaveAnnotation: (annotation: PaperAnnotation) => void
  onCopyCitation: (block: SourceBlock) => void
  onClose: () => void
  selectedQuote?: string | null
}) {
  const [filter, setFilter] = useState<CommentThreadFilter>('all')
  const [sort, setSort] = useState<CommentThreadSort>('newest')
  const visibleAnnotations = useMemo(() => {
    const filteredAnnotations = annotations.filter((annotation) => {
      if (filter === 'open') return !annotationIsResolved(annotation)
      if (filter === 'resolved') return annotationIsResolved(annotation)
      return true
    })
    return [...filteredAnnotations].sort((left, right) => {
      const delta = annotationThreadTimestamp(left) - annotationThreadTimestamp(right)
      return sort === 'oldest' ? delta : -delta
    })
  }, [annotations, filter, sort])
  const comments = visibleAnnotations
    .map(paperAnnotationToComment)
    .filter((comment): comment is NoteComment => comment !== null)
  const emptyText = annotations.length === 0
    ? translate(locale, 'paper.reader.noBlockComments')
    : translate(locale, 'paper.reader.noMatchingBlockComments')
  const filterOptions: Array<{ label: string; value: CommentThreadFilter }> = [
    { label: translate(locale, 'paper.reader.commentFilterAll'), value: 'all' },
    { label: translate(locale, 'paper.reader.commentFilterOpen'), value: 'open' },
    { label: translate(locale, 'paper.reader.commentFilterResolved'), value: 'resolved' },
  ]

  return (
    <CommentThreadPanel
      commentsListTestId={`paper-reader-annotations-${block.id}`}
      comments={comments}
      emptyText={emptyText}
      closeLabel={translate(locale, 'window.close')}
      onClose={onClose}
      testId={`paper-reader-comment-thread-${block.id}`}
      title={translate(locale, 'paper.reader.commentThread')}
      toolbar={(
        <div className="flex flex-wrap items-center gap-1" data-testid={`paper-reader-comment-thread-controls-${block.id}`}>
          {filterOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={filter === option.value ? 'secondary' : 'ghost'}
              size="xs"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setSort(sort === 'newest' ? 'oldest' : 'newest')}
          >
            {sort === 'newest'
              ? translate(locale, 'paper.reader.commentSortNewest')
              : translate(locale, 'paper.reader.commentSortOldest')}
          </Button>
        </div>
      )}
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
        const annotation = visibleAnnotations.find((candidate) => candidate.id === comment.id)
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
        locale={locale}
        onCreateAnnotation={onCreateAnnotation}
        selectedQuote={selectedQuote}
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
  onEditorChange,
  onNavigateWikilink,
  onSelectedTextContextChange,
  onResetAnnotations,
  onSaveAnnotation,
  onToggleCommentThread,
  openCommentBlockId,
  selectedBlockId,
  selectedTextContext,
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
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => void
  onDeleteAnnotation: (annotationId: string) => void
  onEditorChange?: () => void
  onNavigateWikilink: (target: string) => void
  onSelectedTextContextChange?: (context: AiSelectedTextContext | null) => void
  onResetAnnotations: () => void
  onSaveAnnotation: (annotation: PaperAnnotation) => void
  onToggleCommentThread: (blockId: string) => void
  openCommentBlockId: string | null
  selectedBlockId: string | null
  selectedTextContext: AiSelectedTextContext | null
  sourceEntry: VaultEntry
  vaultPath?: string
}) {
  const readScrollAreaRef = useRef<HTMLDivElement>(null)
  const blocksById = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks])
  const commentAnchors = useMemo<NoteSurfaceCommentAnchor[]>(() => (
    blocks.map((block) => ({
      comments: commentsByAnchorId[block.id] ?? [],
      id: block.id,
      title: sourceBlockPrimaryText(block),
    }))
  ), [blocks, commentsByAnchorId])

  useEffect(() => {
    if (!selectedBlockId) return
    const animationFrame = requestAnimationFrame(() => {
      scrollPaperMarkdownBlockIntoView({
        blockId: selectedBlockId,
        blocks,
        container: readScrollAreaRef.current,
        editor,
      })
    })
    return () => cancelAnimationFrame(animationFrame)
  }, [blocks, editor, selectedBlockId])

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
    const selectedQuote = selectedTextContext?.kind === 'text'
      && selectedTextContext.entryPath === sourceEntry.path
      ? selectedTextContext.text.trim()
      : null
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
        selectedQuote={selectedQuote}
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
    selectedTextContext,
    sourceEntry.path,
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
        ref={readScrollAreaRef}
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
          editable={true}
          editor={editor}
          entries={entries}
          locale={locale}
          onChange={onEditorChange}
          onNavigateWikilink={onNavigateWikilink}
          onSelectedTextContextChange={onSelectedTextContextChange}
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
  onEditorChange,
  onOpenExternalFile,
  onNavigateWikilink,
  onSelectedTextContextChange,
  onParsePaper,
  paperParserProvider = 'none',
  onRevealFile,
}: PaperReaderShellProps) {
  const metadata = useMemo(() => paperMetadataForReader(content), [content])
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [openCommentBlockId, setOpenCommentBlockId] = useState<string | null>(null)
  const [readerMode, setReaderMode] = useState<ReaderMode>('markdown')
  const [blocksRefreshKey, setBlocksRefreshKey] = useState(0)
  const [metadataRefreshKey, setMetadataRefreshKey] = useState(0)
  const [pdfFocusRequest, setPdfFocusRequest] = useState<PdfFocusRequest | null>(null)
  const [parsePaperPending, setParsePaperPending] = useState(false)
  const [metadataPending, setMetadataPending] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<PaperActionConfirmation | null>(null)
  const [selectedPaperTextContext, setSelectedPaperTextContext] = useState<AiSelectedTextContext | null>(null)
  const autoMetadataRequestRef = useRef<string | null>(null)
  const handleReaderModeChange = useCallback((nextValue: string) => {
    if (nextValue === 'markdown' || nextValue === 'pdf') setReaderMode(nextValue)
  }, [])
  const selectReadMode = useCallback(() => setReaderMode('markdown'), [])
  const selectPdfMode = useCallback(() => setReaderMode('pdf'), [])
  const paperId = metadata?.paperId ?? null
  const blocksState = usePaperBlocks(vaultPath, paperId, blocksRefreshKey)
  const paperMetadataState = usePaperMetadata(vaultPath, paperId, metadataRefreshKey)
  const canShowParsePaper = Boolean(onParsePaper || vaultPath)
  const canRefreshMetadata = Boolean(vaultPath && paperId)
  const refreshMetadata = useCallback(() => {
    if (!vaultPath || !paperId) return
    setMetadataPending(true)
    void refreshPaperMetadata(vaultPath, paperId)
      .then(() => setMetadataRefreshKey((currentKey) => currentKey + 1))
      .catch((error: unknown) => {
        console.warn('[paper-reader] Failed to refresh paper metadata:', paperParseErrorMessage(error))
      })
      .finally(() => setMetadataPending(false))
  }, [paperId, vaultPath])
  const handleApplyMetadataCandidate = useCallback((candidateId: string) => {
    if (!vaultPath || !paperId) return
    setMetadataPending(true)
    void applyPaperMetadataCandidate(vaultPath, paperId, candidateId)
      .then(() => setMetadataRefreshKey((currentKey) => currentKey + 1))
      .catch((error: unknown) => {
        console.warn('[paper-reader] Failed to apply paper metadata candidate:', paperParseErrorMessage(error))
      })
      .finally(() => setMetadataPending(false))
  }, [paperId, vaultPath])
  const handleSaveMetadata = useCallback((values: PaperMetadataValues) => {
    if (!vaultPath || !paperId) return
    setMetadataPending(true)
    void savePaperMetadata(vaultPath, paperId, values)
      .then(() => setMetadataRefreshKey((currentKey) => currentKey + 1))
      .catch((error: unknown) => {
        console.warn('[paper-reader] Failed to save paper metadata:', paperParseErrorMessage(error))
      })
      .finally(() => setMetadataPending(false))
  }, [paperId, vaultPath])
  useEffect(() => {
    if (!vaultPath || !paperId || paperMetadataState.state !== 'loaded') return
    if (paperMetadataState.result?.state !== 'missing') return
    const requestKey = `${vaultPath}\u0000${paperId}`
    if (autoMetadataRequestRef.current === requestKey) return
    autoMetadataRequestRef.current = requestKey
    void extractPaperMetadata(vaultPath, paperId)
      .then(() => setMetadataRefreshKey((currentKey) => currentKey + 1))
      .catch((error: unknown) => {
        console.warn('[paper-reader] Failed to extract paper metadata:', paperParseErrorMessage(error))
      })
  }, [paperId, paperMetadataState.result?.state, paperMetadataState.state, vaultPath])
  const parsePaperFromReader = useCallback((options: { force?: boolean } = {}) => {
    if (!paperId || (!onParsePaper && !vaultPath)) return

    setParsePaperPending(true)
    const force = options.force ?? false
    const parseRequest = onParsePaper
      ? onParsePaper(paperId, { force })
      : parsePaper(vaultPath!, paperId, undefined, { force })
    void Promise.resolve(parseRequest)
      .then(() => {
        setBlocksRefreshKey((currentKey) => currentKey + 1)
        if (vaultPath) {
          void refreshPaperMetadata(vaultPath, paperId)
            .then(() => setMetadataRefreshKey((currentKey) => currentKey + 1))
            .catch((error: unknown) => {
              console.warn('[paper-reader] Failed to refresh paper metadata after parse:', paperParseErrorMessage(error))
            })
        }
      })
      .catch((error: unknown) => {
        console.warn('[paper-reader] Failed to parse paper:', paperParseErrorMessage(error))
      })
      .finally(() => setParsePaperPending(false))
  }, [onParsePaper, paperId, vaultPath])
  const loadingBlocks = blocksState.state === 'loading' || (Boolean(vaultPath && paperId) && blocksState.state === 'idle')
  const summary = paperReaderSummary(
    blocksState.result,
    loadingBlocks && !blocksState.result,
    Boolean(vaultPath),
    blocksState.state === 'error',
    selectedBlockId,
  )
  const blocks = blocksState.result?.blocks ?? EMPTY_SOURCE_BLOCKS
  const paperAlreadyParsed = metadata?.parseStatus === 'parsed'
    || (blocksState.result?.state === 'ready' && blocks.length > 0)
  const metadataAlreadyExists = Boolean(paperMetadataState.result?.metadata)
  const handleRequestParsePaper = useCallback(() => {
    if (paperAlreadyParsed) {
      setPendingConfirmation('parse')
      return
    }

    parsePaperFromReader()
  }, [paperAlreadyParsed, parsePaperFromReader])
  const handleRequestRefreshMetadata = useCallback(() => {
    if (metadataAlreadyExists) {
      setPendingConfirmation('refreshMetadata')
      return
    }

    refreshMetadata()
  }, [metadataAlreadyExists, refreshMetadata])
  const handleCancelConfirmation = useCallback(() => setPendingConfirmation(null), [])
  const handleConfirmAction = useCallback(() => {
    const action = pendingConfirmation
    setPendingConfirmation(null)
    if (action === 'parse') {
      parsePaperFromReader({ force: true })
      return
    }

    if (action === 'refreshMetadata') {
      refreshMetadata()
    }
  }, [parsePaperFromReader, pendingConfirmation, refreshMetadata])
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
  const handleSelectedTextContextChange = useCallback((context: AiSelectedTextContext | null) => {
    setSelectedPaperTextContext(context?.kind === 'text' ? context : null)
    onSelectedTextContextChange?.(context)
  }, [onSelectedTextContextChange])
  const handleFocusBlockFromCitation = useCallback((blockId: string) => {
    setReaderMode('markdown')
    handleSelectBlock(blockId)
    setOpenCommentBlockId(blockId)
  }, [handleSelectBlock])
  const annotations = usePaperAnnotations(vaultPath, paperId)
  const commentsByAnchorId = useMemo(
    () => paperCommentsByBlockId(annotations.annotations),
    [annotations.annotations],
  )
  const createAnnotation = useCallback((block: SourceBlock, input: {
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => {
    void annotations.createBlockLevelAnnotation({
      blockId: block.id,
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
        metadataError={paperMetadataState.error}
        metadataReadyForAction={paperMetadataState.state === 'loaded' || paperMetadataState.state === 'error'}
        metadataPending={metadataPending}
        metadataResult={paperMetadataState.result}
        metadata={metadata}
        onApplyMetadataCandidate={handleApplyMetadataCandidate}
        onSaveMetadata={handleSaveMetadata}
        onParsePaper={canShowParsePaper ? handleRequestParsePaper : undefined}
        onRefreshMetadata={canRefreshMetadata ? handleRequestRefreshMetadata : undefined}
        onSelectPdfMode={selectPdfMode}
        onSelectReadMode={selectReadMode}
        parsePaperPending={parsePaperPending}
        parseProvider={paperParserProvider}
        summary={summary}
      />
      <PaperActionConfirmDialog
        action={pendingConfirmation}
        locale={locale}
        onCancel={handleCancelConfirmation}
        onConfirm={handleConfirmAction}
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
            onEditorChange={onEditorChange}
            onNavigateWikilink={onNavigateWikilink}
            onSelectedTextContextChange={handleSelectedTextContextChange}
            onResetAnnotations={resetAnnotations}
            onSaveAnnotation={saveAnnotation}
            onToggleCommentThread={handleToggleCommentThread}
            openCommentBlockId={openCommentBlockId}
            selectedBlockId={selectedBlockId}
            selectedTextContext={selectedPaperTextContext}
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
