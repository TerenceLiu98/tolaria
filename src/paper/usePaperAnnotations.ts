import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { trackPaperAnnotationDeleted, trackPaperAnnotationSaved } from '../lib/productAnalytics'
import {
  createBlockAnnotation,
  deletePaperAnnotation,
  groupAnnotationsByBlockId,
  loadPaperAnnotations,
  savePaperAnnotation,
  type AnnotationsByBlockId,
  type PaperAnnotation,
  type PaperAnnotationColor,
  type PaperAnnotationKind,
  type PaperAnnotationsError,
  type PaperAnnotationsReadResult,
} from './annotations'

export type AnnotationLoadState = 'idle' | 'loading' | 'loaded' | 'error'

interface SettledAnnotationLoadState {
  error: unknown
  key: string
  result: PaperAnnotationsReadResult | null
  state: 'loaded' | 'error'
}

export interface UsePaperAnnotationsResult {
  annotations: PaperAnnotation[]
  annotationsByBlockId: AnnotationsByBlockId
  createBlockLevelAnnotation: (input: {
    blockId: string
    color?: PaperAnnotationColor
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => Promise<PaperAnnotationsReadResult>
  deleteAnnotation: (annotationId: string) => Promise<PaperAnnotationsReadResult>
  error: unknown
  loadState: AnnotationLoadState
  reload: () => Promise<PaperAnnotationsReadResult | null>
  result: PaperAnnotationsReadResult | null
  saveAnnotation: (annotation: PaperAnnotation) => Promise<PaperAnnotationsReadResult>
}

function requestKey(vaultPath: string | undefined, paperId: string | null): string | null {
  return vaultPath && paperId ? `${vaultPath}\u0000${paperId}` : null
}

function paperAnnotationsError(error: unknown): PaperAnnotationsError | null {
  if (typeof error !== 'object' || error === null) return null
  if (!('kind' in error) || !('lineErrors' in error)) return null
  return error as PaperAnnotationsError
}

export function isPaperAnnotationsError(error: unknown): error is PaperAnnotationsError {
  return paperAnnotationsError(error) !== null
}

export function paperAnnotationsErrorMessage(error: unknown): string {
  const structured = paperAnnotationsError(error)
  if (structured) return structured.message
  return error instanceof Error ? error.message : String(error)
}

export function usePaperAnnotations(
  vaultPath: string | undefined,
  paperId: string | null,
): UsePaperAnnotationsResult {
  const activeRequestKey = requestKey(vaultPath, paperId)
  const [settledState, setSettledState] = useState<SettledAnnotationLoadState | null>(null)
  const operationSequenceRef = useRef(0)

  useEffect(() => {
    if (!vaultPath || !paperId || !activeRequestKey) return

    let cancelled = false
    const sequence = operationSequenceRef.current + 1
    operationSequenceRef.current = sequence
    void loadPaperAnnotations(vaultPath, paperId)
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
      const result = await loadPaperAnnotations(vaultPath, paperId)
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
  const annotations = useMemo(() => result?.annotations ?? [], [result])
  const annotationsByBlockId = useMemo(() => groupAnnotationsByBlockId(annotations), [annotations])
  const loadState: AnnotationLoadState = !activeRequestKey
    ? 'idle'
    : currentState?.state ?? 'loading'
  const error = currentState?.error ?? null

  const saveAnnotationToSidecar = useCallback(async (annotation: PaperAnnotation) => {
    if (!vaultPath || !paperId || !activeRequestKey) {
      throw new Error('Paper annotation sidecar is unavailable without an active vault and paper id')
    }
    const sequence = operationSequenceRef.current + 1
    operationSequenceRef.current = sequence
    const nextResult = await savePaperAnnotation(vaultPath, paperId, annotation)
    if (operationSequenceRef.current === sequence) {
      setSettledState({ key: activeRequestKey, result: nextResult, error: null, state: 'loaded' })
    }
    trackPaperAnnotationSaved({ color: annotation.color, kind: annotation.kind })
    return nextResult
  }, [activeRequestKey, paperId, vaultPath])

  const createBlockLevelAnnotation = useCallback(async (input: {
    blockId: string
    color?: PaperAnnotationColor
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => {
    if (!paperId) {
      throw new Error('Paper annotation sidecar is unavailable without a paper id')
    }
    return saveAnnotationToSidecar(createBlockAnnotation({
      paperId,
      blockId: input.blockId,
      kind: input.kind,
      color: input.color,
      text: input.text,
      note: input.note,
    }))
  }, [paperId, saveAnnotationToSidecar])

  const deleteAnnotationFromSidecar = useCallback(async (annotationId: string) => {
    if (!vaultPath || !paperId || !activeRequestKey) {
      throw new Error('Paper annotation sidecar is unavailable without an active vault and paper id')
    }
    const sequence = operationSequenceRef.current + 1
    operationSequenceRef.current = sequence
    const nextResult = await deletePaperAnnotation(vaultPath, paperId, annotationId)
    if (operationSequenceRef.current === sequence) {
      setSettledState({ key: activeRequestKey, result: nextResult, error: null, state: 'loaded' })
    }
    trackPaperAnnotationDeleted()
    return nextResult
  }, [activeRequestKey, paperId, vaultPath])

  return {
    annotations,
    annotationsByBlockId,
    createBlockLevelAnnotation,
    deleteAnnotation: deleteAnnotationFromSidecar,
    error,
    loadState,
    reload,
    result,
    saveAnnotation: saveAnnotationToSidecar,
  }
}
