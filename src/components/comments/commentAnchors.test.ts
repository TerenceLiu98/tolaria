import { describe, expect, it } from 'vitest'
import {
  editorCommentAnchorBlockId,
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

  it('resolves explicit target block ids before legacy anchor ids', () => {
    const targetAnchors: EditorCommentAnchor[] = [
      {
        comments: [],
        id: 'quote-anchor-1',
        target: {
          blockId: 'editor-block-1',
          kind: 'text_quote',
          quote: 'quoted evidence',
        },
        title: 'Quoted text',
      },
    ]

    expect(editorCommentAnchorForBlock({
      anchors: targetAnchors,
      blockId: 'editor-block-1',
      editorBlocks: [{ id: 'editor-block-1' }],
    })?.id).toBe('quote-anchor-1')
    expect(editorCommentAnchorBlockId({
      anchor: targetAnchors[0],
      anchors: targetAnchors,
      editorBlocks: [{ id: 'editor-block-1' }],
    })).toBe('editor-block-1')
  })

  it('does not force document-level anchors onto a block', () => {
    const documentAnchor: EditorCommentAnchor = {
      comments: [],
      id: 'document-anchor',
      target: { kind: 'document' },
      title: 'Document comment',
    }

    expect(editorCommentAnchorBlockId({
      anchor: documentAnchor,
      anchors: [documentAnchor],
      editorBlocks: [{ id: 'editor-block-1' }],
    })).toBeNull()
    expect(editorCommentAnchorForBlock({
      anchors: [documentAnchor],
      blockId: 'document-anchor',
      editorBlocks: [{ id: 'editor-block-1' }],
    })).toBeNull()
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
