import { describe, expect, it } from 'vitest'
import {
  PAPER_ANNOTATIONS_FILENAME,
  PAPER_BLOCKS_FILENAME,
  PAPER_NOTE_FILENAME,
  PAPER_SOURCE_PDF_FILENAME,
  buildPaperRelativePaths,
  isPaperNotePath,
  normalizePaperSlug,
} from './paperPaths'

describe('paper path conventions', () => {
  it('normalizes source titles into portable paper slugs', () => {
    expect(normalizePaperSlug('Attention Is All You Need.pdf')).toBe('attention-is-all-you-need-pdf')
    expect(normalizePaperSlug('  Long_Context: Notes 2026  ')).toBe('long-context-notes-2026')
    expect(normalizePaperSlug('!!!')).toBe('paper')
  })

  it('builds the canonical paper bundle paths under papers/<slug>', () => {
    const paths = buildPaperRelativePaths('vaswani-2017-attention')

    expect(paths.paperDir).toBe('papers/vaswani-2017-attention')
    expect(paths.paperNote).toBe(`papers/vaswani-2017-attention/${PAPER_NOTE_FILENAME}`)
    expect(paths.sourcePdf).toBe(`papers/vaswani-2017-attention/${PAPER_SOURCE_PDF_FILENAME}`)
    expect(paths.blocks).toBe(`papers/vaswani-2017-attention/${PAPER_BLOCKS_FILENAME}`)
    expect(paths.annotations).toBe(`papers/vaswani-2017-attention/${PAPER_ANNOTATIONS_FILENAME}`)
  })

  it('identifies canonical Paper notes without treating root paper.md as an instance', () => {
    expect(isPaperNotePath('/vault/papers/vaswani-2017-attention/paper.md')).toBe(true)
    expect(isPaperNotePath('/vault/paper.md')).toBe(false)
    expect(isPaperNotePath('/vault/papers/paper.md')).toBe(false)
  })
})
