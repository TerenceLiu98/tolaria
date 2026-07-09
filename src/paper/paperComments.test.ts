import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PAPER_COMMENT_KINDS,
  commentsForBlock,
  createBlockComment,
  groupCommentsByBlockId,
  isPaperCommentKind,
  parsePaperCommentsJsonl,
  validatePaperComment,
} from './paperComments'

describe('paperComments', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses valid JSONL and preserves unknown fields', () => {
    const result = parsePaperCommentsJsonl(
      '{"id":"ann-1","paper_id":"paper-1","block_id":"b1","kind":"comment","created_at":"2026-07-02T10:15:00Z","source":"fixture"}\n',
      'paper-1',
    )

    expect(result.errors).toEqual([])
    expect(result.state).toBe('ready')
    expect(result.comments[0]).toMatchObject({
      id: 'ann-1',
      paper_id: 'paper-1',
      block_id: 'b1',
      source: 'fixture',
    })
  })

  it('reports malformed lines and missing required fields', () => {
    const result = parsePaperCommentsJsonl(
      '{not json}\n{"id":"ann-1","paper_id":"paper-1","kind":"comment"}\n',
      'paper-1',
    )

    expect(result.comments).toEqual([])
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'malformed_json', line: 1 }),
      expect.objectContaining({ kind: 'missing_required_field', line: 2 }),
      expect.objectContaining({ kind: 'missing_comment_target', line: 2 }),
    ]))
  })

  it('validates comment-only kind conventions and rejects deprecated color', () => {
    for (const kind of PAPER_COMMENT_KINDS) {
      expect(isPaperCommentKind(kind)).toBe(true)
    }

    expect(PAPER_COMMENT_KINDS).toEqual(['comment'])
    expect(isPaperCommentKind('highlight')).toBe(false)

    const result = validatePaperComment({
      id: 'ann-1',
      paper_id: 'paper-1',
      block_id: 'b1',
      kind: 'highlight',
      color: 'important',
      created_at: '2026-07-02T10:15:00Z',
    }, 1, 'paper-1')

    expect(result.comment).toBeNull()
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'invalid_kind' }),
      expect.objectContaining({ kind: 'deprecated_field' }),
    ]))
  })

  it('groups comments by block id', () => {
    const comments = [
      createBlockComment({
        id: 'ann-1',
        paperId: 'paper-1',
        blockId: 'b1',
        kind: 'comment',
        now: new Date('2026-07-02T10:15:00Z'),
      }),
      createBlockComment({
        id: 'ann-2',
        paperId: 'paper-1',
        blockId: 'b2',
        kind: 'comment',
        now: new Date('2026-07-02T10:16:00Z'),
      }),
    ]

    expect(commentsForBlock(comments, 'b1')).toHaveLength(1)
    expect(groupCommentsByBlockId(comments)).toMatchObject({
      b1: [expect.objectContaining({ id: 'ann-1' })],
      b2: [expect.objectContaining({ id: 'ann-2' })],
    })
  })

  it('creates block-level comments with generated ids and timestamps', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1783000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.123456)

    const comment = createBlockComment({
      paperId: 'paper-1',
      blockId: 'b1',
      kind: 'comment',
      note: 'Check later',
      now: new Date('2026-07-02T10:17:00Z'),
    })

    expect(comment).toMatchObject({
      id: 'ann_mr3k5wxs_4fzyo8',
      paper_id: 'paper-1',
      block_id: 'b1',
      kind: 'comment',
      note: 'Check later',
      created_at: '2026-07-02T10:17:00.000Z',
    })
  })
})
