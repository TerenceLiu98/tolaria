import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VaultEntry } from '../types'
import {
  BLOCK_CITATION_NAVIGATE_EVENT,
  clearPendingBlockFocus,
  dispatchBlockCitationNavigation,
  findPaperEntryForBlockCitation,
  getPendingBlockFocus,
} from './blockCitationNavigation'

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

describe('block citation navigation', () => {
  afterEach(() => {
    clearPendingBlockFocus()
  })

  it('finds a Paper entry by paper_id frontmatter', () => {
    const paper = vaultEntry({
      path: '/vault/papers/attention/paper.md',
      filename: 'paper.md',
      title: 'Attention',
      isA: 'Paper',
      properties: { paper_id: 'vaswani-2017-attention' },
    })

    expect(findPaperEntryForBlockCitation([vaultEntry({}), paper], 'vaswani-2017-attention')).toBe(paper)
  })

  it('falls back to the Paper bundle path when paper_id is not indexed', () => {
    const paper = vaultEntry({
      path: '/vault/papers/vaswani-2017-attention/paper.md',
      filename: 'paper.md',
      title: 'Attention',
      isA: 'Paper',
    })

    expect(findPaperEntryForBlockCitation([paper], 'vaswani-2017-attention')).toBe(paper)
  })

  it('ignores non-Paper entries with matching paths', () => {
    const note = vaultEntry({
      path: '/vault/papers/vaswani-2017-attention/paper.md',
      filename: 'paper.md',
      title: 'Attention',
      isA: 'Note',
    })

    expect(findPaperEntryForBlockCitation([note], 'vaswani-2017-attention')).toBeNull()
  })

  it('dispatches a navigation event and records pending block focus', () => {
    const listener = vi.fn()
    window.addEventListener(BLOCK_CITATION_NAVIGATE_EVENT, listener)

    dispatchBlockCitationNavigation({
      paperId: 'vaswani-2017-attention',
      blockId: 'b0023',
      label: 'Claim',
    })

    expect(listener).toHaveBeenCalledTimes(1)
    const event = listener.mock.calls[0][0] as CustomEvent
    expect(event.detail).toEqual({
      paperId: 'vaswani-2017-attention',
      blockId: 'b0023',
      label: 'Claim',
    })
    expect(getPendingBlockFocus()).toEqual({
      paperId: 'vaswani-2017-attention',
      blockId: 'b0023',
      label: 'Claim',
    })

    window.removeEventListener(BLOCK_CITATION_NAVIGATE_EVENT, listener)
  })
})
