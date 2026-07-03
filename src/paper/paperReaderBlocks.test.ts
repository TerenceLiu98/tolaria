import { describe, expect, it } from 'vitest'
import {
  paperOutlineItems,
  paperSidecarHealth,
  renderedSourceBlockKind,
  searchPaperBlocks,
} from './paperReaderBlocks'
import type { SourceBlock } from './sourceBlocks'

const baseBlock = {
  hash: 'sha256:block',
  page: 1,
  paper_id: 'paper-1',
} satisfies Pick<SourceBlock, 'hash' | 'page' | 'paper_id'>

function block(input: Partial<SourceBlock> & Pick<SourceBlock, 'id' | 'kind'>): SourceBlock {
  return {
    ...baseBlock,
    ...input,
  }
}

describe('paper reader block helpers', () => {
  it('normalizes MinerU block kinds into rendered kinds', () => {
    expect(renderedSourceBlockKind(block({ id: 'b1', kind: 'title' }))).toBe('title')
    expect(renderedSourceBlockKind(block({ id: 'b2', kind: 'header' }))).toBe('heading')
    expect(renderedSourceBlockKind(block({ id: 'b3', kind: 'image' }))).toBe('figure')
    expect(renderedSourceBlockKind(block({ id: 'b4', kind: 'interline_equation' }))).toBe('equation')
    expect(renderedSourceBlockKind(block({ id: 'b5', kind: 'table_caption' }))).toBe('caption')
    expect(renderedSourceBlockKind(block({ id: 'b6', kind: 'text' }))).toBe('paragraph')
  })

  it('builds outline items from titles, headings, and first block on each page', () => {
    const items = paperOutlineItems([
      block({ id: 'b1', kind: 'title', text: 'Paper Title', page: 1 }),
      block({ id: 'b2', kind: 'paragraph', text: 'Abstract prose', page: 1 }),
      block({ id: 'b3', kind: 'paragraph', text: 'New page starts here', page: 2 }),
      block({ id: 'b4', kind: 'heading', text: 'Method', page: 2 }),
    ])

    expect(items).toEqual([
      { blockId: 'b1', depth: 0, label: 'Paper Title', page: 1, section: null },
      { blockId: 'b3', depth: 2, label: 'Page 2', page: 2, section: null },
      { blockId: 'b4', depth: 1, label: 'Method', page: 2, section: null },
    ])
  })

  it('searches text, captions, sections, kind, and id', () => {
    const blocks = [
      block({ id: 'b1', kind: 'paragraph', text: 'Transformer attention' }),
      block({ id: 'b2', kind: 'figure', caption: 'Model overview' }),
      block({ id: 'b3', kind: 'table', section: 'Experiments' }),
    ]

    expect(searchPaperBlocks(blocks, 'overview').map((result) => result.id)).toEqual(['b2'])
    expect(searchPaperBlocks(blocks, 'experiments').map((result) => result.id)).toEqual(['b3'])
    expect(searchPaperBlocks(blocks, 'b1').map((result) => result.id)).toEqual(['b1'])
  })

  it('reports recoverable sidecar health states', () => {
    expect(paperSidecarHealth([], 'ready').isZeroUsableBlocks).toBe(true)
    expect(paperSidecarHealth([block({ id: 'b1', kind: 'paragraph', page: 0 })], 'ready').hasMissingPageNumbers).toBe(true)
    expect(paperSidecarHealth([block({ id: 'b2', kind: 'figure' })], 'ready').hasMinimallyNormalizedBlocks).toBe(true)
  })
})
