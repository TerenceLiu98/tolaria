import { describe, expect, it } from 'vitest'
import {
  editorCommentAnchorForBlock,
  type EditorCommentAnchor,
} from './commentAnchors'

const anchors: EditorCommentAnchor[] = [
  { comments: [], id: 'source-b1', title: 'First source block' },
  { comments: [{ anchorId: 'source-b2', body: 'Check this', id: 'c1', kind: 'comment' }], id: 'source-b2', title: 'Second source block' },
]

describe('commentAnchors', () => {
  it('resolves comment anchors by durable block id first', () => {
    const anchor = editorCommentAnchorForBlock({
      anchors,
      blockId: 'source-b2',
      editorBlocks: [
        { id: 'editor-generated-1' },
        { id: 'editor-generated-2' },
      ],
    })

    expect(anchor?.id).toBe('source-b2')
    expect(anchor?.comments).toHaveLength(1)
  })

  it('falls back to editor block order when the editor id is not the source anchor id', () => {
    const anchor = editorCommentAnchorForBlock({
      anchors,
      blockId: 'editor-generated-2',
      editorBlocks: [
        { id: 'editor-generated-1' },
        { id: 'editor-generated-2' },
      ],
    })

    expect(anchor?.id).toBe('source-b2')
  })

  it('returns null for missing blocks or out-of-range fallback positions', () => {
    expect(editorCommentAnchorForBlock({
      anchors,
      blockId: null,
      editorBlocks: [{ id: 'editor-generated-1' }],
    })).toBeNull()

    expect(editorCommentAnchorForBlock({
      anchors,
      blockId: 'editor-generated-3',
      editorBlocks: [
        { id: 'editor-generated-1' },
        { id: 'editor-generated-2' },
        { id: 'editor-generated-3' },
      ],
    })).toBeNull()
  })
})
