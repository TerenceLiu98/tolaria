import { describe, expect, it } from 'vitest'
import { parsePaperMetadata } from './types'

describe('Paper metadata parsing', () => {
  it('extracts the minimal Paper metadata from Markdown frontmatter', () => {
    const metadata = parsePaperMetadata(`---
type: Paper
paper_id: vaswani-2017-attention
title: Attention Is All You Need
year: 2017
status: imported
parse_status: unparsed
source_pdf: source.pdf
blocks: blocks.jsonl
annotations: annotations.jsonl
---
# Attention Is All You Need
`)

    expect(metadata).toEqual({
      type: 'Paper',
      paperId: 'vaswani-2017-attention',
      title: 'Attention Is All You Need',
      year: 2017,
      status: 'imported',
      parseStatus: 'unparsed',
      sourcePdf: 'source.pdf',
      blocks: 'blocks.jsonl',
      annotations: 'annotations.jsonl',
    })
  })

  it('rejects non-Paper notes and incomplete Paper notes', () => {
    expect(parsePaperMetadata('---\ntype: Note\n---\n# Note')).toBeNull()
    expect(parsePaperMetadata('---\ntype: Paper\npaper_id: missing-source\n---\n# Paper')).toBeNull()
  })
})
