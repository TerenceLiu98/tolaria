import type { ReactNode } from 'react'
import type { NoteComment } from '../../comments/commentProvider'

export interface EditorCommentAnchor {
  comments: readonly NoteComment[]
  id: string
  title: string
}

export interface EditorCommentOptions {
  anchors: readonly EditorCommentAnchor[]
  onOpenThread: (anchorId: string) => void
  renderThread: (anchorId: string) => ReactNode
  selectedAnchorId: string | null
}
