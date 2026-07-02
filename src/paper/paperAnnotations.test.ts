import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PAPER_ANNOTATION_COLORS,
  PAPER_ANNOTATION_KINDS,
  annotationsForBlock,
  createBlockAnnotation,
  groupAnnotationsByBlockId,
  isPaperAnnotationColor,
  isPaperAnnotationKind,
  parsePaperAnnotationsJsonl,
  validatePaperAnnotation,
} from './paperAnnotations'

describe('paperAnnotations', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses valid JSONL and preserves unknown fields', () => {
    const result = parsePaperAnnotationsJsonl(
      '{"id":"ann-1","paper_id":"paper-1","block_id":"b1","kind":"highlight","color":"important","created_at":"2026-07-02T10:15:00Z","source":"fixture"}\n',
      'paper-1',
    )

    expect(result.errors).toEqual([])
    expect(result.state).toBe('ready')
    expect(result.annotations[0]).toMatchObject({
      id: 'ann-1',
      paper_id: 'paper-1',
      block_id: 'b1',
      source: 'fixture',
    })
  })

  it('reports malformed lines and missing required fields', () => {
    const result = parsePaperAnnotationsJsonl(
      '{not json}\n{"id":"ann-1","paper_id":"paper-1","kind":"highlight"}\n',
      'paper-1',
    )

    expect(result.annotations).toEqual([])
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'malformed_json', line: 1 }),
      expect.objectContaining({ kind: 'missing_required_field', line: 2 }),
      expect.objectContaining({ kind: 'missing_annotation_target', line: 2 }),
    ]))
  })

  it('validates kind and color conventions', () => {
    for (const kind of PAPER_ANNOTATION_KINDS) {
      expect(isPaperAnnotationKind(kind)).toBe(true)
    }
    for (const color of PAPER_ANNOTATION_COLORS) {
      expect(isPaperAnnotationColor(color)).toBe(true)
    }

    expect(isPaperAnnotationKind('ink')).toBe(false)
    expect(isPaperAnnotationColor('blue')).toBe(false)

    const result = validatePaperAnnotation({
      id: 'ann-1',
      paper_id: 'paper-1',
      block_id: 'b1',
      kind: 'ink',
      color: 'blue',
      created_at: '2026-07-02T10:15:00Z',
    }, 1, 'paper-1')

    expect(result.annotation).toBeNull()
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'invalid_kind' }),
      expect.objectContaining({ kind: 'invalid_color' }),
    ]))
  })

  it('groups annotations by block id', () => {
    const annotations = [
      createBlockAnnotation({
        id: 'ann-1',
        paperId: 'paper-1',
        blockId: 'b1',
        kind: 'highlight',
        color: 'important',
        now: new Date('2026-07-02T10:15:00Z'),
      }),
      createBlockAnnotation({
        id: 'ann-2',
        paperId: 'paper-1',
        blockId: 'b2',
        kind: 'question',
        color: 'questioning',
        now: new Date('2026-07-02T10:16:00Z'),
      }),
    ]

    expect(annotationsForBlock(annotations, 'b1')).toHaveLength(1)
    expect(groupAnnotationsByBlockId(annotations)).toMatchObject({
      b1: [expect.objectContaining({ id: 'ann-1' })],
      b2: [expect.objectContaining({ id: 'ann-2' })],
    })
  })

  it('creates block-level annotations with generated ids and timestamps', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1783000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.123456)

    const annotation = createBlockAnnotation({
      paperId: 'paper-1',
      blockId: 'b1',
      kind: 'comment',
      color: 'pending',
      note: 'Check later',
      now: new Date('2026-07-02T10:17:00Z'),
    })

    expect(annotation).toMatchObject({
      id: 'ann_mr3k5wxs_4fzyo8',
      paper_id: 'paper-1',
      block_id: 'b1',
      kind: 'comment',
      color: 'pending',
      note: 'Check later',
      created_at: '2026-07-02T10:17:00.000Z',
    })
  })
})
