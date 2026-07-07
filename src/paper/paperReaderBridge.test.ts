import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoteComment } from '../comments/commentProvider'
import type { VaultEntry } from '../types'
import {
  clearPendingBlockFocus,
  dispatchBlockCitationNavigation,
  getPendingBlockFocus,
  setPendingBlockFocus,
} from './blockCitationNavigation'
import {
  paperBlockCitation,
  paperBlockPdfFocusRequest,
  paperCommentAnchors,
  scrollPaperMarkdownBlockIntoView,
  selectedQuoteForPaperBlock,
  sourceBlocksById,
  useBlockCitationFocus,
} from './paperReaderBridge'
import type { SourceBlock } from './sourceBlocks'

const blocks: SourceBlock[] = [
  {
    hash: 'sha256:title',
    id: 'b0001',
    kind: 'title',
    page: 1,
    paper_id: 'paper-1',
    text: 'Paper Title',
  },
  {
    hash: 'sha256:paragraph',
    id: 'b0002',
    kind: 'paragraph',
    page: 2,
    paper_id: 'paper-1',
    text: 'Evidence paragraph',
  },
]

const sourceEntry = {
  path: '/vault/papers/paper-1/paper.md',
  title: 'Paper Title',
} as VaultEntry

describe('paperReaderBridge', () => {
  afterEach(() => {
    clearPendingBlockFocus()
  })

  it('builds block lookup and comment anchors from source blocks', () => {
    const commentsByAnchorId: Record<string, NoteComment[]> = {
      b0002: [{
        anchorId: 'b0002',
        body: 'Check this claim',
        createdAt: '2026-07-07T00:00:00Z',
        id: 'comment-1',
        kind: 'comment',
        updatedAt: '2026-07-07T00:00:00Z',
      }],
    }

    expect(sourceBlocksById(blocks).get('b0002')?.text).toBe('Evidence paragraph')
    expect(paperCommentAnchors(blocks, commentsByAnchorId)).toEqual([
      {
        comments: [],
        id: 'b0001',
        title: 'Paper Title',
      },
      {
        comments: commentsByAnchorId.b0002,
        id: 'b0002',
        title: 'Evidence paragraph',
      },
    ])
  })

  it('derives selected paper quotes only from the current paper entry', () => {
    expect(selectedQuoteForPaperBlock({
      entryPath: sourceEntry.path,
      entryTitle: sourceEntry.title,
      kind: 'text',
      text: '  selected quote  ',
    }, sourceEntry)).toBe('selected quote')

    expect(selectedQuoteForPaperBlock({
      entryPath: '/vault/other.md',
      entryTitle: 'Other',
      kind: 'text',
      text: 'selected quote',
    }, sourceEntry)).toBeNull()

    expect(selectedQuoteForPaperBlock({
      entryPath: sourceEntry.path,
      entryTitle: sourceEntry.title,
      kind: 'image',
      path: '/vault/assets/image.png',
    }, sourceEntry)).toBeNull()
  })

  it('formats citation and PDF focus provenance for valid source blocks', () => {
    expect(paperBlockCitation(blocks[1])).toBe('@block[paper-1#b0002]')
    expect(paperBlockPdfFocusRequest(blocks[1])).toEqual({ blockId: 'b0002', page: 2 })
    expect(paperBlockPdfFocusRequest({ ...blocks[1], page: 0 })).toBeNull()
    expect(paperBlockPdfFocusRequest({ ...blocks[1], page: null as unknown as number })).toBeNull()
  })

  it('focuses the editor block through the NoteSurface adapter and scrolls the source block anchor', () => {
    const sourceTarget = document.createElement('div')
    const sourceRoot = document.createElement('div')
    sourceTarget.dataset.paperSourceBlockId = 'b0002'
    sourceRoot.append(sourceTarget)
    const sourceScroll = vi.fn()
    sourceTarget.scrollIntoView = sourceScroll
    const focusBlock = vi.fn()

    scrollPaperMarkdownBlockIntoView({
      blockId: 'b0002',
      container: sourceRoot,
      focusBlock,
    })

    expect(focusBlock).toHaveBeenCalledWith('b0002')
    expect(sourceScroll).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
  })

  it('keeps editor focus available when the source block anchor is unavailable', () => {
    const sourceTarget = document.createElement('div')
    const sourceRoot = document.createElement('div')
    sourceTarget.dataset.paperSourceBlockId = 'b0001'
    sourceRoot.append(sourceTarget)
    const sourceScroll = vi.fn()
    sourceTarget.scrollIntoView = sourceScroll
    const focusBlock = vi.fn()

    scrollPaperMarkdownBlockIntoView({
      blockId: 'b0002',
      container: sourceRoot,
      focusBlock,
    })

    expect(focusBlock).toHaveBeenCalledWith('b0002')
    expect(sourceScroll).not.toHaveBeenCalled()
  })

  it('focuses pending and dispatched block citation navigation for the active paper only', () => {
    const onFocusBlock = vi.fn()
    setPendingBlockFocus({ paperId: 'paper-1', blockId: 'b0002' })

    renderHook(() => useBlockCitationFocus('paper-1', onFocusBlock))

    expect(onFocusBlock).toHaveBeenCalledWith('b0002')
    expect(getPendingBlockFocus()).toBeNull()

    dispatchBlockCitationNavigation({ paperId: 'other-paper', blockId: 'ignored' })
    dispatchBlockCitationNavigation({ paperId: 'paper-1', blockId: 'b0001' })

    expect(onFocusBlock).toHaveBeenCalledTimes(2)
    expect(onFocusBlock).toHaveBeenLastCalledWith('b0001')
  })
})
