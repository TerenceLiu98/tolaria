import type { ReactNode } from 'react'
import type { NoteComment } from '../../comments/commentProvider'

interface CommentAnchorEditorBlock {
  id: string
}

export type EditorCommentAnchorTarget =
  | { kind: 'source_block'; blockId?: string }
  | { kind: 'note_block'; blockId: string }
  | { kind: 'text_quote'; blockId?: string; prefix?: string; quote: string; suffix?: string }
  | { kind: 'image'; blockId?: string; path?: string }
  | { kind: 'note_position'; blockId?: string }
  | { kind: 'document' }

export interface EditorCommentAnchor {
  comments: readonly NoteComment[]
  id: string
  target?: EditorCommentAnchorTarget
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

  const exactAnchor = anchors.find((anchor) => anchorBlockId(anchor) === blockId)
  if (exactAnchor) return exactAnchor

  const blockIndex = editorBlocks.findIndex((block) => block.id === blockId)
  return blockIndex >= 0 ? anchors[blockIndex] ?? null : null
}

export function anchorBlockId(anchor: EditorCommentAnchor): string | null {
  if (!anchor.target) return anchor.id

  switch (anchor.target.kind) {
    case 'source_block':
      return anchor.target.blockId ?? anchor.id
    case 'note_block':
    case 'text_quote':
    case 'image':
    case 'note_position':
      return anchor.target.blockId ?? null
    case 'document':
      return null
  }
}

export function editorCommentAnchorBlockId({
  anchor,
  anchors,
  editorBlocks,
}: {
  anchor: EditorCommentAnchor
  anchors: readonly EditorCommentAnchor[]
  editorBlocks: readonly CommentAnchorEditorBlock[]
}): string | null {
  const explicitBlockId = anchorBlockId(anchor)
  if (explicitBlockId && editorBlocks.some((block) => block.id === explicitBlockId)) return explicitBlockId
  if (anchor.target) return null

  const anchorIndex = anchors.findIndex((candidate) => candidate.id === anchor.id)
  return anchorIndex >= 0 ? editorBlocks[anchorIndex]?.id ?? null : null
}
