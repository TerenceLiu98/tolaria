import { describe, expect, it } from 'vitest'
import { commentTargetsForBlocks } from './commentTargets'
import type { EditorCommentAnchor } from './commentAnchors'

const anchors: EditorCommentAnchor[] = [
  { comments: [], id: 'b0001', title: 'First block' },
  { comments: [{ anchorId: 'b0002', body: 'Existing', id: 'c1', kind: 'comment' }], id: 'b0002', title: 'Second block' },
  { comments: [], id: 'b0003', title: 'Third block' },
]

describe('commentTargetsForBlocks', () => {
  it('keeps commented and open-thread anchors without rendering every block', () => {
    const targets = commentTargetsForBlocks({
      anchors,
      editorBlocks: [{ id: 'b0001' }, { id: 'b0002' }, { id: 'b0003' }],
      selectedAnchorId: 'b0003',
    })

    expect(targets.map((target) => target.anchor.id)).toEqual(['b0002', 'b0003'])
    expect(targets.map((target) => target.blockId)).toEqual(['b0002', 'b0003'])
  })

  it('omits empty anchors from the margin layer unless their thread is open', () => {
    const targets = commentTargetsForBlocks({
      anchors,
      editorBlocks: [{ id: 'b0001' }, { id: 'b0002' }, { id: 'b0003' }],
      selectedAnchorId: null,
    })

    expect(targets.map((target) => target.anchor.id)).toEqual(['b0002'])
  })
})
