import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyPaperMetadataCandidate,
  extractPaperMetadata,
  refreshPaperMetadata,
  savePaperMetadata,
  type PaperMetadataReadResult,
  type PaperMetadataValues,
} from './metadata'
import { parsePaper } from './parser'

export type PaperActionConfirmation = 'parse' | 'refreshMetadata'

type MetadataReadState = 'idle' | 'loading' | 'loaded' | 'error'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function paperParseErrorMessage(error: unknown): string {
  if (isRecord(error) && typeof error.message === 'string') return error.message
  return error instanceof Error ? error.message : String(error)
}

export function usePaperReaderActions({
  metadataAlreadyExists,
  metadataReadResult,
  metadataReadState,
  onBlocksRefresh,
  onMetadataRefresh,
  onParsePaper,
  paperAlreadyParsed,
  paperId,
  vaultPath,
}: {
  metadataAlreadyExists: boolean
  metadataReadResult: PaperMetadataReadResult | null
  metadataReadState: MetadataReadState
  onBlocksRefresh: () => void
  onMetadataRefresh: () => void
  onParsePaper?: (paperId: string, options?: { force?: boolean }) => void | Promise<void>
  paperAlreadyParsed: boolean
  paperId: string | null
  vaultPath?: string
}) {
  const [parsePaperPending, setParsePaperPending] = useState(false)
  const [metadataPending, setMetadataPending] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<PaperActionConfirmation | null>(null)
  const autoMetadataRequestRef = useRef<string | null>(null)

  const canShowParsePaper = Boolean(onParsePaper || vaultPath)
  const canRefreshMetadata = Boolean(vaultPath && paperId)

  const refreshMetadata = useCallback(() => {
    if (!vaultPath || !paperId) return
    setMetadataPending(true)
    void refreshPaperMetadata(vaultPath, paperId)
      .then(onMetadataRefresh)
      .catch((error: unknown) => {
        console.warn('[paper-reader] Failed to refresh paper metadata:', paperParseErrorMessage(error))
      })
      .finally(() => setMetadataPending(false))
  }, [onMetadataRefresh, paperId, vaultPath])

  const handleApplyMetadataCandidate = useCallback((candidateId: string) => {
    if (!vaultPath || !paperId) return
    setMetadataPending(true)
    void applyPaperMetadataCandidate(vaultPath, paperId, candidateId)
      .then(onMetadataRefresh)
      .catch((error: unknown) => {
        console.warn('[paper-reader] Failed to apply paper metadata candidate:', paperParseErrorMessage(error))
      })
      .finally(() => setMetadataPending(false))
  }, [onMetadataRefresh, paperId, vaultPath])

  const handleSaveMetadata = useCallback((values: PaperMetadataValues) => {
    if (!vaultPath || !paperId) return
    setMetadataPending(true)
    void savePaperMetadata(vaultPath, paperId, values)
      .then(onMetadataRefresh)
      .catch((error: unknown) => {
        console.warn('[paper-reader] Failed to save paper metadata:', paperParseErrorMessage(error))
      })
      .finally(() => setMetadataPending(false))
  }, [onMetadataRefresh, paperId, vaultPath])

  useEffect(() => {
    if (!vaultPath || !paperId || metadataReadState !== 'loaded') return
    if (metadataReadResult?.state !== 'missing') return
    const requestKey = `${vaultPath}\u0000${paperId}`
    if (autoMetadataRequestRef.current === requestKey) return
    autoMetadataRequestRef.current = requestKey
    void extractPaperMetadata(vaultPath, paperId)
      .then(onMetadataRefresh)
      .catch((error: unknown) => {
        console.warn('[paper-reader] Failed to extract paper metadata:', paperParseErrorMessage(error))
      })
  }, [metadataReadResult?.state, metadataReadState, onMetadataRefresh, paperId, vaultPath])

  const parsePaperFromReader = useCallback((options: { force?: boolean } = {}) => {
    if (!paperId || (!onParsePaper && !vaultPath)) return

    setParsePaperPending(true)
    const force = options.force ?? false
    const parseRequest = onParsePaper
      ? onParsePaper(paperId, { force })
      : parsePaper(vaultPath!, paperId, undefined, { force })
    void Promise.resolve(parseRequest)
      .then(() => {
        onBlocksRefresh()
        if (vaultPath) {
          void refreshPaperMetadata(vaultPath, paperId)
            .then(onMetadataRefresh)
            .catch((error: unknown) => {
              console.warn('[paper-reader] Failed to refresh paper metadata after parse:', paperParseErrorMessage(error))
            })
        }
      })
      .catch((error: unknown) => {
        console.warn('[paper-reader] Failed to parse paper:', paperParseErrorMessage(error))
      })
      .finally(() => setParsePaperPending(false))
  }, [onBlocksRefresh, onMetadataRefresh, onParsePaper, paperId, vaultPath])

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

  return {
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
  }
}
