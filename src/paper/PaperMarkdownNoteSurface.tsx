import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import {
  ArrowCounterClockwise,
  WarningCircle,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { NoteSurface } from '../components/NoteSurface'
import type { NoteSurfaceAdapter } from '../components/NoteSurface'
import type { NoteComment } from '../comments/commentProvider'
import { translate, type AppLocale } from '../lib/i18n'
import { trackPaperBlockCitationCopied } from '../lib/productAnalytics'
import type { VaultEntry } from '../types'
import type { AiSelectedTextContext } from '../utils/ai-context'
import type {
  AnnotationsByBlockId,
  PaperAnnotation,
  PaperAnnotationKind,
} from './annotations'
import type { PaperBlocksError, PaperBlocksReadResult } from './blocks'
import { PaperCommentThread } from './PaperCommentThread'
import type { PaperSidecarHealth } from './paperReaderBlocks'
import {
  paperBlockCitation,
  paperCommentAnchors,
  scrollPaperMarkdownBlockIntoView,
  selectedQuoteForPaperBlock,
  sourceBlocksById,
} from './paperReaderBridge'
import type { SourceBlock, SourceBlockLineError } from './sourceBlocks'
import {
  isPaperAnnotationsError,
  paperAnnotationsErrorMessage,
  type AnnotationLoadState,
} from './usePaperAnnotations'

type LoadState = 'idle' | 'loading' | 'loaded' | 'error'

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

async function writeClipboardText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
  await navigator.clipboard.writeText(text)
}

function PaperHealthPill({ value }: { value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border bg-muted px-2 text-xs font-medium text-muted-foreground">
      {value}
    </span>
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

export function PaperMarkdownNoteSurface({
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
  health: PaperSidecarHealth
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
  const noteSurfaceRef = useRef<NoteSurfaceAdapter>(null)
  const blocksById = useMemo(() => sourceBlocksById(blocks), [blocks])
  const commentAnchors = useMemo(() => paperCommentAnchors(blocks, commentsByAnchorId), [blocks, commentsByAnchorId])

  useEffect(() => {
    if (!selectedBlockId) return
    const animationFrame = requestAnimationFrame(() => {
      scrollPaperMarkdownBlockIntoView({
        blockId: selectedBlockId,
        container: readScrollAreaRef.current,
        focusBlock: (targetBlockId) => noteSurfaceRef.current?.focusBlock(targetBlockId, 'start'),
      })
    })
    return () => cancelAnimationFrame(animationFrame)
  }, [selectedBlockId])

  const copyCitation = useCallback((block: SourceBlock) => {
    const citation = paperBlockCitation(block)
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
      <PaperCommentThread
        annotations={annotationsByBlockId[block.id] ?? []}
        block={block}
        locale={locale}
        onCopyCitation={copyCitation}
        onClose={onCloseCommentThread}
        onCreateAnnotation={onCreateAnnotation}
        onDeleteAnnotation={onDeleteAnnotation}
        onSaveAnnotation={onSaveAnnotation}
        selectedQuote={selectedQuoteForPaperBlock(selectedTextContext, sourceEntry)}
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
    sourceEntry,
  ])

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="paper-reader-block-view">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">{translate(locale, 'paper.reader.readingView')}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {health.isZeroUsableBlocks ? <PaperHealthPill value={translate(locale, 'paper.reader.zeroUsableBlocks')} /> : null}
          {health.hasMissingPageNumbers ? <PaperHealthPill value={translate(locale, 'paper.reader.missingPageNumbers')} /> : null}
          {health.hasMinimallyNormalizedBlocks ? <PaperHealthPill value={translate(locale, 'paper.reader.minimalBlocksWarning')} /> : null}
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
          ref={noteSurfaceRef}
          className="min-h-full flex-none"
          commentOptions={{
            anchors: commentAnchors,
            onToggleThread: onToggleCommentThread,
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
