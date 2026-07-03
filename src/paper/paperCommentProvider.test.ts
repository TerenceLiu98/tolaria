import { describe, expect, it } from 'vitest'
import {
  paperAnnotationToComment,
  paperCommentAnchorForBlock,
  paperCommentsByBlockId,
} from './paperCommentProvider'
import type { PaperAnnotation } from './annotations'
import type { SourceBlock } from './sourceBlocks'

describe('paperCommentProvider', () => {
  const annotation: PaperAnnotation = {
    id: 'ann-1',
    paper_id: 'paper-1',
    block_id: 'b0002',
    kind: 'comment',
    color: 'important',
    note: 'Compare this with the baseline.',
    created_at: '2026-07-03T10:00:00Z',
  }

  it('maps block annotations to generic note comments', () => {
    expect(paperAnnotationToComment(annotation)).toEqual(expect.objectContaining({
      anchorId: 'b0002',
      body: 'Compare this with the baseline.',
      color: 'important',
      id: 'ann-1',
      kind: 'comment',
    }))
  })

  it('groups paper comments by block anchor id', () => {
    expect(paperCommentsByBlockId([
      annotation,
      { ...annotation, id: 'ann-2', block_id: 'b0003', note: 'Second block' },
    ])).toEqual({
      b0002: [expect.objectContaining({ id: 'ann-1' })],
      b0003: [expect.objectContaining({ id: 'ann-2' })],
    })
  })

  it('resolves SourceBlock metadata as a generic comment anchor', () => {
    const block: SourceBlock = {
      id: 'b0002',
      paper_id: 'paper-1',
      kind: 'heading',
      page: 4,
      hash: 'sha256:block',
      text: 'Method',
      section: 'Approach',
    }

    expect(paperCommentAnchorForBlock(block)).toEqual({
      id: 'b0002',
      label: 'Method',
      metadata: {
        kind: 'heading',
        page: 4,
        section: 'Approach',
      },
    })
  })
})
