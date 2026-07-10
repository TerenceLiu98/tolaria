import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VaultEntry } from '../types'
import {
  BLOCK_CITATION_NAVIGATE_EVENT,
  clearPendingBlockFocus,
  getPendingBlockFocus,
} from './blockCitationNavigation'
import { useBlockCitationNavigation } from './useBlockCitationNavigation'

function vaultEntry(overrides: Partial<VaultEntry>): VaultEntry {
  return {
    path: '/vault/note.md',
    filename: 'note.md',
    title: 'Note',
    isA: null,
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    archived: false,
    modifiedAt: null,
    createdAt: null,
    fileSize: 0,
    snippet: '',
    wordCount: 0,
    relationships: {},
    icon: null,
    color: null,
    order: null,
    sidebarLabel: null,
    template: null,
    sort: null,
    view: null,
    visible: null,
    organized: false,
    favorite: false,
    favoriteIndex: null,
    listPropertiesDisplay: [],
    outgoingLinks: [],
    properties: {},
    hasH1: false,
    fileKind: 'markdown',
    ...overrides,
  }
}

function HookHarness({
  entries,
  onNavigateResolvedPaper,
  onSelectPaper,
  onSelectPaperSection,
}: {
  entries: readonly VaultEntry[]
  onNavigateResolvedPaper?: (entry: VaultEntry) => boolean
  onSelectPaper: (entry: VaultEntry) => void
  onSelectPaperSection: () => void
}) {
  useBlockCitationNavigation({ entries, onNavigateResolvedPaper, onSelectPaper, onSelectPaperSection })
  return null
}

describe('useBlockCitationNavigation', () => {
  afterEach(() => {
    clearPendingBlockFocus()
  })

  it('opens the matching Paper entity and records pending block focus', () => {
    const paper = vaultEntry({
      path: '/vault/papers/vaswani-2017-attention/paper.md',
      filename: 'paper.md',
      title: 'Attention Is All You Need',
      isA: 'Paper',
      properties: { paper_id: 'vaswani-2017-attention' },
    })
    const onSelectPaper = vi.fn()
    const onSelectPaperSection = vi.fn()
    render(
      <HookHarness
        entries={[paper]}
        onSelectPaper={onSelectPaper}
        onSelectPaperSection={onSelectPaperSection}
      />,
    )

    act(() => {
      window.dispatchEvent(new CustomEvent(BLOCK_CITATION_NAVIGATE_EVENT, {
        detail: {
          paperId: 'vaswani-2017-attention',
          blockId: 'b0023',
          label: 'Claim',
        },
      }))
    })

    expect(onSelectPaperSection).toHaveBeenCalledTimes(1)
    expect(onSelectPaper).toHaveBeenCalledWith(paper)
    expect(getPendingBlockFocus()).toEqual({
      paperId: 'vaswani-2017-attention',
      blockId: 'b0023',
      label: 'Claim',
    })
  })

  it('keeps block focus intent when the Paper is not indexed yet', () => {
    const onSelectPaper = vi.fn()
    const onSelectPaperSection = vi.fn()
    render(
      <HookHarness
        entries={[]}
        onSelectPaper={onSelectPaper}
        onSelectPaperSection={onSelectPaperSection}
      />,
    )

    act(() => {
      window.dispatchEvent(new CustomEvent(BLOCK_CITATION_NAVIGATE_EVENT, {
        detail: {
          paperId: 'missing-paper',
          blockId: 'b0001',
        },
      }))
    })

    expect(onSelectPaperSection).not.toHaveBeenCalled()
    expect(onSelectPaper).not.toHaveBeenCalled()
    expect(getPendingBlockFocus()).toEqual({
      paperId: 'missing-paper',
      blockId: 'b0001',
    })
  })

  it('lets the active Project Canvas handle a resolved Paper without opening it standalone', () => {
    const paper = vaultEntry({
      path: '/vault/papers/attention/paper.md',
      filename: 'paper.md',
      title: 'Attention Is All You Need',
      isA: 'Paper',
      properties: { paper_id: 'attention' },
    })
    const onNavigateResolvedPaper = vi.fn(() => true)
    const onSelectPaper = vi.fn()
    const onSelectPaperSection = vi.fn()
    render(
      <HookHarness
        entries={[paper]}
        onNavigateResolvedPaper={onNavigateResolvedPaper}
        onSelectPaper={onSelectPaper}
        onSelectPaperSection={onSelectPaperSection}
      />,
    )

    act(() => {
      window.dispatchEvent(new CustomEvent(BLOCK_CITATION_NAVIGATE_EVENT, {
        detail: { paperId: 'attention', blockId: 'b0042' },
      }))
    })

    expect(onNavigateResolvedPaper).toHaveBeenCalledWith(
      paper,
      { paperId: 'attention', blockId: 'b0042' },
    )
    expect(onSelectPaperSection).not.toHaveBeenCalled()
    expect(onSelectPaper).not.toHaveBeenCalled()
    expect(getPendingBlockFocus()).toEqual({ paperId: 'attention', blockId: 'b0042' })
  })
})
