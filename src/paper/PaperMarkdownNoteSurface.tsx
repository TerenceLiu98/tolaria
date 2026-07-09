import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import {
  ArrowCounterClockwise,
  WarningCircle,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { NoteSurface } from '../components/NoteSurface'
import type { NoteSurfaceAdapter } from '../components/NoteSurface'
import { editorCommentAnchorForBlock } from '../components/comments/commentAnchors'
import type { NoteComment } from '../comments/commentProvider'
import { translate, type AppLocale } from '../lib/i18n'
import { trackPaperBlockCitationCopied } from '../lib/productAnalytics'
import type { VaultEntry } from '../types'
import type { AiSelectedTextContext } from '../utils/ai-context'
import type {
  CommentsByBlockId,
  PaperComment,
  PaperCommentKind,
} from './comments'
import type { PaperBlocksError, PaperBlocksReadResult } from './blocks'
import { PaperCommentThread } from './PaperCommentThread'
import type { PaperSidecarHealth } from './paperReaderBlocks'
import {
  paperBlockCitation,
  paperCommentAnchors,
  scrollPaperMarkdownBlockIntoView,
  selectedQuoteForPaperBlock,
  sourceBlockForSelectedQuote,
  sourceBlocksById,
} from './paperReaderBridge'
import type { SourceBlock, SourceBlockLineError } from './sourceBlocks'
import {
  isPaperCommentsError,
  paperCommentsErrorMessage,
  type CommentLoadState,
} from './usePaperComments'

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

function CommentStateNotice({
  error,
  loadState,
  locale,
  onResetComments,
}: {
  error: unknown
  loadState: CommentLoadState
  locale: AppLocale
  onResetComments: () => void
}) {
  if (loadState === 'loading') {
    return <p className="px-4 pb-3 text-sm text-muted-foreground">{translate(locale, 'paper.reader.commentsLoading')}</p>
  }

  if (loadState === 'error') {
    const lineErrors = isPaperCommentsError(error) ? error.lineErrors : []
    return (
      <div className="space-y-2 px-4 pb-3 text-sm text-destructive" data-testid="paper-reader-comments-error">
        <div className="flex items-center gap-2 font-medium">
          <WarningCircle className="size-4" />
          <span>{translate(locale, 'paper.reader.commentsError')}</span>
        </div>
        <p>{paperCommentsErrorMessage(error)}</p>
        {lineErrors.map((lineError) => (
          <p key={`${lineError.line}:${lineError.kind}`} className="text-xs text-muted-foreground">
            line {lineError.line}: {lineError.message}
          </p>
        ))}
        <Button type="button" variant="outline" size="xs" onClick={onResetComments}>
          <ArrowCounterClockwise className="size-3.5" />
          {translate(locale, 'paper.reader.resetCommentSidecar')}
        </Button>
      </div>
    )
  }

  return null
}

export function PaperMarkdownNoteSurface({
  commentError,
  commentLoadState,
  commentsByBlockId,
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
  onCreateComment,
  onDeleteComment,
  onEditorChange,
  onNavigateWikilink,
  onOpenSelectedTextComment,
  onSelectedTextContextChange,
  onResetComments,
  onSaveComment,
  onToggleCommentThread,
  openCommentBlockId,
  selectedBlockId,
  selectedTextContext,
  sourceEntry,
  vaultPath,
}: {
  commentError: unknown
  commentLoadState: CommentLoadState
  commentsByBlockId: CommentsByBlockId
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
  onCreateComment: (block: SourceBlock, input: {
    kind: PaperCommentKind
    note?: string
    text?: string
  }) => void
  onDeleteComment: (commentId: string) => void
  onEditorChange?: () => void
  onNavigateWikilink: (target: string) => void
  onOpenSelectedTextComment: (blockId: string) => void
  onSelectedTextContextChange?: (context: AiSelectedTextContext | null) => void
  onResetComments: () => void
  onSaveComment: (comment: PaperComment) => void
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
  const handleCommentSelectedTextContext = useCallback((context: AiSelectedTextContext) => {
    if (context.kind !== 'text') return

    const selectedAnchor = editorCommentAnchorForBlock({
      anchors: commentAnchors,
      blockId: context.anchorId,
      editorBlocks: Array.isArray(editor.document) ? editor.document : [],
    })
    if (selectedAnchor && blocksById.has(selectedAnchor.id)) {
      onOpenSelectedTextComment(selectedAnchor.id)
      return
    }

    const quote = selectedQuoteForPaperBlock(context, sourceEntry)
    const block = sourceBlockForSelectedQuote(blocks, quote)
    if (!block) return

    onOpenSelectedTextComment(block.id)
  }, [blocks, blocksById, commentAnchors, editor, onOpenSelectedTextComment, sourceEntry])

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
        comments={commentsByBlockId[block.id] ?? []}
        block={block}
        locale={locale}
        onCopyCitation={copyCitation}
        onClose={onCloseCommentThread}
        onCreateComment={onCreateComment}
        onDeleteComment={onDeleteComment}
        onSaveComment={onSaveComment}
        selectedQuote={selectedQuoteForPaperBlock(selectedTextContext, sourceEntry)}
      />
    )
  }, [
    commentsByBlockId,
    blocksById,
    copyCitation,
    locale,
    onCloseCommentThread,
    onCreateComment,
    onDeleteComment,
    onSaveComment,
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
      <CommentStateNotice
        locale={locale}
        loadState={commentLoadState}
        error={commentError}
        onResetComments={onResetComments}
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
          onCommentSelectedTextContext={handleCommentSelectedTextContext}
          onNavigateWikilink={onNavigateWikilink}
          onSelectedTextContextChange={onSelectedTextContextChange}
          sourceEntry={sourceEntry}
          vaultPath={vaultPath}
        />
      </div>
    </section>
  )
}
