import {
  editorCommentAnchorBlockId,
  type EditorCommentAnchor,
} from './commentAnchors'

export interface EditorCommentBlock {
  id: string
}

export interface EditorCommentTarget {
  anchor: EditorCommentAnchor
  blockId: string
}

function uniqueTargets(targets: EditorCommentTarget[]): EditorCommentTarget[] {
  const seen = new Set<string>()
  return targets.filter(({ anchor }) => {
    if (seen.has(anchor.id)) return false
    seen.add(anchor.id)
    return true
  })
}

export function commentTargetsForBlocks({
  anchors,
  editorBlocks,
  selectedAnchorId,
}: {
  anchors: readonly EditorCommentAnchor[]
  editorBlocks: readonly EditorCommentBlock[]
  selectedAnchorId: string | null
}): EditorCommentTarget[] {
  return uniqueTargets(anchors.flatMap((anchor) => {
    const isSelected = anchor.id === selectedAnchorId
    const shouldShow = anchor.comments.length > 0 || isSelected
    if (!shouldShow) return []

    const blockId = editorCommentAnchorBlockId({ anchor, anchors, editorBlocks })
    return blockId ? [{ anchor, blockId }] : []
  }))
}
