import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import { WarningCircle } from '@phosphor-icons/react'
import {
  Tabs,
  TabsContent,
} from '@/components/ui/tabs'
import { translate, type AppLocale } from '../lib/i18n'
import {
  trackPaperReaderModeChanged,
  trackPaperReaderOpened,
} from '../lib/productAnalytics'
import type { VaultEntry } from '../types'
import type { AiSelectedTextContext } from '../utils/ai-context'
import type { PaperParserProvider } from './parserSettings'
import {
  readPaperMetadata,
  type PaperMetadataReadResult,
} from './metadata'
import { loadPaperBlocks, type PaperBlocksReadResult } from './blocks'
import {
  type PaperComment,
  type PaperCommentKind,
} from './comments'
import {
  type PaperReaderBlocksState,
  paperMetadataForReader,
  paperReaderSummary,
} from './paperReaderModel'
import type { SourceBlock } from './sourceBlocks'
import {
  paperSidecarHealth,
} from './paperReaderBlocks'
import {
  paperBlockPdfFocusRequest,
  useBlockCitationFocus,
} from './paperReaderBridge'
import {
  paperCommentsByBlockId,
} from './paperCommentProvider'
import {
  usePaperComments,
} from './usePaperComments'
import {
  PaperActionConfirmDialog,
  PaperMetadataPanel,
} from './PaperMetadataPanel'
import { PaperPdfPanel, type PaperPdfFocusRequest } from './PaperPdfPanel'
import { PaperMarkdownNoteSurface } from './PaperMarkdownNoteSurface'
import { usePaperReaderActions } from './paperReaderActions'

interface PaperReaderShellProps {
  editable?: boolean
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

const EMPTY_SOURCE_BLOCKS: SourceBlock[] = []

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
  editable = true,
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
  const [pdfFocusRequest, setPdfFocusRequest] = useState<PaperPdfFocusRequest | null>(null)
  const [selectedPaperTextContext, setSelectedPaperTextContext] = useState<AiSelectedTextContext | null>(null)
  const handleReaderModeChange = useCallback((nextValue: string) => {
    if (nextValue === 'markdown' || nextValue === 'pdf') setReaderMode(nextValue)
  }, [])
  const selectReadMode = useCallback(() => setReaderMode('markdown'), [])
  const selectPdfMode = useCallback(() => setReaderMode('pdf'), [])
  const paperId = metadata?.paperId ?? null
  const blocksState = usePaperBlocks(vaultPath, paperId, blocksRefreshKey)
  const paperMetadataState = usePaperMetadata(vaultPath, paperId, metadataRefreshKey)
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
  const refreshBlocks = useCallback(() => setBlocksRefreshKey((currentKey) => currentKey + 1), [])
  const refreshMetadataState = useCallback(() => setMetadataRefreshKey((currentKey) => currentKey + 1), [])
  const {
    canRefreshMetadata,
    canShowParsePaper,
    handleApplyMetadataCandidate,
    handleCancelConfirmation,
    handleConfirmAction,
    handleRequestParsePaper,
    handleRequestRefreshMetadata,
    handleSaveMetadata,
    metadataPending,
    parsePaperPending,
    pendingConfirmation,
  } = usePaperReaderActions({
    metadataAlreadyExists,
    metadataReadResult: paperMetadataState.result,
    metadataReadState: paperMetadataState.state,
    onBlocksRefresh: refreshBlocks,
    onMetadataRefresh: refreshMetadataState,
    onParsePaper,
    paperAlreadyParsed,
    paperId,
    vaultPath,
  })
  const sidecarHealth = useMemo(
    () => paperSidecarHealth(blocks, blocksState.result?.state ?? null),
    [blocks, blocksState.result?.state],
  )
  const handleSelectBlock = useCallback((blockId: string) => {
    setSelectedBlockId(blockId)
    const block = blocks.find((candidate) => candidate.id === blockId)
    const focusRequest = paperBlockPdfFocusRequest(block)
    if (focusRequest) setPdfFocusRequest(focusRequest)
  }, [blocks])
  const closeCommentThread = useCallback(() => setOpenCommentBlockId(null), [])
  const handleToggleCommentThread = useCallback((blockId: string) => {
    setOpenCommentBlockId((currentBlockId) => {
      if (currentBlockId === blockId) return null
      handleSelectBlock(blockId)
      return blockId
    })
  }, [handleSelectBlock])
  const handleOpenSelectedTextComment = useCallback((blockId: string) => {
    handleSelectBlock(blockId)
    setOpenCommentBlockId(blockId)
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
  const comments = usePaperComments(vaultPath, paperId)
  const commentsByAnchorId = useMemo(
    () => paperCommentsByBlockId(comments.comments),
    [comments.comments],
  )
  const createComment = useCallback((block: SourceBlock, input: {
    kind: PaperCommentKind
    note?: string
    text?: string
  }) => {
    void comments.createBlockLevelComment({
      blockId: block.id,
      kind: input.kind,
      note: input.note,
      text: input.text,
    }).catch((error: unknown) => {
      console.warn('[paper-reader] Failed to save comment:', error)
    })
  }, [comments])
  const saveComment = useCallback((comment: PaperComment) => {
    void comments.saveComment(comment).catch((error: unknown) => {
      console.warn('[paper-reader] Failed to update comment:', error)
    })
  }, [comments])
  const deleteComment = useCallback((commentId: string) => {
    void comments.deleteComment(commentId).catch((error: unknown) => {
      console.warn('[paper-reader] Failed to delete comment:', error)
    })
  }, [comments])
  const resetComments = useCallback(() => {
    void comments.resetComments().catch((error: unknown) => {
      console.warn('[paper-reader] Failed to reset comment sidecar:', error)
    })
  }, [comments])

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
            commentError={comments.error}
            commentLoadState={comments.loadState}
            commentsByBlockId={comments.commentsByBlockId}
            blocks={blocks}
            blocksError={blocksState.error}
            blocksLoadState={loadingBlocks ? 'loading' : blocksState.state}
            blocksReadResult={blocksState.result}
            commentsByAnchorId={commentsByAnchorId}
            editor={editor}
            editable={editable}
            entries={entries}
            health={sidecarHealth}
            locale={locale}
            onCloseCommentThread={closeCommentThread}
            onCreateComment={createComment}
            onDeleteComment={deleteComment}
            onEditorChange={onEditorChange}
            onNavigateWikilink={onNavigateWikilink}
            onOpenSelectedTextComment={handleOpenSelectedTextComment}
            onSelectedTextContextChange={handleSelectedTextContextChange}
            onResetComments={resetComments}
            onSaveComment={saveComment}
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
