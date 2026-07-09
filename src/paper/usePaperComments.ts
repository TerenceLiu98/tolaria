import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  trackPaperCommentDeleted,
  trackPaperCommentSaved,
  trackPaperCommentSidecarReset,
} from '../lib/productAnalytics'
import {
  createBlockComment,
  deletePaperComment,
  groupCommentsByBlockId,
  loadPaperComments,
  resetPaperComments,
  savePaperComment,
  type CommentsByBlockId,
  type PaperComment,
  type PaperCommentKind,
  type PaperCommentsError,
  type PaperCommentsReadResult,
} from './comments'

export type CommentLoadState = 'idle' | 'loading' | 'loaded' | 'error'

interface SettledCommentLoadState {
  error: unknown
  key: string
  result: PaperCommentsReadResult | null
  state: 'loaded' | 'error'
}

export interface UsePaperCommentsResult {
  comments: PaperComment[]
  commentsByBlockId: CommentsByBlockId
  createBlockLevelComment: (input: {
    blockId: string
    kind: PaperCommentKind
    note?: string
    text?: string
  }) => Promise<PaperCommentsReadResult>
  deleteComment: (commentId: string) => Promise<PaperCommentsReadResult>
  error: unknown
  loadState: CommentLoadState
  reload: () => Promise<PaperCommentsReadResult | null>
  resetComments: () => Promise<PaperCommentsReadResult>
  result: PaperCommentsReadResult | null
  saveComment: (comment: PaperComment) => Promise<PaperCommentsReadResult>
}

function requestKey(vaultPath: string | undefined, paperId: string | null): string | null {
  return vaultPath && paperId ? `${vaultPath}\u0000${paperId}` : null
}

function paperCommentsError(error: unknown): PaperCommentsError | null {
  if (typeof error !== 'object' || error === null) return null
  if (!('kind' in error) || !('lineErrors' in error)) return null
  return error as PaperCommentsError
}

export function isPaperCommentsError(error: unknown): error is PaperCommentsError {
  return paperCommentsError(error) !== null
}

export function paperCommentsErrorMessage(error: unknown): string {
  const structured = paperCommentsError(error)
  if (structured) return structured.message
  return error instanceof Error ? error.message : String(error)
}

export function usePaperComments(
  vaultPath: string | undefined,
  paperId: string | null,
): UsePaperCommentsResult {
  const activeRequestKey = requestKey(vaultPath, paperId)
  const [settledState, setSettledState] = useState<SettledCommentLoadState | null>(null)
  const operationSequenceRef = useRef(0)

  useEffect(() => {
    if (!vaultPath || !paperId || !activeRequestKey) return

    let cancelled = false
    const sequence = operationSequenceRef.current + 1
    operationSequenceRef.current = sequence
    void loadPaperComments(vaultPath, paperId)
      .then((result) => {
        if (!cancelled && operationSequenceRef.current === sequence) {
          setSettledState({ key: activeRequestKey, result, error: null, state: 'loaded' })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && operationSequenceRef.current === sequence) {
          setSettledState({ key: activeRequestKey, result: null, error, state: 'error' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeRequestKey, paperId, vaultPath])

  const reload = useCallback(async () => {
    if (!vaultPath || !paperId || !activeRequestKey) return null
    const sequence = operationSequenceRef.current + 1
    operationSequenceRef.current = sequence
    try {
      const result = await loadPaperComments(vaultPath, paperId)
      if (operationSequenceRef.current === sequence) {
        setSettledState({ key: activeRequestKey, result, error: null, state: 'loaded' })
      }
      return result
    } catch (error: unknown) {
      if (operationSequenceRef.current === sequence) {
        setSettledState({ key: activeRequestKey, result: null, error, state: 'error' })
      }
      throw error
    }
  }, [activeRequestKey, paperId, vaultPath])

  const currentState = activeRequestKey && settledState?.key === activeRequestKey
    ? settledState
    : null
  const result = currentState?.result ?? null
  const comments = useMemo(() => result?.comments ?? [], [result])
  const commentsByBlockId = useMemo(() => groupCommentsByBlockId(comments), [comments])
  const loadState: CommentLoadState = !activeRequestKey
    ? 'idle'
    : currentState?.state ?? 'loading'
  const error = currentState?.error ?? null

  const saveCommentToSidecar = useCallback(async (comment: PaperComment) => {
    if (!vaultPath || !paperId || !activeRequestKey) {
      throw new Error('Paper comment sidecar is unavailable without an active vault and paper id')
    }
    const sequence = operationSequenceRef.current + 1
    operationSequenceRef.current = sequence
    const nextResult = await savePaperComment(vaultPath, paperId, comment)
    if (operationSequenceRef.current === sequence) {
      setSettledState({ key: activeRequestKey, result: nextResult, error: null, state: 'loaded' })
    }
    trackPaperCommentSaved({ kind: comment.kind })
    return nextResult
  }, [activeRequestKey, paperId, vaultPath])

  const createBlockLevelComment = useCallback(async (input: {
    blockId: string
    kind: PaperCommentKind
    note?: string
    text?: string
  }) => {
    if (!paperId) {
      throw new Error('Paper comment sidecar is unavailable without a paper id')
    }
    return saveCommentToSidecar(createBlockComment({
      paperId,
      blockId: input.blockId,
      kind: input.kind,
      text: input.text,
      note: input.note,
    }))
  }, [paperId, saveCommentToSidecar])

  const deleteCommentFromSidecar = useCallback(async (commentId: string) => {
    if (!vaultPath || !paperId || !activeRequestKey) {
      throw new Error('Paper comment sidecar is unavailable without an active vault and paper id')
    }
    const sequence = operationSequenceRef.current + 1
    operationSequenceRef.current = sequence
    const nextResult = await deletePaperComment(vaultPath, paperId, commentId)
    if (operationSequenceRef.current === sequence) {
      setSettledState({ key: activeRequestKey, result: nextResult, error: null, state: 'loaded' })
    }
    trackPaperCommentDeleted()
    return nextResult
  }, [activeRequestKey, paperId, vaultPath])

  const resetCommentsSidecar = useCallback(async () => {
    if (!vaultPath || !paperId || !activeRequestKey) {
      throw new Error('Paper comment sidecar is unavailable without an active vault and paper id')
    }
    const sequence = operationSequenceRef.current + 1
    operationSequenceRef.current = sequence
    const nextResult = await resetPaperComments(vaultPath, paperId)
    if (operationSequenceRef.current === sequence) {
      setSettledState({ key: activeRequestKey, result: nextResult, error: null, state: 'loaded' })
    }
    trackPaperCommentSidecarReset()
    return nextResult
  }, [activeRequestKey, paperId, vaultPath])

  return {
    comments,
    commentsByBlockId,
    createBlockLevelComment,
    deleteComment: deleteCommentFromSidecar,
    error,
    loadState,
    reload,
    resetComments: resetCommentsSidecar,
    result,
    saveComment: saveCommentToSidecar,
  }
}
