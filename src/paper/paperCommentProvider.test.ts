import { describe, expect, it } from 'vitest'
import {
  paperCommentToComment,
  paperCommentAnchorForBlock,
  paperCommentsByBlockId,
} from './paperCommentProvider'
import type { PaperComment } from './comments'
import type { SourceBlock } from './sourceBlocks'

describe('paperCommentProvider', () => {
  const comment: PaperComment = {
    id: 'ann-1',
    paper_id: 'paper-1',
    block_id: 'b0002',
    kind: 'comment',
    note: 'Compare this with the baseline.',
    created_at: '2026-07-03T10:00:00Z',
    replies: [{
      id: 'reply-1',
      note: 'Follow-up evidence.',
      created_at: '2026-07-03T10:05:00Z',
    }],
    reactions: [{
      emoji: '👍',
      count: 1,
      created_at: '2026-07-03T10:06:00Z',
    }],
  }

  it('maps block comments to generic note comments', () => {
    expect(paperCommentToComment(comment)).toEqual(expect.objectContaining({
      anchorId: 'b0002',
      body: 'Compare this with the baseline.',
      id: 'ann-1',
      kind: 'comment',
      reactions: [expect.objectContaining({
        count: 1,
        emoji: '👍',
      })],
      replies: [expect.objectContaining({
        body: 'Follow-up evidence.',
        id: 'reply-1',
      })],
    }))
  })

  it('groups paper comments by block anchor id', () => {
    expect(paperCommentsByBlockId([
      comment,
      { ...comment, id: 'ann-2', block_id: 'b0003', note: 'Second block' },
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
