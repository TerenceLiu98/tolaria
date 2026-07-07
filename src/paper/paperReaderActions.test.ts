import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyPaperMetadataCandidate,
  extractPaperMetadata,
  refreshPaperMetadata,
  savePaperMetadata,
  type PaperMetadataReadResult,
} from './metadata'
import { parsePaper } from './parser'
import { usePaperReaderActions } from './paperReaderActions'

vi.mock('./metadata', () => ({
  applyPaperMetadataCandidate: vi.fn(),
  extractPaperMetadata: vi.fn(),
  refreshPaperMetadata: vi.fn(),
  savePaperMetadata: vi.fn(),
}))

vi.mock('./parser', () => ({
  parsePaper: vi.fn(),
}))

const mockedApplyPaperMetadataCandidate = vi.mocked(applyPaperMetadataCandidate)
const mockedExtractPaperMetadata = vi.mocked(extractPaperMetadata)
const mockedRefreshPaperMetadata = vi.mocked(refreshPaperMetadata)
const mockedSavePaperMetadata = vi.mocked(savePaperMetadata)
const mockedParsePaper = vi.mocked(parsePaper)

function resolvedMetadata() {
  return {
    authors: [],
    candidates: [],
    confidence: 1,
    errors: [],
    paperId: 'paper-1',
    sources: [],
    status: 'ready' as const,
    title: 'Paper',
  }
}

function missingMetadataReadResult(): PaperMetadataReadResult {
  return {
    paperId: 'paper-1',
    path: '/vault/papers/paper-1/metadata.json',
    state: 'missing',
  }
}

function renderActions(overrides: Partial<Parameters<typeof usePaperReaderActions>[0]> = {}) {
  const props = {
    metadataAlreadyExists: false,
    metadataReadResult: null,
    metadataReadState: 'idle' as const,
    onBlocksRefresh: vi.fn(),
    onMetadataRefresh: vi.fn(),
    paperAlreadyParsed: false,
    paperId: 'paper-1',
    vaultPath: '/vault',
    ...overrides,
  }
  return {
    props,
    ...renderHook((hookProps: typeof props) => usePaperReaderActions(hookProps), {
      initialProps: props,
    }),
  }
}

describe('usePaperReaderActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApplyPaperMetadataCandidate.mockResolvedValue(resolvedMetadata())
    mockedExtractPaperMetadata.mockResolvedValue(resolvedMetadata())
    mockedRefreshPaperMetadata.mockResolvedValue(resolvedMetadata())
    mockedSavePaperMetadata.mockResolvedValue(resolvedMetadata())
    mockedParsePaper.mockResolvedValue({
      assets: [],
      blocks: [],
      blocksPath: '/vault/papers/paper-1/blocks.jsonl',
      paperId: 'paper-1',
      paperPath: '/vault/papers/paper-1/paper.md',
      parsedAt: '2026-07-07T00:00:00.000Z',
      parser: 'dev-fixture',
      parserVersion: 'fixture',
      provider: 'dev-fixture',
      warnings: [],
    })
  })

  it('runs direct parser fallback and refreshes blocks plus metadata for unparsed papers', async () => {
    const { result, props } = renderActions()

    act(() => result.current.handleRequestParsePaper())

    expect(mockedParsePaper).toHaveBeenCalledWith('/vault', 'paper-1', undefined, { force: false })
    await waitFor(() => expect(props.onBlocksRefresh).toHaveBeenCalledTimes(1))
    expect(mockedRefreshPaperMetadata).toHaveBeenCalledWith('/vault', 'paper-1')
    await waitFor(() => expect(props.onMetadataRefresh).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.parsePaperPending).toBe(false))
  })

  it('confirms before forcing parse when parsed content already exists', async () => {
    const { result, props } = renderActions({ paperAlreadyParsed: true })

    act(() => result.current.handleRequestParsePaper())

    expect(result.current.pendingConfirmation).toBe('parse')
    expect(mockedParsePaper).not.toHaveBeenCalled()

    act(() => result.current.handleConfirmAction())

    expect(mockedParsePaper).toHaveBeenCalledWith('/vault', 'paper-1', undefined, { force: true })
    await waitFor(() => expect(props.onBlocksRefresh).toHaveBeenCalledTimes(1))
    expect(result.current.pendingConfirmation).toBeNull()
  })

  it('uses app-provided parse action when supplied', async () => {
    const onParsePaper = vi.fn().mockResolvedValue(undefined)
    const { result, props } = renderActions({ onParsePaper })

    act(() => result.current.handleRequestParsePaper())

    expect(onParsePaper).toHaveBeenCalledWith('paper-1', { force: false })
    expect(mockedParsePaper).not.toHaveBeenCalled()
    await waitFor(() => expect(props.onBlocksRefresh).toHaveBeenCalledTimes(1))
  })

  it('confirms before refreshing existing metadata', async () => {
    const { result, props } = renderActions({ metadataAlreadyExists: true })

    act(() => result.current.handleRequestRefreshMetadata())

    expect(result.current.pendingConfirmation).toBe('refreshMetadata')
    expect(mockedRefreshPaperMetadata).not.toHaveBeenCalled()

    act(() => result.current.handleConfirmAction())

    expect(mockedRefreshPaperMetadata).toHaveBeenCalledWith('/vault', 'paper-1')
    await waitFor(() => expect(props.onMetadataRefresh).toHaveBeenCalledTimes(1))
  })

  it('applies and saves metadata through the sidecar commands', async () => {
    const { result, props } = renderActions()

    act(() => result.current.handleApplyMetadataCandidate('candidate-1'))
    expect(mockedApplyPaperMetadataCandidate).toHaveBeenCalledWith('/vault', 'paper-1', 'candidate-1')
    await waitFor(() => expect(props.onMetadataRefresh).toHaveBeenCalledTimes(1))

    act(() => result.current.handleSaveMetadata({ authors: ['Ada'], title: 'Manual title' }))
    expect(mockedSavePaperMetadata).toHaveBeenCalledWith('/vault', 'paper-1', {
      authors: ['Ada'],
      title: 'Manual title',
    })
    await waitFor(() => expect(props.onMetadataRefresh).toHaveBeenCalledTimes(2))
  })

  it('extracts missing metadata once for a paper and refreshes state', async () => {
    const { props, rerender } = renderActions({
      metadataReadResult: missingMetadataReadResult(),
      metadataReadState: 'loaded',
    })

    await waitFor(() => expect(mockedExtractPaperMetadata).toHaveBeenCalledWith('/vault', 'paper-1'))
    await waitFor(() => expect(props.onMetadataRefresh).toHaveBeenCalledTimes(1))

    rerender({
      ...props,
      metadataReadResult: missingMetadataReadResult(),
      metadataReadState: 'loaded',
    })

    expect(mockedExtractPaperMetadata).toHaveBeenCalledTimes(1)
  })
})
