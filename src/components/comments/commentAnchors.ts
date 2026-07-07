import type { ReactNode } from 'react'
import type { NoteComment } from '../../comments/commentProvider'

interface CommentAnchorEditorBlock {
  id: string
}

export interface EditorCommentAnchor {
  comments: readonly NoteComment[]
  id: string
  title: string
}

export interface EditorCommentOptions {
  anchors: readonly EditorCommentAnchor[]
  onToggleThread: (anchorId: string) => void
  renderThread: (anchorId: string) => ReactNode
  selectedAnchorId: string | null
}

export function editorCommentAnchorForBlock({
  anchors,
  blockId,
  editorBlocks,
}: {
  anchors: readonly EditorCommentAnchor[]
  blockId: string | null | undefined
  editorBlocks: readonly CommentAnchorEditorBlock[]
}): EditorCommentAnchor | null {
  if (!blockId) return null

  const exactAnchor = anchors.find((anchor) => anchor.id === blockId)
  if (exactAnchor) return exactAnchor

  const blockIndex = editorBlocks.findIndex((block) => block.id === blockId)
  return blockIndex >= 0 ? anchors[blockIndex] ?? null : null
}
