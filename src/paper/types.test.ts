import { describe, expect, it } from 'vitest'
import { parsePaperMetadata } from './types'

describe('Paper metadata parsing', () => {
  it('extracts the minimal Paper metadata from Markdown frontmatter', () => {
    const metadata = parsePaperMetadata(`---
type: Paper
paper_id: vaswani-2017-attention
title: Attention Is All You Need
year: 2017
authors:
  - "Ashish Vaswani"
venue: NeurIPS
venue_short: NeurIPS
venue_type: conference
publication_date: 2017-12-04
publication_stage: published
doi: "10.5555/3295222.3295349"
arxiv_id: "1706.03762"
metadata_status: ready
metadata_confidence: 0.94
status: imported
parse_status: unparsed
source_pdf: source.pdf
blocks: blocks.jsonl
comments: comments.jsonl
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
      parseError: null,
      sourcePdf: 'source.pdf',
      blocks: 'blocks.jsonl',
      comments: 'comments.jsonl',
      authors: ['Ashish Vaswani'],
      venue: 'NeurIPS',
      venueShort: 'NeurIPS',
      venueType: 'conference',
      publicationDate: '2017-12-04',
      publicationStage: 'published',
      doi: '10.5555/3295222.3295349',
      arxivId: '1706.03762',
      metadataStatus: 'ready',
      metadataConfidence: 0.94,
    })
  })

  it('extracts parse failure detail when present', () => {
    const metadata = parsePaperMetadata(`---
type: Paper
paper_id: failed-paper
source_pdf: source.pdf
parse_status: failed
parse_error: MinerU returned 401 unauthorized
---
# Failed Paper
`)

    expect(metadata?.parseError).toBe('MinerU returned 401 unauthorized')
  })

  it('rejects non-Paper notes and incomplete Paper notes', () => {
    expect(parsePaperMetadata('---\ntype: Note\n---\n# Note')).toBeNull()
    expect(parsePaperMetadata('---\ntype: Paper\npaper_id: missing-source\n---\n# Paper')).toBeNull()
  })
})
