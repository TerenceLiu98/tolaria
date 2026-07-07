import { describe, expect, it } from 'vitest'
import type { PaperAnnotation } from './annotations'
import {
  activePaperAnnotationReactions,
  activePaperAnnotationReplies,
  addPaperAnnotationReply,
  cleanOptionalCommentText,
  deletePaperAnnotationReply,
  PAPER_COMMENT_REACTION_EMOJI,
  paperAnnotationHasReaction,
  paperAnnotationIsResolved,
  savePaperAnnotationNote,
  togglePaperAnnotationReaction,
  togglePaperAnnotationResolved,
  visiblePaperCommentAnnotations,
} from './paperCommentThreadModel'

function annotation(overrides: Partial<PaperAnnotation> = {}): PaperAnnotation {
  return {
    block_id: 'b0001',
    created_at: '2026-07-01T10:00:00Z',
    id: 'ann-1',
    kind: 'comment',
    note: 'Original note',
    paper_id: 'paper-1',
    ...overrides,
  }
}

describe('paperCommentThreadModel', () => {
  it('normalizes optional comment text', () => {
    expect(cleanOptionalCommentText('  keep me  ')).toBe('keep me')
    expect(cleanOptionalCommentText('   ')).toBeUndefined()
    expect(cleanOptionalCommentText(null)).toBeUndefined()
  })

  it('filters and sorts visible thread annotations', () => {
    const oldResolved = annotation({
      created_at: '2026-07-01T10:00:00Z',
      id: 'old-resolved',
      resolved_at: '2026-07-01T10:30:00Z',
    })
    const updatedOpen = annotation({
      created_at: '2026-07-01T09:00:00Z',
      id: 'updated-open',
      updated_at: '2026-07-01T11:00:00Z',
    })

    expect(visiblePaperCommentAnnotations([oldResolved, updatedOpen], 'all', 'newest').map((item) => item.id))
      .toEqual(['updated-open', 'old-resolved'])
    expect(visiblePaperCommentAnnotations([oldResolved, updatedOpen], 'all', 'oldest').map((item) => item.id))
      .toEqual(['old-resolved', 'updated-open'])
    expect(visiblePaperCommentAnnotations([oldResolved, updatedOpen], 'open', 'newest').map((item) => item.id))
      .toEqual(['updated-open'])
    expect(visiblePaperCommentAnnotations([oldResolved, updatedOpen], 'resolved', 'newest').map((item) => item.id))
      .toEqual(['old-resolved'])
  })

  it('updates note, resolved state, replies, and reactions without mutating deleted records into active UI state', () => {
    const now = new Date('2026-07-02T12:00:00Z')
    const base = annotation({
      reactions: [{ count: 1, deleted_at: '2026-07-02T10:00:00Z', emoji: PAPER_COMMENT_REACTION_EMOJI }],
      replies: [{ deleted_at: '2026-07-02T10:00:00Z', id: 'reply-old', note: 'old' }],
    })

    const saved = savePaperAnnotationNote(base, '  Updated interpretation  ', now)
    expect(saved.note).toBe('Updated interpretation')
    expect(saved.updated_at).toBe('2026-07-02T12:00:00.000Z')

    const resolved = togglePaperAnnotationResolved(saved, now)
    expect(paperAnnotationIsResolved(resolved)).toBe(true)
    expect(togglePaperAnnotationResolved(resolved, now).resolved_at).toBeUndefined()

    const withReply = addPaperAnnotationReply(base, ' Follow up ', now, () => 'ann_reply_next')
    expect(withReply?.replies).toEqual([
      {
        created_at: '2026-07-02T12:00:00.000Z',
        id: 'reply_reply_next',
        note: 'Follow up',
      },
    ])
    expect(activePaperAnnotationReplies(withReply!)).toHaveLength(1)

    const deletedReply = deletePaperAnnotationReply(withReply!, 'reply_reply_next', now)
    expect(activePaperAnnotationReplies(deletedReply)).toEqual([])
    expect(deletedReply.replies?.[0]).toMatchObject({
      deleted_at: '2026-07-02T12:00:00.000Z',
      updated_at: '2026-07-02T12:00:00.000Z',
    })

    const reacted = togglePaperAnnotationReaction(base, PAPER_COMMENT_REACTION_EMOJI, now)
    expect(paperAnnotationHasReaction(reacted, PAPER_COMMENT_REACTION_EMOJI)).toBe(true)
    expect(activePaperAnnotationReactions(reacted)).toEqual([
      {
        count: 1,
        created_at: '2026-07-02T12:00:00.000Z',
        emoji: PAPER_COMMENT_REACTION_EMOJI,
      },
    ])
    expect(activePaperAnnotationReactions(togglePaperAnnotationReaction(reacted, PAPER_COMMENT_REACTION_EMOJI, now)))
      .toEqual([])
  })
})
